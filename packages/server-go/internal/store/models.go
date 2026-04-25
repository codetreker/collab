package store

import "time"

type Channel struct {
	ID         string  `gorm:"primaryKey;size:36" json:"id"`
	Name       string  `gorm:"not null;unique;size:100" json:"name"`
	Topic      string  `gorm:"not null;default:'';size:500" json:"topic"`
	Visibility string  `gorm:"not null;default:public;size:20" json:"visibility"`
	CreatedAt  int64   `gorm:"not null" json:"created_at"`
	CreatedBy  string  `gorm:"not null;size:36;index" json:"created_by"`
	Type       string  `gorm:"not null;default:channel;size:20" json:"type"`
	DeletedAt  *int64  `gorm:"index" json:"deleted_at,omitempty"`
	Position   string  `gorm:"not null;default:0|aaaaaa;size:50;index" json:"position"`
	GroupID    *string `gorm:"size:36;index" json:"group_id,omitempty"`
}

type ChannelGroup struct {
	ID        string `gorm:"primaryKey;size:36"`
	Name      string `gorm:"not null;size:100"`
	Position  string `gorm:"not null;size:50;index"`
	CreatedBy string `gorm:"not null;size:36;index"`
	CreatedAt int64  `gorm:"not null"`
}

type User struct {
	ID             string  `gorm:"primaryKey;size:36"`
	DisplayName    string  `gorm:"not null;size:100"`
	Role           string  `gorm:"not null;default:member;size:20"`
	AvatarURL      string  `gorm:"size:500"`
	APIKey         *string `gorm:"uniqueIndex;size:128"`
	CreatedAt      int64   `gorm:"not null"`
	Email          *string `gorm:"uniqueIndex:idx_users_email;size:255"`
	PasswordHash   string  `gorm:"size:255"`
	LastSeenAt     *int64
	RequireMention bool    `gorm:"not null;default:true"`
	OwnerID        *string `gorm:"size:36;index"`
	DeletedAt      *int64  `gorm:"index"`
	Disabled       bool    `gorm:"not null;default:false"`
}

type Message struct {
	ID          string  `gorm:"primaryKey;size:36" json:"id"`
	ChannelID   string  `gorm:"not null;size:36;index:idx_messages_channel_time,priority:1" json:"channel_id"`
	SenderID    string  `gorm:"not null;size:36;index" json:"sender_id"`
	Content     string  `gorm:"not null" json:"content"`
	ContentType string  `gorm:"not null;default:text;size:20" json:"content_type"`
	ReplyToID   *string `gorm:"size:36;index" json:"reply_to_id,omitempty"`
	CreatedAt   int64   `gorm:"not null;index:idx_messages_channel_time,priority:2,sort:desc" json:"created_at"`
	EditedAt    *int64  `json:"edited_at,omitempty"`
	DeletedAt   *int64  `gorm:"index" json:"deleted_at,omitempty"`
}

type ChannelMember struct {
	ChannelID  string `gorm:"primaryKey;size:36"`
	UserID     string `gorm:"primaryKey;size:36;index"`
	JoinedAt   int64  `gorm:"not null"`
	LastReadAt *int64
}

type Mention struct {
	ID        string `gorm:"primaryKey;size:36"`
	MessageID string `gorm:"not null;size:36;index"`
	UserID    string `gorm:"not null;size:36;index:idx_mentions_user,priority:1"`
	ChannelID string `gorm:"not null;size:36;index:idx_mentions_user,priority:2"`
}

type Event struct {
	Cursor    int64  `gorm:"primaryKey;autoIncrement"`
	Kind      string `gorm:"not null;size:50;index"`
	ChannelID string `gorm:"not null;size:36;index"`
	Payload   string `gorm:"not null"`
	CreatedAt int64  `gorm:"not null;index"`
}

type UserPermission struct {
	ID         uint    `gorm:"primaryKey;autoIncrement"`
	UserID     string  `gorm:"not null;size:36;index;uniqueIndex:idx_user_permissions_unique,priority:1;index:idx_user_permissions_lookup,priority:1"`
	Permission string  `gorm:"not null;size:100;uniqueIndex:idx_user_permissions_unique,priority:2;index:idx_user_permissions_lookup,priority:2"`
	Scope      string  `gorm:"not null;default:*;size:255;uniqueIndex:idx_user_permissions_unique,priority:3;index:idx_user_permissions_lookup,priority:3"`
	GrantedBy  *string `gorm:"size:36"`
	GrantedAt  int64   `gorm:"not null"`
}

type InviteCode struct {
	Code      string  `gorm:"primaryKey;size:128"`
	CreatedBy string  `gorm:"not null;size:36;index"`
	CreatedAt int64   `gorm:"not null"`
	ExpiresAt *int64  `gorm:"index"`
	UsedBy    *string `gorm:"size:36;index"`
	UsedAt    *int64
	Note      string  `gorm:"size:500"`
}

type MessageReaction struct {
	ID        string `gorm:"primaryKey;size:36"`
	MessageID string `gorm:"not null;size:36;index;uniqueIndex:idx_reactions_unique,priority:1"`
	UserID    string `gorm:"not null;size:36;index;uniqueIndex:idx_reactions_unique,priority:2"`
	Emoji     string `gorm:"not null;size:64;uniqueIndex:idx_reactions_unique,priority:3"`
	CreatedAt int64  `gorm:"not null"`
}

type WorkspaceFile struct {
	ID              string    `gorm:"primaryKey;size:36"`
	UserID          string    `gorm:"not null;size:36;index;uniqueIndex:idx_workspace_files_unique,priority:1"`
	ChannelID       string    `gorm:"not null;size:36;index;uniqueIndex:idx_workspace_files_unique,priority:2"`
	ParentID        *string   `gorm:"size:36;index;uniqueIndex:idx_workspace_files_unique,priority:3"`
	Name            string    `gorm:"not null;size:255;uniqueIndex:idx_workspace_files_unique,priority:4"`
	IsDirectory     bool      `gorm:"not null;default:false"`
	MimeType        string    `gorm:"size:255"`
	SizeBytes       int64     `gorm:"not null;default:0"`
	Source          string    `gorm:"not null;default:upload;size:50"`
	SourceMessageID *string   `gorm:"size:36;index"`
	CreatedAt       time.Time `gorm:"autoCreateTime"`
	UpdatedAt       time.Time `gorm:"autoUpdateTime"`
}

type RemoteNode struct {
	ID              string     `gorm:"primaryKey;size:36"`
	UserID          string     `gorm:"not null;size:36;index"`
	MachineName     string     `gorm:"not null;size:255"`
	ConnectionToken string     `gorm:"not null;uniqueIndex;size:255"`
	LastSeenAt      *time.Time `gorm:"index"`
	CreatedAt       time.Time  `gorm:"autoCreateTime"`
}

type RemoteBinding struct {
	ID        string    `gorm:"primaryKey;size:36"`
	NodeID    string    `gorm:"not null;size:36;index;uniqueIndex:idx_remote_bindings_unique,priority:1"`
	ChannelID string    `gorm:"not null;size:36;index;uniqueIndex:idx_remote_bindings_unique,priority:2"`
	Path      string    `gorm:"not null;size:1000;uniqueIndex:idx_remote_bindings_unique,priority:3"`
	Label     string    `gorm:"size:255"`
	CreatedAt time.Time `gorm:"autoCreateTime"`
}
