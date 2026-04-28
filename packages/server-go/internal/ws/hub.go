package ws

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"borgee-server/internal/config"
	"borgee-server/internal/presence"
	"borgee-server/internal/store"
)

type EventBroadcaster interface {
	BroadcastEventToChannel(channelID string, eventType string, payload any)
	BroadcastEventToAll(eventType string, payload any)
	SignalNewEvents()
}

type Hub struct {
	store   *store.Store
	logger  *slog.Logger
	config  *config.Config
	handler http.Handler

	cmdStore *CommandStore

	clients     map[*Client]bool
	onlineUsers map[string]map[*Client]bool

	plugins map[string]*PluginConn
	remotes map[string]*RemoteConn

	eventWaiters   map[chan struct{}]struct{}
	eventWaitersMu sync.Mutex

	// cursors fronts the RT-1.1 (#269) artifact_updated push frame: it
	// hands out monotonic cursors seeded from the durable events table
	// (so a restart never rolls the sequence back) and dedups re-emits
	// of the same (artifact_id, version) tuple to the same cursor.
	cursors *CursorAllocator

	// presenceWriter (AL-3.2) is the write end of the PresenceTracker
	// contract (#277 read-locked + AL-3.2 write split). Register /
	// Unregister fan in TrackOnline / TrackOffline so the
	// presence_sessions table is the single source of truth for "user
	// X is reachable right now". May be nil in unit tests that don't
	// need DB-backed presence; the lifecycle hook no-ops cleanly.
	presenceWriter presence.PresenceWriter

	mu sync.RWMutex
}

func NewHub(s *store.Store, logger *slog.Logger, cfg *config.Config) *Hub {
	return &Hub{
		store:        s,
		logger:       logger,
		config:       cfg,
		cmdStore:     NewCommandStore(),
		clients:      make(map[*Client]bool),
		onlineUsers:  make(map[string]map[*Client]bool),
		plugins:      make(map[string]*PluginConn),
		remotes:      make(map[string]*RemoteConn),
		eventWaiters: make(map[chan struct{}]struct{}),
		cursors:      NewCursorAllocator(s),
	}
}

func (h *Hub) SetHandler(handler http.Handler) {
	h.handler = handler
}

// SetPresenceWriter wires the AL-3.2 write end after construction (the
// store/DB handle is built later in the boot order than NewHub). Safe
// to call once at boot; if never called, the lifecycle hook no-ops and
// presence_sessions stays empty (single-binary unit tests path).
func (h *Hub) SetPresenceWriter(w presence.PresenceWriter) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.presenceWriter = w
}

func (h *Hub) Register(c *Client) {
	h.mu.Lock()
	h.clients[c] = true
	if h.onlineUsers[c.userID] == nil {
		h.onlineUsers[c.userID] = make(map[*Client]bool)
	}
	wasOffline := len(h.onlineUsers[c.userID]) == 0
	h.onlineUsers[c.userID][c] = true
	pw := h.presenceWriter
	h.mu.Unlock()

	if wasOffline {
		h.logger.Info("user online", "user_id", c.userID)
	}
	// AL-3.2: write the presence_sessions row so DM-2.2 fallback +
	// sidebar 渲染 see this session. Failure is logged but does NOT
	// abort the connection — in-memory hub state is still authoritative
	// for live broadcast; presence_sessions is the read-side cache for
	// other subsystems and a transient DB hiccup must not deny service.
	if pw != nil {
		if err := pw.TrackOnline(c.userID, c.sessionID, c.agentID); err != nil {
			h.logger.Warn("presence TrackOnline failed", "user_id", c.userID, "session_id", c.sessionID, "err", err)
		}
	}
}

func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	delete(h.clients, c)
	if clients, ok := h.onlineUsers[c.userID]; ok {
		delete(clients, c)
		if len(clients) == 0 {
			delete(h.onlineUsers, c.userID)
			h.logger.Info("user offline", "user_id", c.userID)
		}
	}
	pw := h.presenceWriter
	h.mu.Unlock()

	// AL-3.2: drop the presence_sessions row. multi-session last-wins
	// is enforced at the row level — only the close of the last live
	// session removes the final row, which IsOnline reads as offline.
	// Unknown sessionID is a soft no-op so panic-driven defer cleanups
	// don't blow up if Register hadn't run yet.
	if pw != nil && c.sessionID != "" {
		if err := pw.TrackOffline(c.sessionID); err != nil {
			h.logger.Warn("presence TrackOffline failed", "session_id", c.sessionID, "err", err)
		}
	}
}

func (h *Hub) BroadcastToChannel(channelID string, payload any, exclude *Client) {
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		if c == exclude {
			continue
		}
		if c.IsSubscribed(channelID) {
			c.Send(data)
		}
	}
}

func (h *Hub) BroadcastToUser(userID string, payload any) {
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.onlineUsers[userID] {
		c.Send(data)
	}
}

func (h *Hub) BroadcastToAll(payload any) {
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		c.Send(data)
	}
}

func (h *Hub) UnsubscribeUserFromChannel(userID, channelID string) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.onlineUsers[userID] {
		c.Unsubscribe(channelID)
	}
}

func (h *Hub) GetOnlineUserIDs() []string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	ids := make([]string, 0, len(h.onlineUsers))
	for id := range h.onlineUsers {
		ids = append(ids, id)
	}
	return ids
}

func (h *Hub) SignalNewEvents() {
	h.eventWaitersMu.Lock()
	for ch := range h.eventWaiters {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
	h.eventWaitersMu.Unlock()
}

func (h *Hub) SubscribeEvents() chan struct{} {
	ch := make(chan struct{}, 1)
	h.eventWaitersMu.Lock()
	h.eventWaiters[ch] = struct{}{}
	h.eventWaitersMu.Unlock()
	return ch
}

func (h *Hub) UnsubscribeEvents(ch chan struct{}) {
	h.eventWaitersMu.Lock()
	delete(h.eventWaiters, ch)
	h.eventWaitersMu.Unlock()
}

func (h *Hub) BroadcastEventToChannel(channelID string, eventType string, payload any) {
	h.BroadcastToChannel(channelID, map[string]any{
		"type": eventType,
		"data": payload,
	}, nil)
	h.SignalNewEvents()
}

func (h *Hub) BroadcastEventToAll(eventType string, payload any) {
	h.BroadcastToAll(map[string]any{
		"type": eventType,
		"data": payload,
	})
	h.SignalNewEvents()
}

// PushAgentInvitationPending / PushAgentInvitationDecided are the RT-0
// (#40) entry points for shipping the agent_invitation_{pending,decided}
// frames defined in docs/blueprint/realtime.md §2.3.
//
// Why two typed methods (not one `Push(frame any)`): the review prep
// (docs/qa/rt-0-server-review-prep.md §S2 + 拒收红线) makes 编译期 schema
// 锁 a hardline — `interface{}` would let a typo pass `go build`. The
// frame structs in event_schemas.go are the only callable shapes.
//
// Behaviour:
//   - frame is delivered to every live client of `userID` (multi-device
//     parity per realtime.md §1.4 — A 全推默认).
//   - if `userID` has no live sessions it's a silent no-op; the row
//     persisted by the handler is the source of truth and the client
//     will reconcile on next reconnect / bell-poll fallback.
//   - SignalNewEvents fires so /events long-poll waiters wake up in
//     step (parity with BroadcastEventTo*).
//
// Phase 4 BPP cutover: callers stay the same; the implementation swaps
// `BroadcastToUser` for `bpp.SendFrame` and the schema is unchanged.
func (h *Hub) PushAgentInvitationPending(userID string, frame *AgentInvitationPendingFrame) {
	if userID == "" || frame == nil {
		return
	}
	h.BroadcastToUser(userID, frame)
	h.SignalNewEvents()
}

func (h *Hub) PushAgentInvitationDecided(userID string, frame *AgentInvitationDecidedFrame) {
	if userID == "" || frame == nil {
		return
	}
	h.BroadcastToUser(userID, frame)
	h.SignalNewEvents()
}

// PushArtifactUpdated is the RT-1.1 entry point for the
// `artifact_updated` push frame. Callers (CV-1 commit handlers) supply
// the (artifact_id, version, channel_id, updated_at, kind) tuple; this
// method:
//
//  1. allocates a monotonic cursor (or returns the existing one for a
//     re-emit of the same artifact+version, fail-closed dedup);
//  2. on a fresh allocation, broadcasts the frame to every member of
//     the channel + signals long-poll waiters so /events catches up;
//  3. on a duplicate allocation, suppresses the broadcast — the
//     original frame is already in flight / persisted under the same
//     cursor and resending would break client dedup (RT-1.2).
//
// The returned cursor is the value that landed in the frame (whether
// fresh or deduped) so the caller can persist it alongside the
// artifact row for backfill.
func (h *Hub) PushArtifactUpdated(artifactID string, version int64, channelID string, updatedAt int64, kind string) (cursor int64, sent bool) {
	if h.cursors == nil {
		return 0, false
	}
	cur, fresh := h.cursors.AllocateForArtifact(artifactID, version)
	if !fresh {
		return cur, false
	}
	frame := ArtifactUpdatedFrame{
		Type:       FrameTypeArtifactUpdated,
		Cursor:     cur,
		ArtifactID: artifactID,
		Version:    version,
		ChannelID:  channelID,
		UpdatedAt:  updatedAt,
		Kind:       kind,
	}
	if channelID == "" {
		h.BroadcastToAll(frame)
	} else {
		h.BroadcastToChannel(channelID, frame, nil)
	}
	h.SignalNewEvents()
	return cur, true
}

// CursorAllocator exposes the monotonic cursor allocator for the
// /events backfill long-poll path so it can report the server's
// current high-water mark to reconnecting clients (RT-1.2).
func (h *Hub) CursorAllocator() *CursorAllocator {
	return h.cursors
}

func (h *Hub) CommandStore() *CommandStore {
	return h.cmdStore
}

func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

func (h *Hub) Store() *store.Store {
	return h.store
}

func (h *Hub) Config() *config.Config {
	return h.config
}

func (h *Hub) StartHeartbeat(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			h.mu.RLock()
			for c := range h.clients {
				if !c.CheckAlive() {
					go func(cl *Client) {
						cl.Close()
					}(c)
				} else {
					c.SendPing()
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) RegisterPlugin(agentID string, pc *PluginConn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.plugins[agentID] = pc
}

func (h *Hub) UnregisterPlugin(agentID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.plugins, agentID)
}

func (h *Hub) GetPlugin(agentID string) *PluginConn {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.plugins[agentID]
}

func (h *Hub) RegisterRemote(nodeID string, rc *RemoteConn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.remotes[nodeID] = rc
}

func (h *Hub) UnregisterRemote(nodeID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.remotes, nodeID)
}

func (h *Hub) GetRemote(nodeID string) *RemoteConn {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.remotes[nodeID]
}
