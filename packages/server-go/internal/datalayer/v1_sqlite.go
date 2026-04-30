// DL-1 — concrete v1 implementations wrapping existing store.Store.
//
// 立场 ② (DL-1 spec §0): factory pattern + DI seam 单源, 跟 BPP-3
// PluginFrameDispatcher / reasons.IsValid SSOT 同精神.
//
// v1 wrap byte-identical 不破: handler 走 Repository interface, 内部
// 转发到 store.Store 既有方法. 错误透传 (gorm.ErrRecordNotFound 转
// ErrRepositoryNotFound 单源).

package datalayer

import (
	"context"
	"errors"
	"fmt"

	"borgee-server/internal/presence"
	"borgee-server/internal/store"

	"gorm.io/gorm"
)

// ----- UserRepository v1 (sqlite wrap) -----

type sqliteUserRepo struct{ s *store.Store }

func NewSQLiteUserRepository(s *store.Store) UserRepository { return &sqliteUserRepo{s: s} }

func (r *sqliteUserRepo) GetByID(_ context.Context, id string) (*store.User, error) {
	u, err := r.s.GetUserByID(id)
	return u, mapGormErr(err)
}
func (r *sqliteUserRepo) GetByEmail(_ context.Context, email string) (*store.User, error) {
	u, err := r.s.GetUserByEmail(email)
	return u, mapGormErr(err)
}
func (r *sqliteUserRepo) GetByAPIKey(_ context.Context, apiKey string) (*store.User, error) {
	u, err := r.s.GetUserByAPIKey(apiKey)
	return u, mapGormErr(err)
}
func (r *sqliteUserRepo) GetByDisplayName(_ context.Context, displayName string) (*store.User, error) {
	u, err := r.s.GetUserByDisplayName(displayName)
	return u, mapGormErr(err)
}
func (r *sqliteUserRepo) Create(_ context.Context, user *store.User) error {
	return r.s.CreateUser(user)
}

// ----- ChannelRepository v1 -----

type sqliteChannelRepo struct{ s *store.Store }

func NewSQLiteChannelRepository(s *store.Store) ChannelRepository { return &sqliteChannelRepo{s: s} }

func (r *sqliteChannelRepo) GetByID(_ context.Context, id string) (*store.Channel, error) {
	c, err := r.s.GetChannelByID(id)
	return c, mapGormErr(err)
}
func (r *sqliteChannelRepo) GetByName(_ context.Context, name string) (*store.Channel, error) {
	c, err := r.s.GetChannelByName(name)
	return c, mapGormErr(err)
}
func (r *sqliteChannelRepo) GetByNameInOrg(_ context.Context, orgID, name string) (*store.Channel, error) {
	c, err := r.s.GetChannelByNameInOrg(orgID, name)
	return c, mapGormErr(err)
}
func (r *sqliteChannelRepo) Create(_ context.Context, ch *store.Channel) error {
	return r.s.CreateChannel(ch)
}

// ----- MessageRepository v1 -----

type sqliteMessageRepo struct{ s *store.Store }

func NewSQLiteMessageRepository(s *store.Store) MessageRepository {
	return &sqliteMessageRepo{s: s}
}

func (r *sqliteMessageRepo) GetByID(_ context.Context, id string) (*store.Message, error) {
	m, err := r.s.GetMessageByID(id)
	return m, mapGormErr(err)
}
func (r *sqliteMessageRepo) Create(_ context.Context, msg *store.Message) error {
	return r.s.CreateMessage(msg)
}

// ----- PresenceStore v1 (wrap presence.PresenceTracker) -----

type inMemoryPresence struct{ pt presence.PresenceTracker }

// NewInMemoryPresence wraps an existing presence.PresenceTracker (e.g.
// presence.NewSessionsTracker). Returns ErrRepositoryNotFound never
// (presence.PresenceTracker can't fail; method signature accepts ctx for
// future-proofing v3+ Redis path).
func NewInMemoryPresence(pt presence.PresenceTracker) PresenceStore {
	return &inMemoryPresence{pt: pt}
}

func (p *inMemoryPresence) IsOnline(_ context.Context, userID string) (bool, error) {
	return p.pt.IsOnline(userID), nil
}
func (p *inMemoryPresence) Sessions(_ context.Context, userID string) ([]string, error) {
	return p.pt.Sessions(userID), nil
}

// ----- Storage v1 (DB-backed placeholder) -----
//
// v1: artifacts go thru store.Store directly via gorm; this Storage interface
// is wired but its concrete impl is an opaque-key placeholder pending
// follow-up DL-1.5 (when artifact body extraction is needed).

type localDBStorage struct{ s *store.Store }

func NewLocalDBStorage(s *store.Store) Storage { return &localDBStorage{s: s} }

func (l *localDBStorage) GetURL(_ context.Context, key string) (string, error) {
	if key == "" {
		return "", ErrStorageKeyNotFound
	}
	// v1 占位: artifact body 走 Repository (留 DL-1.5 follow-up). 现 caller
	// 没真消费 Storage.GetURL, 锁 interface 不锁实现.
	return fmt.Sprintf("db://artifact/%s", key), nil
}
func (l *localDBStorage) PutBlob(_ context.Context, key string, _ []byte) error {
	if key == "" {
		return ErrStorageKeyNotFound
	}
	// v1 占位: artifact body write 走 store.Store.UpdateArtifact* 直查;
	// caller 没真消费 PutBlob, 留 DL-1.5 wire.
	return nil
}
func (l *localDBStorage) Delete(_ context.Context, key string) error {
	if key == "" {
		return ErrStorageKeyNotFound
	}
	// v1: forward-only audit, 不真删 row; 跟 ADM-3 audit-forward-only 同精神.
	return nil
}

// ----- EventBus v1 (in-process map + buffered chan) -----

type inProcessEventBus struct {
	subs map[string][]chan Event
}

func NewInProcessEventBus() EventBus {
	return &inProcessEventBus{subs: make(map[string][]chan Event)}
}

func (b *inProcessEventBus) Publish(_ context.Context, topic string, payload []byte) error {
	for _, ch := range b.subs[topic] {
		select {
		case ch <- Event{Topic: topic, Payload: payload}:
		default:
			// best-effort: subscriber buffer 满则 drop (跟 BPP-4 dead_letter
			// 立场承袭, RT-1.3 cursor replay 兜底).
		}
	}
	return nil
}
func (b *inProcessEventBus) Subscribe(ctx context.Context, topic string) (<-chan Event, error) {
	ch := make(chan Event, 16)
	b.subs[topic] = append(b.subs[topic], ch)
	go func() {
		<-ctx.Done()
		close(ch)
	}()
	return ch, nil
}

// ----- helpers -----

func mapGormErr(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrRepositoryNotFound
	}
	return err
}
