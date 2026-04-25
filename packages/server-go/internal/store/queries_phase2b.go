package store

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ─── Admin ───────────────────────────────────────────

func (s *Store) ListAdminUsers() ([]User, error) {
	var users []User
	err := s.db.Where("deleted_at IS NULL").Find(&users).Error
	return users, err
}

func (s *Store) UpdateUser(id string, updates map[string]any) error {
	return s.db.Model(&User{}).Where("id = ?", id).Updates(updates).Error
}

func (s *Store) SoftDeleteUser(id string) error {
	now := time.Now().UnixMilli()
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&User{}).Where("id = ?", id).Updates(map[string]any{
			"deleted_at": now,
			"disabled":   true,
		}).Error; err != nil {
			return err
		}
		tx.Where("user_id = ?", id).Delete(&UserPermission{})
		tx.Where("user_id = ?", id).Delete(&ChannelMember{})

		var agents []User
		tx.Where("owner_id = ? AND deleted_at IS NULL", id).Find(&agents)
		for _, agent := range agents {
			tx.Model(&User{}).Where("id = ?", agent.ID).Updates(map[string]any{
				"deleted_at": now,
				"disabled":   true,
			})
			tx.Where("user_id = ?", agent.ID).Delete(&UserPermission{})
			tx.Where("user_id = ?", agent.ID).Delete(&ChannelMember{})
		}
		return nil
	})
}

func (s *Store) SetAPIKey(id, key string) error {
	return s.db.Model(&User{}).Where("id = ?", id).Update("api_key", key).Error
}

func (s *Store) ClearAPIKey(id string) error {
	return s.db.Model(&User{}).Where("id = ?", id).Update("api_key", nil).Error
}

func (s *Store) CreateInviteCode(createdBy string, expiresAt *int64, note string) (*InviteCode, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	code := hex.EncodeToString(b)
	ic := &InviteCode{
		Code:      code,
		CreatedBy: createdBy,
		CreatedAt: time.Now().UnixMilli(),
		ExpiresAt: expiresAt,
		Note:      note,
	}
	if err := s.db.Create(ic).Error; err != nil {
		return nil, err
	}
	return ic, nil
}

func (s *Store) ListInviteCodes() ([]InviteCode, error) {
	var codes []InviteCode
	err := s.db.Order("created_at DESC").Find(&codes).Error
	return codes, err
}

func (s *Store) DeleteInviteCode(code string) (bool, error) {
	result := s.db.Where("code = ?", code).Delete(&InviteCode{})
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected > 0, nil
}

func (s *Store) ListAllChannelsAdmin() ([]Channel, error) {
	var channels []Channel
	err := s.db.Where("deleted_at IS NULL").Order("created_at ASC").Find(&channels).Error
	return channels, err
}

func (s *Store) ForceDeleteChannel(id string) error {
	now := time.Now().UnixMilli()
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&Channel{}).Where("id = ?", id).Update("deleted_at", now).Error; err != nil {
			return err
		}
		tx.Where("channel_id = ?", id).Delete(&ChannelMember{})
		scope := fmt.Sprintf("channel:%s", id)
		tx.Where("scope = ?", scope).Delete(&UserPermission{})
		evt := &Event{
			Kind:      "channel_deleted",
			ChannelID: id,
			Payload:   fmt.Sprintf(`{"channel_id":"%s"}`, id),
			CreatedAt: now,
		}
		return tx.Create(evt).Error
	})
}

// ─── Agents ──────────────────────────────────────────

func (s *Store) ListAgentsByOwner(ownerID string) ([]User, error) {
	var users []User
	err := s.db.Where("role = 'agent' AND owner_id = ? AND deleted_at IS NULL", ownerID).Find(&users).Error
	return users, err
}

func (s *Store) ListAllAgents() ([]User, error) {
	var users []User
	err := s.db.Where("role = 'agent' AND deleted_at IS NULL").Find(&users).Error
	return users, err
}

func (s *Store) GetAgent(id string) (*User, error) {
	var user User
	err := s.db.Where("id = ? AND role = 'agent' AND deleted_at IS NULL", id).First(&user).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// ─── Reactions ───────────────────────────────────────

type AggregatedReaction struct {
	Emoji string   `json:"emoji"`
	Count int      `json:"count"`
	Users []string `json:"users"`
}

func (s *Store) AddReaction(messageID, userID, emoji string) error {
	reaction := &MessageReaction{
		ID:        uuid.NewString(),
		MessageID: messageID,
		UserID:    userID,
		Emoji:     emoji,
		CreatedAt: time.Now().UnixMilli(),
	}
	return s.db.Create(reaction).Error
}

func (s *Store) RemoveReaction(messageID, userID, emoji string) error {
	result := s.db.Where("message_id = ? AND user_id = ? AND emoji = ?", messageID, userID, emoji).Delete(&MessageReaction{})
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return result.Error
}

func (s *Store) GetReactionsByMessage(messageID string) ([]AggregatedReaction, error) {
	var reactions []MessageReaction
	if err := s.db.Where("message_id = ?", messageID).Order("created_at ASC").Find(&reactions).Error; err != nil {
		return nil, err
	}

	emojiMap := make(map[string][]string)
	emojiOrder := []string{}
	for _, r := range reactions {
		if _, exists := emojiMap[r.Emoji]; !exists {
			emojiOrder = append(emojiOrder, r.Emoji)
		}
		emojiMap[r.Emoji] = append(emojiMap[r.Emoji], r.UserID)
	}

	result := make([]AggregatedReaction, 0, len(emojiOrder))
	for _, emoji := range emojiOrder {
		users := emojiMap[emoji]
		result = append(result, AggregatedReaction{
			Emoji: emoji,
			Count: len(users),
			Users: users,
		})
	}
	return result, nil
}

// ─── Workspace ───────────────────────────────────────

func (s *Store) ListWorkspaceFiles(userID, channelID string, parentID *string) ([]WorkspaceFile, error) {
	var files []WorkspaceFile
	q := s.db.Where("user_id = ? AND channel_id = ?", userID, channelID)
	if parentID != nil {
		q = q.Where("parent_id = ?", *parentID)
	} else {
		q = q.Where("parent_id IS NULL")
	}
	err := q.Order("is_directory DESC, name ASC").Find(&files).Error
	return files, err
}

func (s *Store) GetWorkspaceFile(id string) (*WorkspaceFile, error) {
	var f WorkspaceFile
	err := s.db.Where("id = ?", id).First(&f).Error
	if err != nil {
		return nil, err
	}
	return &f, nil
}

func (s *Store) InsertWorkspaceFile(file *WorkspaceFile) (*WorkspaceFile, error) {
	if file.ID == "" {
		file.ID = uuid.NewString()
	}
	if err := s.db.Create(file).Error; err != nil {
		return nil, err
	}
	return file, nil
}

func (s *Store) DeleteWorkspaceFile(id string) error {
	var f WorkspaceFile
	if err := s.db.Where("id = ?", id).First(&f).Error; err != nil {
		return err
	}
	if f.IsDirectory {
		var children []WorkspaceFile
		s.db.Where("parent_id = ?", id).Find(&children)
		for _, child := range children {
			s.DeleteWorkspaceFile(child.ID)
		}
	}
	return s.db.Where("id = ?", id).Delete(&WorkspaceFile{}).Error
}

func (s *Store) RenameWorkspaceFile(id, name string) (*WorkspaceFile, error) {
	if err := s.db.Model(&WorkspaceFile{}).Where("id = ?", id).Update("name", name).Error; err != nil {
		return nil, err
	}
	return s.GetWorkspaceFile(id)
}

func (s *Store) UpdateWorkspaceFileSize(id string, size int64) error {
	return s.db.Model(&WorkspaceFile{}).Where("id = ?", id).Update("size_bytes", size).Error
}

func (s *Store) MkdirWorkspace(userID, channelID string, parentID *string, name string) (*WorkspaceFile, error) {
	f := &WorkspaceFile{
		ID:          uuid.NewString(),
		UserID:      userID,
		ChannelID:   channelID,
		ParentID:    parentID,
		Name:        name,
		IsDirectory: true,
	}
	if err := s.db.Create(f).Error; err != nil {
		return nil, err
	}
	return f, nil
}

func (s *Store) MoveWorkspaceFile(id string, parentID *string) (*WorkspaceFile, error) {
	updates := map[string]any{"parent_id": parentID}
	if err := s.db.Model(&WorkspaceFile{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return nil, err
	}
	return s.GetWorkspaceFile(id)
}

func (s *Store) GetAllWorkspaceFiles(userID string) ([]WorkspaceFile, error) {
	var files []WorkspaceFile
	err := s.db.Where("user_id = ?", userID).Order("channel_id, name ASC").Find(&files).Error
	return files, err
}

func (s *Store) GetSiblingNames(userID, channelID string, parentID *string) ([]string, error) {
	var names []string
	q := s.db.Model(&WorkspaceFile{}).Select("name").Where("user_id = ? AND channel_id = ?", userID, channelID)
	if parentID != nil {
		q = q.Where("parent_id = ?", *parentID)
	} else {
		q = q.Where("parent_id IS NULL")
	}
	err := q.Pluck("name", &names).Error
	return names, err
}

func ResolveConflict(name string, siblings []string) string {
	siblingSet := make(map[string]bool, len(siblings))
	for _, s := range siblings {
		siblingSet[s] = true
	}
	if !siblingSet[name] {
		return name
	}
	ext := filepath.Ext(name)
	base := strings.TrimSuffix(name, ext)
	for i := 1; ; i++ {
		candidate := fmt.Sprintf("%s (%d)%s", base, i, ext)
		if !siblingSet[candidate] {
			return candidate
		}
	}
}

// ─── Remote ──────────────────────────────────────────

func (s *Store) CreateRemoteNode(userID, machineName string) (*RemoteNode, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	node := &RemoteNode{
		ID:              uuid.NewString(),
		UserID:          userID,
		MachineName:     machineName,
		ConnectionToken: hex.EncodeToString(b),
	}
	if err := s.db.Create(node).Error; err != nil {
		return nil, err
	}
	return node, nil
}

func (s *Store) ListRemoteNodes(userID string) ([]RemoteNode, error) {
	var nodes []RemoteNode
	err := s.db.Where("user_id = ?", userID).Order("created_at DESC").Find(&nodes).Error
	return nodes, err
}

func (s *Store) GetRemoteNode(id string) (*RemoteNode, error) {
	var node RemoteNode
	err := s.db.Where("id = ?", id).First(&node).Error
	if err != nil {
		return nil, err
	}
	return &node, nil
}

func (s *Store) DeleteRemoteNode(id string) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		tx.Where("node_id = ?", id).Delete(&RemoteBinding{})
		return tx.Where("id = ?", id).Delete(&RemoteNode{}).Error
	})
}

func (s *Store) CreateRemoteBinding(nodeID, channelID, path, label string) (*RemoteBinding, error) {
	b := &RemoteBinding{
		ID:        uuid.NewString(),
		NodeID:    nodeID,
		ChannelID: channelID,
		Path:      path,
		Label:     label,
	}
	if err := s.db.Create(b).Error; err != nil {
		return nil, err
	}
	return b, nil
}

func (s *Store) ListRemoteBindings(nodeID string) ([]RemoteBinding, error) {
	var bindings []RemoteBinding
	err := s.db.Where("node_id = ?", nodeID).Find(&bindings).Error
	return bindings, err
}

func (s *Store) GetRemoteBinding(id string) (*RemoteBinding, error) {
	var b RemoteBinding
	err := s.db.Where("id = ?", id).First(&b).Error
	if err != nil {
		return nil, err
	}
	return &b, nil
}

func (s *Store) DeleteRemoteBinding(id string) error {
	return s.db.Where("id = ?", id).Delete(&RemoteBinding{}).Error
}

func (s *Store) ListChannelRemoteBindings(channelID, userID string) ([]RemoteBinding, error) {
	var bindings []RemoteBinding
	err := s.db.Raw(`
		SELECT rb.* FROM remote_bindings rb
		JOIN remote_nodes rn ON rn.id = rb.node_id
		WHERE rb.channel_id = ? AND rn.user_id = ?
	`, channelID, userID).Scan(&bindings).Error
	return bindings, err
}

func (s *Store) DeletePermissionsByUserID(userID string) error {
	return s.db.Where("user_id = ?", userID).Delete(&UserPermission{}).Error
}

func GenerateAPIKey() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "col_" + hex.EncodeToString(b), nil
}
