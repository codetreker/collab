package store

import "time"

func (s *Store) GetEventsSince(cursor int64, limit int, channelIDs []string) ([]Event, error) {
	var events []Event
	q := s.db.Where("cursor > ? AND channel_id IN ?", cursor, channelIDs).
		Order("cursor ASC").Limit(limit)
	if err := q.Find(&events).Error; err != nil {
		return nil, err
	}
	return events, nil
}

func (s *Store) GetEventsSinceWithChanges(cursor int64, limit int, channelIDs []string, changeKinds []string) ([]Event, error) {
	var events []Event
	q := s.db.Where("cursor > ? AND (channel_id IN ? OR kind IN ?)", cursor, channelIDs, changeKinds).
		Order("cursor ASC").Limit(limit)
	if err := q.Find(&events).Error; err != nil {
		return nil, err
	}
	return events, nil
}

func (s *Store) GetLatestCursor() int64 {
	var cursor int64
	s.db.Model(&Event{}).Select("COALESCE(MAX(cursor), 0)").Scan(&cursor)
	return cursor
}

func (s *Store) GetUserChannelIDs(userID string) []string {
	var ids []string
	s.db.Model(&ChannelMember{}).
		Joins("JOIN channels ON channels.id = channel_members.channel_id AND channels.deleted_at IS NULL").
		Where("channel_members.user_id = ?", userID).
		Pluck("channel_members.channel_id", &ids)
	return ids
}

func (s *Store) GetRemoteNodeByToken(token string) (*RemoteNode, error) {
	var node RemoteNode
	if err := s.db.Where("connection_token = ?", token).First(&node).Error; err != nil {
		return nil, err
	}
	return &node, nil
}

func (s *Store) UpdateRemoteNodeLastSeen(nodeID string) error {
	now := time.Now().UnixMilli()
	return s.db.Model(&RemoteNode{}).Where("id = ?", nodeID).Update("last_seen_at", now).Error
}

func (s *Store) GetEventByCursor(cursor int64) (*Event, error) {
	var ev Event
	if err := s.db.Where("cursor = ?", cursor).First(&ev).Error; err != nil {
		return nil, err
	}
	return &ev, nil
}

func (s *Store) GetEventCursorForMessage(messageID string) (int64, error) {
	var ev Event
	if err := s.db.Where("kind = ? AND payload LIKE ?", "new_message", "%"+messageID+"%").First(&ev).Error; err != nil {
		return 0, err
	}
	return ev.Cursor, nil
}
