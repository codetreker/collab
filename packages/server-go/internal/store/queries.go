package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"time"
	"unicode"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ChannelWithCounts struct {
	ID            string  `json:"id"`
	Name          string  `json:"name"`
	Topic         string  `json:"topic"`
	Visibility    string  `json:"visibility"`
	CreatedAt     int64   `json:"created_at"`
	CreatedBy     string  `json:"created_by"`
	Type          string  `json:"type"`
	DeletedAt     *int64  `json:"deleted_at,omitempty"`
	Position      string  `json:"position"`
	GroupID       *string `json:"group_id"`
	MemberCount   int     `json:"member_count"`
	UnreadCount   int     `json:"unread_count"`
	LastMessageAt *int64  `json:"last_message_at,omitempty"`
	IsMember      bool    `json:"is_member"`
}

type ChannelMemberInfo struct {
	UserID      string `json:"user_id"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
	AvatarURL   string `json:"avatar_url"`
	JoinedAt    int64  `json:"joined_at"`
}

type PreviewMessage struct {
	ID          string  `json:"id"`
	Content     string  `json:"content"`
	ContentType string  `json:"content_type"`
	CreatedAt   int64   `json:"created_at"`
	SenderID    string  `json:"sender_id"`
	SenderName  string  `json:"sender_name"`
	ReplyToID   *string `json:"reply_to_id,omitempty"`
}

type DmChannelInfo struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	CreatedAt   int64          `json:"created_at"`
	Peer        DmPeer         `json:"peer"`
	UnreadCount int            `json:"unread_count"`
	LastMessage *DmLastMessage `json:"last_message,omitempty"`
}

type DmPeer struct {
	ID          string `json:"id"`
	DisplayName string `json:"display_name"`
	AvatarURL   string `json:"avatar_url"`
	Role        string `json:"role"`
}

type DmLastMessage struct {
	Content   string `json:"content"`
	CreatedAt int64  `json:"created_at"`
	SenderID  string `json:"sender_id"`
}

var mentionIDRegex = regexp.MustCompile(`<@([^>]+)>`)

// parseMentionIDs extracts user IDs from <@userId> tokens in content.
func parseMentionIDs(content string) []string {
	matches := mentionIDRegex.FindAllStringSubmatch(content, -1)
	var ids []string
	for _, m := range matches {
		if len(m) > 1 {
			ids = append(ids, m[1])
		}
	}
	return ids
}

// parseMentionNames extracts user IDs from @displayName tokens in content.
func (s *Store) parseMentionNames(content string) []string {
	var ids []string
	// Simple scanner: find @word sequences
	i := 0
	for i < len(content) {
		if content[i] == '@' && (i == 0 || content[i-1] == ' ' || content[i-1] == '\n') {
			j := i + 1
			for j < len(content) {
				r := rune(content[j])
				if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_' {
					j++
				} else {
					break
				}
			}
			name := content[i+1 : j]
			if name != "" {
				if user, err := s.GetUserByDisplayName(name); err == nil {
					ids = append(ids, user.ID)
				}
			}
			i = j
		} else {
			i++
		}
	}
	return ids
}

// dedup returns a deduplicated slice preserving order.
func dedup(in []string) []string {
	seen := make(map[string]bool, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}

func (s *Store) GetUserByEmail(email string) (*User, error) {
	var user User
	err := s.db.Where("email = ? AND deleted_at IS NULL", email).First(&user).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *Store) GetUserByID(id string) (*User, error) {
	var user User
	err := s.db.Where("id = ? AND deleted_at IS NULL", id).First(&user).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *Store) GetUserByAPIKey(apiKey string) (*User, error) {
	var user User
	err := s.db.Where("api_key = ? AND deleted_at IS NULL", apiKey).First(&user).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *Store) CreateUser(user *User) error {
	if user.ID == "" {
		user.ID = uuid.NewString()
	}
	if user.CreatedAt == 0 {
		user.CreatedAt = time.Now().UnixMilli()
	}
	return s.db.Create(user).Error
}

func (s *Store) ListUsers() ([]User, error) {
	var users []User
	err := s.db.Where("deleted_at IS NULL").Find(&users).Error
	return users, err
}

func (s *Store) GetInviteCode(code string) (*InviteCode, error) {
	var ic InviteCode
	err := s.db.Where("code = ?", code).First(&ic).Error
	if err != nil {
		return nil, err
	}
	return &ic, nil
}

func (s *Store) ConsumeInviteCode(code string, userID string) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		var ic InviteCode
		if err := tx.Where("code = ?", code).First(&ic).Error; err != nil {
			return err
		}
		if ic.UsedBy != nil {
			return errors.New("invite code already used")
		}
		now := time.Now().UnixMilli()
		if ic.ExpiresAt != nil && *ic.ExpiresAt < now {
			return errors.New("invite code expired")
		}
		return tx.Model(&InviteCode{}).Where("code = ?", code).Updates(map[string]any{
			"used_by": userID,
			"used_at": now,
		}).Error
	})
}

func (s *Store) ListUserPermissions(userID string) ([]UserPermission, error) {
	var perms []UserPermission
	err := s.db.Where("user_id = ?", userID).Find(&perms).Error
	return perms, err
}

func (s *Store) GrantPermission(perm *UserPermission) error {
	if perm.GrantedAt == 0 {
		perm.GrantedAt = time.Now().UnixMilli()
	}
	return s.db.
		Where("user_id = ? AND permission = ? AND scope = ?", perm.UserID, perm.Permission, perm.Scope).
		FirstOrCreate(perm).Error
}

func (s *Store) CreateChannel(ch *Channel) error {
	if ch.ID == "" {
		ch.ID = uuid.NewString()
	}
	if ch.CreatedAt == 0 {
		ch.CreatedAt = time.Now().UnixMilli()
	}
	return s.db.Create(ch).Error
}

func (s *Store) ListChannels() ([]Channel, error) {
	var channels []Channel
	err := s.db.Where("deleted_at IS NULL").Find(&channels).Error
	return channels, err
}

func (s *Store) GetChannelByID(id string) (*Channel, error) {
	var ch Channel
	err := s.db.Where("id = ? AND deleted_at IS NULL", id).First(&ch).Error
	if err != nil {
		return nil, err
	}
	return &ch, nil
}

func (s *Store) ListChannelMembers(channelID string) ([]ChannelMember, error) {
	var members []ChannelMember
	err := s.db.Where("channel_id = ?", channelID).Find(&members).Error
	return members, err
}

func (s *Store) AddChannelMember(member *ChannelMember) error {
	if member.JoinedAt == 0 {
		member.JoinedAt = time.Now().UnixMilli()
	}
	return s.db.
		Where("channel_id = ? AND user_id = ?", member.ChannelID, member.UserID).
		FirstOrCreate(member).Error
}

func (s *Store) RemoveChannelMember(channelID, userID string) error {
	return s.db.Where("channel_id = ? AND user_id = ?", channelID, userID).Delete(&ChannelMember{}).Error
}

func (s *Store) CreateMessage(msg *Message) error {
	if msg.ID == "" {
		msg.ID = uuid.NewString()
	}
	if msg.CreatedAt == 0 {
		msg.CreatedAt = time.Now().UnixMilli()
	}
	return s.db.Create(msg).Error
}

func (s *Store) GetMessageByID(id string) (*Message, error) {
	var msg Message
	err := s.db.Where("id = ? AND deleted_at IS NULL", id).First(&msg).Error
	if err != nil {
		return nil, err
	}
	return &msg, nil
}

func (s *Store) CreateEvent(event *Event) error {
	if event.CreatedAt == 0 {
		event.CreatedAt = time.Now().UnixMilli()
	}
	return s.db.Create(event).Error
}

func (s *Store) CreateMention(mention *Mention) error {
	if mention.ID == "" {
		mention.ID = uuid.NewString()
	}
	return s.db.Create(mention).Error
}

func (s *Store) AddUserToPublicChannels(userID string) error {
	var channels []Channel
	if err := s.db.Where("visibility = ? AND deleted_at IS NULL", "public").Find(&channels).Error; err != nil {
		return err
	}
	for _, ch := range channels {
		member := &ChannelMember{ChannelID: ch.ID, UserID: userID, JoinedAt: time.Now().UnixMilli()}
		s.db.Where("channel_id = ? AND user_id = ?", ch.ID, userID).FirstOrCreate(member)
	}
	return nil
}

func (s *Store) GrantDefaultPermissions(userID string, role string) error {
	var perms []string
	switch role {
	case "member":
		perms = []string{"channel.create", "message.send", "agent.manage"}
	case "agent":
		perms = []string{"message.send"}
	default:
		return nil
	}
	now := time.Now().UnixMilli()
	for _, p := range perms {
		perm := &UserPermission{UserID: userID, Permission: p, Scope: "*", GrantedAt: now}
		if err := s.GrantPermission(perm); err != nil {
			return err
		}
	}
	return nil
}

// ─── Messages ───────────────────────────────────────────

// MessageWithSender is a Message with the sender's display name attached.
type MessageWithSender struct {
	Message
	SenderName string   `gorm:"column:sender_name" json:"sender_name"`
	Mentions   []string `gorm:"-" json:"mentions"`
}

// ListChannelMessages returns messages for a channel with cursor-based pagination.
// Uses created_at as cursor (before/after are epoch-ms timestamps).
// Returns limit+1 rows to detect has_more; caller trims.
func (s *Store) ListChannelMessages(channelID string, before, after *int64, limit int) ([]MessageWithSender, bool, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	actualLimit := limit + 1

	var msgs []MessageWithSender
	q := s.db.Table("messages m").
		Select("m.*, u.display_name AS sender_name").
		Joins("JOIN users u ON u.id = m.sender_id").
		Where("m.channel_id = ?", channelID)

	if after != nil {
		q = q.Where("m.created_at > ?", *after).Order("m.created_at ASC")
	} else if before != nil {
		q = q.Where("m.created_at < ?", *before).Order("m.created_at DESC")
	} else {
		q = q.Order("m.created_at DESC")
	}

	if err := q.Limit(actualLimit).Find(&msgs).Error; err != nil {
		return nil, false, err
	}

	hasMore := len(msgs) > limit
	if hasMore {
		msgs = msgs[:limit]
	}

	// For before/default (DESC order), reverse so output is ASC
	if after == nil {
		for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
			msgs[i], msgs[j] = msgs[j], msgs[i]
		}
	}

	// Attach mentions and mask deleted
	s.attachMentions(msgs)
	maskDeletedMessages(msgs)

	return msgs, hasMore, nil
}

// SearchMessages performs a LIKE search on message content in a channel.
func (s *Store) SearchMessages(channelID string, query string, limit int) ([]MessageWithSender, error) {
	if limit <= 0 || limit > 50 {
		limit = 50
	}

	var msgs []MessageWithSender
	err := s.db.Table("messages m").
		Select("m.*, u.display_name AS sender_name").
		Joins("JOIN users u ON u.id = m.sender_id").
		Where("m.channel_id = ? AND m.content LIKE ? AND m.deleted_at IS NULL", channelID, "%"+query+"%").
		Order("m.created_at DESC").
		Limit(limit).
		Find(&msgs).Error
	if err != nil {
		return nil, err
	}

	s.attachMentions(msgs)
	maskDeletedMessages(msgs)
	return msgs, nil
}

// CreateMessageFull creates a message, resolves mentions, inserts mention records and events.
// Returns the complete message with sender_name.
func (s *Store) CreateMessageFull(channelID, senderID, content, contentType string, replyToID *string, clientMentionIDs []string) (*MessageWithSender, error) {
	msgID := uuid.NewString()
	now := time.Now().UnixMilli()

	// Parse <@userId> from content
	parsedIDs := parseMentionIDs(content)

	// Parse @displayName from content
	parsedNameIDs := s.parseMentionNames(content)

	// Merge all mention IDs, deduplicate
	allMentions := dedup(append(append(clientMentionIDs, parsedIDs...), parsedNameIDs...))

	// Validate mentioned user IDs exist
	var validMentions []string
	for _, uid := range allMentions {
		var count int64
		s.db.Model(&User{}).Where("id = ?", uid).Count(&count)
		if count > 0 {
			validMentions = append(validMentions, uid)
		}
	}

	// Get sender display name
	var sender User
	senderName := "Unknown"
	if err := s.db.Select("display_name").Where("id = ?", senderID).First(&sender).Error; err == nil {
		senderName = sender.DisplayName
	}

	// Get channel type for event payload
	var ch Channel
	chType := "channel"
	if err := s.db.Select("type").Where("id = ?", channelID).First(&ch).Error; err == nil && ch.Type != "" {
		chType = ch.Type
	}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		msg := &Message{
			ID:          msgID,
			ChannelID:   channelID,
			SenderID:    senderID,
			Content:     content,
			ContentType: contentType,
			ReplyToID:   replyToID,
			CreatedAt:   now,
		}
		if err := tx.Create(msg).Error; err != nil {
			return err
		}

		for _, uid := range validMentions {
			m := &Mention{
				ID:        uuid.NewString(),
				MessageID: msgID,
				UserID:    uid,
				ChannelID: channelID,
			}
			if err := tx.Create(m).Error; err != nil {
				return err
			}
		}

		// Write message event
		eventPayload, _ := json.Marshal(map[string]any{
			"id":           msgID,
			"channel_id":   channelID,
			"sender_id":    senderID,
			"sender_name":  senderName,
			"content":      content,
			"content_type": contentType,
			"reply_to_id":  replyToID,
			"created_at":   now,
			"mentions":     validMentions,
			"channel_type": chType,
		})
		evt := &Event{Kind: "message", ChannelID: channelID, Payload: string(eventPayload), CreatedAt: now}
		if err := tx.Create(evt).Error; err != nil {
			return err
		}

		// Write mention events
		for _, uid := range validMentions {
			payload, _ := json.Marshal(map[string]any{
				"message":           map[string]any{"id": msgID, "channel_id": channelID, "sender_id": senderID, "sender_name": senderName, "content": content},
				"mentioned_user_id": uid,
			})
			me := &Event{Kind: "mention", ChannelID: channelID, Payload: string(payload), CreatedAt: now}
			if err := tx.Create(me).Error; err != nil {
				return err
			}
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	result := &MessageWithSender{
		Message: Message{
			ID:          msgID,
			ChannelID:   channelID,
			SenderID:    senderID,
			Content:     content,
			ContentType: contentType,
			ReplyToID:   replyToID,
			CreatedAt:   now,
		},
		SenderName: senderName,
		Mentions:   validMentions,
	}
	if result.Mentions == nil {
		result.Mentions = []string{}
	}

	return result, nil
}

// UpdateMessage updates a message's content and sets edited_at.
func (s *Store) UpdateMessage(messageID, content string) (*MessageWithSender, error) {
	now := time.Now().UnixMilli()
	if err := s.db.Model(&Message{}).Where("id = ?", messageID).Updates(map[string]any{
		"content":   content,
		"edited_at": now,
	}).Error; err != nil {
		return nil, err
	}

	var msg MessageWithSender
	err := s.db.Table("messages m").
		Select("m.*, u.display_name AS sender_name").
		Joins("JOIN users u ON u.id = m.sender_id").
		Where("m.id = ?", messageID).
		First(&msg).Error
	if err != nil {
		return nil, err
	}

	s.attachMentions([]MessageWithSender{msg})
	return &msg, nil
}

// SoftDeleteMessage marks a message as deleted. Returns the deleted_at timestamp.
// Idempotent: if already deleted, returns the existing deleted_at.
func (s *Store) SoftDeleteMessage(messageID string) (int64, error) {
	now := time.Now().UnixMilli()
	s.db.Model(&Message{}).Where("id = ? AND deleted_at IS NULL", messageID).Update("deleted_at", now)

	var msg Message
	if err := s.db.Select("deleted_at").Where("id = ?", messageID).First(&msg).Error; err != nil {
		return 0, err
	}
	if msg.DeletedAt != nil {
		return *msg.DeletedAt, nil
	}
	return now, nil
}

// CanAccessChannel checks if a user can access a channel.
func (s *Store) CanAccessChannel(channelID, userID string) bool {
	ch, err := s.GetChannelByID(channelID)
	if err != nil {
		return false
	}
	if ch.Visibility != "private" {
		return true
	}
	// Check membership
	var count int64
	s.db.Model(&ChannelMember{}).Where("channel_id = ? AND user_id = ?", channelID, userID).Count(&count)
	if count > 0 {
		return true
	}
	// Admin override
	var user User
	if err := s.db.Select("role").Where("id = ?", userID).First(&user).Error; err == nil {
		return user.Role == "admin"
	}
	return false
}

// IsChannelMember checks if a user is a member of a channel.
func (s *Store) IsChannelMember(channelID, userID string) bool {
	var count int64
	s.db.Model(&ChannelMember{}).Where("channel_id = ? AND user_id = ?", channelID, userID).Count(&count)
	return count > 0
}

// GetOnlineUsers returns users whose last_seen_at is within the last 5 minutes.
func (s *Store) GetOnlineUsers() ([]User, error) {
	cutoff := time.Now().UnixMilli() - 5*60*1000
	var users []User
	err := s.db.Where("last_seen_at > ? AND deleted_at IS NULL AND disabled = 0", cutoff).Find(&users).Error
	return users, err
}

// UpdateLastSeen updates a user's last_seen_at to now.
func (s *Store) UpdateLastSeen(userID string) error {
	now := time.Now().UnixMilli()
	return s.db.Model(&User{}).Where("id = ?", userID).Update("last_seen_at", now).Error
}

// GetUserByDisplayName finds a user by their display_name.
func (s *Store) GetUserByDisplayName(displayName string) (*User, error) {
	var user User
	err := s.db.Where("display_name = ? AND deleted_at IS NULL", displayName).First(&user).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// ─── Helpers ────────────────────────────────────────────

func (s *Store) attachMentions(msgs []MessageWithSender) {
	for i := range msgs {
		var mentions []Mention
		s.db.Where("message_id = ?", msgs[i].ID).Find(&mentions)
		ids := make([]string, len(mentions))
		for j, m := range mentions {
			ids[j] = m.UserID
		}
		msgs[i].Mentions = ids
	}
}

func maskDeletedMessages(msgs []MessageWithSender) {
	for i := range msgs {
		if msgs[i].DeletedAt != nil {
			msgs[i].Content = ""
		}
	}
}

// ─── Channel queries ──────────────────────────────────

func (s *Store) ListChannelsPublic() ([]ChannelWithCounts, error) {
	var results []ChannelWithCounts
	err := s.db.Raw(`
		SELECT c.*,
			(SELECT COUNT(*) FROM channel_members cm WHERE cm.channel_id = c.id) AS member_count,
			0 AS unread_count,
			(SELECT MAX(m.created_at) FROM messages m WHERE m.channel_id = c.id AND m.deleted_at IS NULL) AS last_message_at,
			0 AS is_member
		FROM channels c
		WHERE c.deleted_at IS NULL AND c.visibility = 'public' AND c.type = 'channel'
		ORDER BY c.position ASC, c.created_at ASC
	`).Scan(&results).Error
	return results, err
}

func (s *Store) ListChannelsWithUnread(userID string) ([]ChannelWithCounts, error) {
	var results []ChannelWithCounts
	err := s.db.Raw(`
		SELECT c.*,
			(SELECT COUNT(*) FROM channel_members cm2 WHERE cm2.channel_id = c.id) AS member_count,
			(SELECT COUNT(*) FROM messages m
				WHERE m.channel_id = c.id AND m.deleted_at IS NULL
				AND m.created_at > COALESCE((SELECT cm3.last_read_at FROM channel_members cm3 WHERE cm3.channel_id = c.id AND cm3.user_id = ?), 0)
			) AS unread_count,
			(SELECT MAX(m2.created_at) FROM messages m2 WHERE m2.channel_id = c.id AND m2.deleted_at IS NULL) AS last_message_at,
			CASE WHEN cm.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_member
		FROM channels c
		LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
		WHERE c.deleted_at IS NULL AND c.type = 'channel'
			AND (c.visibility = 'public' OR cm.user_id IS NOT NULL)
		ORDER BY c.position ASC, c.created_at ASC
	`, userID, userID).Scan(&results).Error
	return results, err
}

func (s *Store) ListAllChannelsForAdmin(userID string) ([]ChannelWithCounts, error) {
	var results []ChannelWithCounts
	err := s.db.Raw(`
		SELECT c.*,
			(SELECT COUNT(*) FROM channel_members cm2 WHERE cm2.channel_id = c.id) AS member_count,
			(SELECT COUNT(*) FROM messages m
				WHERE m.channel_id = c.id AND m.deleted_at IS NULL
				AND m.created_at > COALESCE((SELECT cm3.last_read_at FROM channel_members cm3 WHERE cm3.channel_id = c.id AND cm3.user_id = ?), 0)
			) AS unread_count,
			(SELECT MAX(m2.created_at) FROM messages m2 WHERE m2.channel_id = c.id AND m2.deleted_at IS NULL) AS last_message_at,
			CASE WHEN cm.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_member
		FROM channels c
		LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
		WHERE c.deleted_at IS NULL AND c.type = 'channel'
		ORDER BY c.position ASC, c.created_at ASC
	`, userID, userID).Scan(&results).Error
	return results, err
}

func (s *Store) GetChannelWithCounts(channelID, userID string) (*ChannelWithCounts, error) {
	var result ChannelWithCounts
	err := s.db.Raw(`
		SELECT c.*,
			(SELECT COUNT(*) FROM channel_members cm2 WHERE cm2.channel_id = c.id) AS member_count,
			(SELECT COUNT(*) FROM messages m
				WHERE m.channel_id = c.id AND m.deleted_at IS NULL
				AND m.created_at > COALESCE((SELECT cm3.last_read_at FROM channel_members cm3 WHERE cm3.channel_id = c.id AND cm3.user_id = ?), 0)
			) AS unread_count,
			(SELECT MAX(m2.created_at) FROM messages m2 WHERE m2.channel_id = c.id AND m2.deleted_at IS NULL) AS last_message_at,
			CASE WHEN cm.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_member
		FROM channels c
		LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
		WHERE c.id = ? AND c.deleted_at IS NULL
	`, userID, userID, channelID).Scan(&result).Error
	if err != nil {
		return nil, err
	}
	if result.ID == "" {
		return nil, gorm.ErrRecordNotFound
	}
	return &result, nil
}

func (s *Store) GetChannelDetail(channelID string) ([]ChannelMemberInfo, error) {
	var members []ChannelMemberInfo
	err := s.db.Raw(`
		SELECT cm.user_id, u.display_name, u.role, u.avatar_url, cm.joined_at
		FROM channel_members cm
		JOIN users u ON u.id = cm.user_id
		WHERE cm.channel_id = ?
		ORDER BY cm.joined_at ASC
	`, channelID).Scan(&members).Error
	return members, err
}

func (s *Store) GetChannelByName(name string) (*Channel, error) {
	var ch Channel
	err := s.db.Where("name = ? AND deleted_at IS NULL", name).First(&ch).Error
	if err != nil {
		return nil, err
	}
	return &ch, nil
}

func (s *Store) GetChannelIncludingDeleted(id string) (*Channel, error) {
	var ch Channel
	err := s.db.Where("id = ?", id).First(&ch).Error
	if err != nil {
		return nil, err
	}
	return &ch, nil
}

func (s *Store) UpdateChannel(id string, updates map[string]any) error {
	return s.db.Model(&Channel{}).Where("id = ?", id).Updates(updates).Error
}

func (s *Store) SoftDeleteChannel(id string) error {
	now := time.Now().UnixMilli()
	return s.db.Model(&Channel{}).Where("id = ?", id).Update("deleted_at", now).Error
}

func (s *Store) MarkChannelRead(channelID, userID string) error {
	now := time.Now().UnixMilli()
	return s.db.Model(&ChannelMember{}).
		Where("channel_id = ? AND user_id = ?", channelID, userID).
		Update("last_read_at", now).Error
}

func (s *Store) AddAllUsersToChannel(channelID string) error {
	var users []User
	if err := s.db.Where("deleted_at IS NULL AND disabled = 0").Find(&users).Error; err != nil {
		return err
	}
	now := time.Now().UnixMilli()
	for _, u := range users {
		member := &ChannelMember{ChannelID: channelID, UserID: u.ID, JoinedAt: now}
		s.db.Where("channel_id = ? AND user_id = ?", channelID, u.ID).FirstOrCreate(member)
	}
	return nil
}

func (s *Store) GetPreviewMessages(channelID string, limit int) ([]PreviewMessage, error) {
	cutoff := time.Now().UnixMilli() - 24*60*60*1000
	var msgs []PreviewMessage
	err := s.db.Raw(`
		SELECT m.id, m.content, m.content_type, m.created_at, m.sender_id, u.display_name AS sender_name, m.reply_to_id
		FROM messages m
		JOIN users u ON u.id = m.sender_id
		WHERE m.channel_id = ? AND m.deleted_at IS NULL AND m.created_at > ?
		ORDER BY m.created_at DESC
		LIMIT ?
	`, channelID, cutoff, limit).Scan(&msgs).Error
	if err != nil {
		return nil, err
	}
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}
	return msgs, nil
}

func (s *Store) UpdateChannelPosition(channelID, position string, groupID *string) error {
	updates := map[string]any{"position": position}
	if groupID != nil {
		updates["group_id"] = *groupID
	} else {
		updates["group_id"] = nil
	}
	return s.db.Model(&Channel{}).Where("id = ?", channelID).Updates(updates).Error
}

func (s *Store) GetAdjacentChannelPositions(afterID *string, groupID *string) (before string, after string, err error) {
	if afterID != nil && *afterID != "" {
		var ch Channel
		if err := s.db.Select("position").Where("id = ?", *afterID).First(&ch).Error; err != nil {
			return "", "", err
		}
		before = ch.Position

		q := s.db.Model(&Channel{}).Select("position").
			Where("deleted_at IS NULL AND position > ?", before)
		if groupID != nil {
			q = q.Where("group_id = ?", *groupID)
		} else {
			q = q.Where("group_id IS NULL")
		}
		var next Channel
		if err := q.Order("position ASC").First(&next).Error; err == nil {
			after = next.Position
		}
	} else {
		q := s.db.Model(&Channel{}).Select("position").Where("deleted_at IS NULL")
		if groupID != nil {
			q = q.Where("group_id = ?", *groupID)
		} else {
			q = q.Where("group_id IS NULL")
		}
		var first Channel
		if err := q.Order("position ASC").First(&first).Error; err == nil {
			after = first.Position
		}
	}
	return before, after, nil
}

func (s *Store) GetLastChannelPosition() string {
	var ch Channel
	if err := s.db.Model(&Channel{}).Select("position").
		Where("deleted_at IS NULL AND type = 'channel'").
		Order("position DESC").First(&ch).Error; err != nil {
		return ""
	}
	return ch.Position
}

func (s *Store) GrantCreatorPermissions(creatorID, creatorRole, channelID string, ownerIDIfAgent *string) error {
	scope := fmt.Sprintf("channel:%s", channelID)
	now := time.Now().UnixMilli()
	perms := []string{"channel.delete", "channel.manage_members", "channel.manage_visibility"}

	targetID := creatorID
	if creatorRole == "agent" && ownerIDIfAgent != nil {
		targetID = *ownerIDIfAgent
	}

	for _, p := range perms {
		perm := &UserPermission{
			UserID:     targetID,
			Permission: p,
			Scope:      scope,
			GrantedBy:  &creatorID,
			GrantedAt:  now,
		}
		if err := s.GrantPermission(perm); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) DeletePermissionsByScope(scope string) error {
	return s.db.Where("scope = ?", scope).Delete(&UserPermission{}).Error
}

// ─── Channel Groups ───────────────────────────────────

func (s *Store) CreateChannelGroup(group *ChannelGroup) error {
	if group.ID == "" {
		group.ID = uuid.NewString()
	}
	if group.CreatedAt == 0 {
		group.CreatedAt = time.Now().UnixMilli()
	}
	return s.db.Create(group).Error
}

func (s *Store) GetChannelGroup(id string) (*ChannelGroup, error) {
	var g ChannelGroup
	err := s.db.Where("id = ?", id).First(&g).Error
	if err != nil {
		return nil, err
	}
	return &g, nil
}

func (s *Store) UpdateChannelGroup(id, name string) error {
	return s.db.Model(&ChannelGroup{}).Where("id = ?", id).Update("name", name).Error
}

func (s *Store) DeleteChannelGroup(id string) error {
	return s.db.Where("id = ?", id).Delete(&ChannelGroup{}).Error
}

func (s *Store) ListChannelGroups() ([]ChannelGroup, error) {
	var groups []ChannelGroup
	err := s.db.Order("position ASC, created_at ASC").Find(&groups).Error
	return groups, err
}

func (s *Store) GetLastGroupPosition() string {
	var g ChannelGroup
	if err := s.db.Model(&ChannelGroup{}).Select("position").
		Order("position DESC").First(&g).Error; err != nil {
		return ""
	}
	return g.Position
}

func (s *Store) GetAdjacentGroupPositions(afterID *string) (before string, after string, err error) {
	if afterID != nil && *afterID != "" {
		var g ChannelGroup
		if err := s.db.Select("position").Where("id = ?", *afterID).First(&g).Error; err != nil {
			return "", "", err
		}
		before = g.Position

		var next ChannelGroup
		if err := s.db.Model(&ChannelGroup{}).Select("position").
			Where("position > ?", before).Order("position ASC").First(&next).Error; err == nil {
			after = next.Position
		}
	} else {
		var first ChannelGroup
		if err := s.db.Model(&ChannelGroup{}).Select("position").
			Order("position ASC").First(&first).Error; err == nil {
			after = first.Position
		}
	}
	return before, after, nil
}

func (s *Store) UpdateGroupPosition(groupID, position string) error {
	return s.db.Model(&ChannelGroup{}).Where("id = ?", groupID).Update("position", position).Error
}

func (s *Store) UngroupChannels(groupID string) ([]string, error) {
	var channels []Channel
	if err := s.db.Select("id").Where("group_id = ? AND deleted_at IS NULL", groupID).Find(&channels).Error; err != nil {
		return nil, err
	}
	ids := make([]string, len(channels))
	for i, ch := range channels {
		ids[i] = ch.ID
	}
	if len(ids) > 0 {
		s.db.Model(&Channel{}).Where("group_id = ?", groupID).Update("group_id", nil)
	}
	return ids, nil
}

// ─── DM queries ───────────────────────────────────────

func (s *Store) CreateDmChannel(userID1, userID2 string) (*Channel, error) {
	ids := []string{userID1, userID2}
	sort.Strings(ids)
	name := fmt.Sprintf("dm:%s_%s", ids[0], ids[1])

	existing, err := s.GetChannelByName(name)
	if err == nil {
		return existing, nil
	}

	ch := &Channel{
		ID:         uuid.NewString(),
		Name:       name,
		Type:       "dm",
		Visibility: "private",
		CreatedBy:  userID1,
		CreatedAt:  time.Now().UnixMilli(),
		Position:   GenerateInitialRank(),
	}
	if err := s.db.Create(ch).Error; err != nil {
		if existing, err2 := s.GetChannelByName(name); err2 == nil {
			return existing, nil
		}
		return nil, err
	}

	now := time.Now().UnixMilli()
	for _, uid := range ids {
		s.db.Create(&ChannelMember{ChannelID: ch.ID, UserID: uid, JoinedAt: now})
	}

	return ch, nil
}

func (s *Store) ListDmChannelsForUser(userID string) ([]DmChannelInfo, error) {
	type rawRow struct {
		ID             string  `gorm:"column:id"`
		Name           string  `gorm:"column:name"`
		CreatedAt      int64   `gorm:"column:created_at"`
		PeerID         string  `gorm:"column:peer_id"`
		PeerName       string  `gorm:"column:peer_name"`
		PeerAvatar     string  `gorm:"column:peer_avatar"`
		PeerRole       string  `gorm:"column:peer_role"`
		UnreadCount    int     `gorm:"column:unread_count"`
		LastMsgContent *string `gorm:"column:last_msg_content"`
		LastMsgAt      *int64  `gorm:"column:last_msg_at"`
		LastMsgSender  *string `gorm:"column:last_msg_sender"`
	}

	var rows []rawRow
	err := s.db.Raw(`
		SELECT c.id, c.name, c.created_at,
			peer.id AS peer_id, peer.display_name AS peer_name, peer.avatar_url AS peer_avatar, peer.role AS peer_role,
			(SELECT COUNT(*) FROM messages m
				WHERE m.channel_id = c.id AND m.deleted_at IS NULL
				AND m.created_at > COALESCE(cm.last_read_at, 0)
			) AS unread_count,
			lm.content AS last_msg_content, lm.created_at AS last_msg_at, lm.sender_id AS last_msg_sender
		FROM channels c
		JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
		JOIN channel_members cm2 ON cm2.channel_id = c.id AND cm2.user_id != ?
		JOIN users peer ON peer.id = cm2.user_id
		LEFT JOIN messages lm ON lm.id = (
			SELECT m2.id FROM messages m2 WHERE m2.channel_id = c.id AND m2.deleted_at IS NULL ORDER BY m2.created_at DESC LIMIT 1
		)
		WHERE c.type = 'dm' AND c.deleted_at IS NULL
		ORDER BY COALESCE(lm.created_at, c.created_at) DESC
	`, userID, userID).Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	result := make([]DmChannelInfo, len(rows))
	for i, r := range rows {
		info := DmChannelInfo{
			ID:          r.ID,
			Name:        r.Name,
			CreatedAt:   r.CreatedAt,
			Peer:        DmPeer{ID: r.PeerID, DisplayName: r.PeerName, AvatarURL: r.PeerAvatar, Role: r.PeerRole},
			UnreadCount: r.UnreadCount,
		}
		if r.LastMsgContent != nil && r.LastMsgAt != nil && r.LastMsgSender != nil {
			info.LastMessage = &DmLastMessage{Content: *r.LastMsgContent, CreatedAt: *r.LastMsgAt, SenderID: *r.LastMsgSender}
		}
		result[i] = info
	}
	return result, nil
}
