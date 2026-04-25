package store

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

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
