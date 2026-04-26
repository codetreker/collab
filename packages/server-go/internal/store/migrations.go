package store

import (
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

func (s *Store) Migrate() error {
	// Disable FK constraints during migration to avoid issues with table recreation
	s.db.Exec("PRAGMA foreign_keys = OFF")

	if err := s.db.AutoMigrate(
		&User{},
		&ChannelGroup{},
		&Channel{},
		&Message{},
		&ChannelMember{},
		&Mention{},
		&Event{},
		&UserPermission{},
		&InviteCode{},
		&MessageReaction{},
		&WorkspaceFile{},
		&RemoteNode{},
		&RemoteBinding{},
	); err != nil {
		s.db.Exec("PRAGMA foreign_keys = ON")
		return fmt.Errorf("auto migrate: %w", err)
	}

	// Re-enable FK constraints after migration
	s.db.Exec("PRAGMA foreign_keys = ON")

	if err := s.seedBootstrapAdmin(); err != nil {
		return fmt.Errorf("seed admin: %w", err)
	}

	if err := s.backfillDefaultPermissions(); err != nil {
		return fmt.Errorf("backfill permissions: %w", err)
	}

	if err := s.backfillCreatorChannelPermissions(); err != nil {
		return fmt.Errorf("backfill creator perms: %w", err)
	}

	if err := s.backfillAgentOwnerID(); err != nil {
		return fmt.Errorf("backfill agent owner: %w", err)
	}

	if err := s.backfillPositions(); err != nil {
		return fmt.Errorf("backfill positions: %w", err)
	}

	if err := s.cleanupDuplicateDMs(); err != nil {
		return fmt.Errorf("cleanup duplicate DMs: %w", err)
	}

	if err := s.cleanupDMExtraMembers(); err != nil {
		return fmt.Errorf("cleanup DM members: %w", err)
	}

	return nil
}

func (s *Store) seedBootstrapAdmin() error {
	email := os.Getenv("ADMIN_EMAIL")
	password := os.Getenv("ADMIN_PASSWORD")
	if email == "" || password == "" {
		return nil
	}

	var count int64
	s.db.Model(&User{}).Where("email = ?", email).Count(&count)
	if count > 0 {
		return nil
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	now := time.Now().UnixMilli()
	user := User{
		ID:           uuid.NewString(),
		DisplayName:  "Admin",
		Role:         "admin",
		Email:        &email,
		PasswordHash: string(hash),
		CreatedAt:    now,
	}
	return s.db.Create(&user).Error
}

func (s *Store) backfillDefaultPermissions() error {
	memberPerms := []string{"channel.create", "message.send", "agent.manage"}
	agentPerms := []string{"message.send"}

	var members []User
	s.db.Where("role = ? AND deleted_at IS NULL", "member").Find(&members)

	now := time.Now().UnixMilli()
	for _, u := range members {
		for _, p := range memberPerms {
			perm := UserPermission{UserID: u.ID, Permission: p, Scope: "*", GrantedAt: now}
			s.db.Where("user_id = ? AND permission = ? AND scope = ?", u.ID, p, "*").FirstOrCreate(&perm)
		}
	}

	var agents []User
	s.db.Where("role = ? AND deleted_at IS NULL", "agent").Find(&agents)

	for _, u := range agents {
		for _, p := range agentPerms {
			perm := UserPermission{UserID: u.ID, Permission: p, Scope: "*", GrantedAt: now}
			s.db.Where("user_id = ? AND permission = ? AND scope = ?", u.ID, p, "*").FirstOrCreate(&perm)
		}
	}

	return nil
}

func (s *Store) backfillCreatorChannelPermissions() error {
	var channels []Channel
	s.db.Where("deleted_at IS NULL").Find(&channels)

	now := time.Now().UnixMilli()
	for _, ch := range channels {
		for _, p := range []string{"channel.delete", "channel.manage_members", "channel.manage_visibility"} {
			scope := "channel:" + ch.ID
			perm := UserPermission{UserID: ch.CreatedBy, Permission: p, Scope: scope, GrantedAt: now}
			s.db.Where("user_id = ? AND permission = ? AND scope = ?", ch.CreatedBy, p, scope).FirstOrCreate(&perm)
		}
	}

	return nil
}

func (s *Store) backfillAgentOwnerID() error {
	var firstAdmin User
	err := s.db.Where("role = ? AND deleted_at IS NULL", "admin").Order("created_at ASC").First(&firstAdmin).Error
	if err != nil {
		return nil
	}

	s.db.Model(&User{}).
		Where("role = ? AND owner_id IS NULL AND deleted_at IS NULL", "agent").
		Update("owner_id", firstAdmin.ID)

	return nil
}

func (s *Store) backfillPositions() error {
	var channels []Channel
	s.db.Where("deleted_at IS NULL AND (position = ? OR position = ?)", "0|aaaaaa", "").Find(&channels)

	if len(channels) == 0 {
		return nil
	}

	items := make([]RankItem, len(channels))
	for i, ch := range channels {
		items[i] = RankItem{ID: ch.ID, Rank: ch.Position}
	}

	results := Rebalance(items)
	for _, r := range results {
		s.db.Model(&Channel{}).Where("id = ?", r.ID).Update("position", r.NewRank)
	}

	return nil
}

func (s *Store) cleanupDuplicateDMs() error {
	var dmChannels []Channel
	s.db.Where("type = ? AND deleted_at IS NULL", "dm").Order("created_at ASC").Find(&dmChannels)

	seen := map[string]string{}
	for _, ch := range dmChannels {
		normalizedName := normalizeDMName(ch.Name)
		if _, exists := seen[normalizedName]; exists {
			s.db.Where("channel_id = ?", ch.ID).Delete(&Message{})
			s.db.Where("channel_id = ?", ch.ID).Delete(&ChannelMember{})
			s.db.Where("channel_id = ?", ch.ID).Delete(&Mention{})
			s.db.Where("channel_id = ?", ch.ID).Delete(&Event{})
			now := time.Now().UnixMilli()
			s.db.Model(&Channel{}).Where("id = ?", ch.ID).Update("deleted_at", now)
		} else {
			seen[normalizedName] = ch.ID
		}
	}

	return nil
}

func (s *Store) cleanupDMExtraMembers() error {
	var dmChannels []Channel
	s.db.Where("type = ? AND deleted_at IS NULL", "dm").Find(&dmChannels)

	for _, ch := range dmChannels {
		uids := parseDMUserIDs(ch.Name)
		if len(uids) != 2 {
			continue
		}

		allowed := map[string]bool{uids[0]: true, uids[1]: true}

		var members []ChannelMember
		s.db.Where("channel_id = ?", ch.ID).Find(&members)

		for _, m := range members {
			if !allowed[m.UserID] {
				s.db.Where("channel_id = ? AND user_id = ?", ch.ID, m.UserID).Delete(&ChannelMember{})
			}
		}
	}

	return nil
}

func normalizeDMName(name string) string {
	parts := parseDMUserIDs(name)
	if len(parts) != 2 {
		return name
	}
	sort.Strings(parts)
	return "dm:" + parts[0] + "_" + parts[1]
}

func parseDMUserIDs(name string) []string {
	if !strings.HasPrefix(name, "dm:") {
		return nil
	}
	rest := strings.TrimPrefix(name, "dm:")
	parts := strings.SplitN(rest, "_", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return nil
	}
	return parts
}
