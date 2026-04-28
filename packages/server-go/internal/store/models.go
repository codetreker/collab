package store

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
	GroupID    *string `gorm:"size:36" json:"group_id"`
}

type ChannelGroup struct {
	ID        string `gorm:"primaryKey;size:36" json:"id"`
	Name      string `gorm:"not null;size:100" json:"name"`
	Position  string `gorm:"not null;size:50;index" json:"position"`
	CreatedBy string `gorm:"not null;size:36;index" json:"created_by"`
	CreatedAt int64  `gorm:"not null" json:"created_at"`
}

type User struct {
	ID             string  `gorm:"primaryKey;size:36" json:"id"`
	DisplayName    string  `gorm:"not null;size:100" json:"display_name"`
	Role           string  `gorm:"not null;default:member;size:20" json:"role"`
	AvatarURL      string  `gorm:"size:500" json:"avatar_url"`
	APIKey         *string `gorm:"uniqueIndex;size:128" json:"-"`
	CreatedAt      int64   `gorm:"not null" json:"created_at"`
	Email          *string `gorm:"uniqueIndex:idx_users_email;size:255" json:"email,omitempty"`
	PasswordHash   string  `gorm:"size:255" json:"-"`
	LastSeenAt     *int64  `json:"last_seen_at,omitempty"`
	RequireMention bool    `gorm:"not null;default:true" json:"require_mention"`
	OwnerID        *string `gorm:"size:36;index" json:"owner_id,omitempty"`
	DeletedAt      *int64  `gorm:"index" json:"deleted_at,omitempty"`
	Disabled       bool    `gorm:"not null;default:false" json:"disabled"`
	// OrgID is the user's organization (CM-1.2). Blueprint §1.1 forbids UI
	// exposure, hence json:"-" — every API serializer is hand-built map and
	// must NOT include org_id. Column added by migration cm_1_1_organizations
	// (NOT NULL DEFAULT '').
	OrgID string `gorm:"column:org_id;not null;default:'';size:36;index" json:"-"`
}

// Organization is the data-layer container for a person's resources
// (CM-1.2, blueprint concept-model §1.1 + §2). 1 person = 1 org in v0; UI
// permanently does not expose org_id.
type Organization struct {
	ID        string `gorm:"primaryKey;size:36" json:"id"`
	Name      string `gorm:"not null;size:100" json:"name"`
	CreatedAt int64  `gorm:"not null" json:"created_at"`
}

type Message struct {
	ID          string  `gorm:"primaryKey;size:36" json:"id"`
	ChannelID   string  `gorm:"not null;size:36;index:idx_messages_channel_time,priority:1" json:"channel_id"`
	SenderID    string  `gorm:"not null;size:36;index" json:"sender_id"`
	Content     string  `gorm:"not null" json:"content"`
	ContentType string  `gorm:"not null;default:text;size:20" json:"content_type"`
	ReplyToID   *string `gorm:"size:36;index" json:"reply_to_id"`
	CreatedAt   int64   `gorm:"not null;index:idx_messages_channel_time,priority:2,sort:desc" json:"created_at"`
	EditedAt    *int64  `json:"edited_at"`
	DeletedAt   *int64  `gorm:"index" json:"deleted_at"`
	// QuickAction is a JSON-encoded `{kind, label, action}` payload attached
	// to system messages (CM-onboarding migration v=7). Nil/empty for plain
	// chat messages. The client decodes and renders a button when set.
	QuickAction *string `gorm:"column:quick_action" json:"quick_action,omitempty"`
}

type ChannelMember struct {
	ChannelID  string `gorm:"primaryKey;size:36" json:"channel_id"`
	UserID     string `gorm:"primaryKey;size:36;index" json:"user_id"`
	JoinedAt   int64  `gorm:"not null" json:"joined_at"`
	LastReadAt *int64 `json:"last_read_at,omitempty"`
}

type Mention struct {
	ID        string `gorm:"primaryKey;size:36" json:"id"`
	MessageID string `gorm:"not null;size:36;index" json:"message_id"`
	UserID    string `gorm:"not null;size:36;index:idx_mentions_user,priority:1" json:"user_id"`
	ChannelID string `gorm:"not null;size:36;index:idx_mentions_user,priority:2" json:"channel_id"`
}

type Event struct {
	Cursor    int64  `gorm:"primaryKey;autoIncrement" json:"cursor"`
	Kind      string `gorm:"not null;size:50;index" json:"kind"`
	ChannelID string `gorm:"not null;size:36;index" json:"channel_id"`
	Payload   string `gorm:"not null" json:"payload"`
	CreatedAt int64  `gorm:"not null;index" json:"created_at"`
}

type UserPermission struct {
	ID         uint    `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID     string  `gorm:"not null;size:36;index:idx_user_permissions_lookup" json:"user_id"`
	Permission string  `gorm:"not null;size:100" json:"permission"`
	Scope      string  `gorm:"not null;default:*;size:255" json:"scope"`
	GrantedBy  *string `gorm:"size:36" json:"granted_by,omitempty"`
	GrantedAt  int64   `gorm:"not null" json:"granted_at"`
}

type InviteCode struct {
	Code      string  `gorm:"primaryKey;size:128" json:"code"`
	CreatedBy string  `gorm:"not null;size:36;index" json:"created_by"`
	CreatedAt int64   `gorm:"not null" json:"created_at"`
	ExpiresAt *int64  `gorm:"index" json:"expires_at,omitempty"`
	UsedBy    *string `gorm:"size:36;index" json:"used_by,omitempty"`
	UsedAt    *int64  `json:"used_at,omitempty"`
	Note      string  `gorm:"size:500" json:"note"`
}

type MessageReaction struct {
	ID        string `gorm:"primaryKey;size:36" json:"id"`
	MessageID string `gorm:"not null;size:36;index" json:"message_id"`
	UserID    string `gorm:"not null;size:36;index" json:"user_id"`
	Emoji     string `gorm:"not null;size:64" json:"emoji"`
	CreatedAt int64  `gorm:"not null" json:"created_at"`
}

type WorkspaceFile struct {
	ID              string  `gorm:"primaryKey;size:36" json:"id"`
	UserID          string  `gorm:"not null;size:36;index" json:"user_id"`
	ChannelID       string  `gorm:"not null;size:36;index" json:"channel_id"`
	ParentID        *string `gorm:"size:36;index" json:"parent_id,omitempty"`
	Name            string  `gorm:"not null;size:255" json:"name"`
	IsDirectory     bool    `gorm:"not null;default:false" json:"is_directory"`
	MimeType        string  `gorm:"size:255" json:"mime_type"`
	SizeBytes       int64   `gorm:"not null;default:0" json:"size_bytes"`
	Source          string  `gorm:"not null;default:upload;size:50" json:"source"`
	SourceMessageID *string `gorm:"size:36;index" json:"source_message_id,omitempty"`
	CreatedAt       int64   `gorm:"not null" json:"created_at"`
	UpdatedAt       int64   `gorm:"not null" json:"updated_at"`
}

type RemoteNode struct {
	ID              string `gorm:"primaryKey;size:36" json:"id"`
	UserID          string `gorm:"not null;size:36;index" json:"user_id"`
	MachineName     string `gorm:"not null;size:255" json:"machine_name"`
	ConnectionToken string `gorm:"not null;uniqueIndex;size:255" json:"-"`
	LastSeenAt      *int64 `gorm:"index" json:"last_seen_at,omitempty"`
	CreatedAt       int64  `gorm:"not null" json:"created_at"`
}

type RemoteBinding struct {
	ID        string `gorm:"primaryKey;size:36" json:"id"`
	NodeID    string `gorm:"not null;size:36;index" json:"node_id"`
	ChannelID string `gorm:"not null;size:36;index" json:"channel_id"`
	Path      string `gorm:"not null;size:1000" json:"path"`
	Label     string `gorm:"size:255" json:"label"`
	CreatedAt int64  `gorm:"not null" json:"created_at"`
}
