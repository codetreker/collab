// Package store — dm_10_pin_queries.go: DM-10 message pin store helpers.
//
// Spec: docs/implementation/modules/dm-10-spec.md §1 DM-10.2.
//
// Two helpers:
//   - SetMessagePinnedAt(messageID, pinnedAt) — POST/DELETE upsert path
//     (pinnedAt non-nil = pin, nil = unpin). Last-write-wins idempotent.
//   - ListPinnedMessages(channelID) — GET list scoped to channel,
//     pinned_at IS NOT NULL ORDER BY pinned_at DESC.

package store

// SetMessagePinnedAt updates messages.pinned_at for a single message.
// Pass nil to unpin, *int64 to pin. Idempotent.
func (s *Store) SetMessagePinnedAt(messageID string, pinnedAt *int64) error {
	return s.db.Model(&Message{}).
		Where("id = ?", messageID).
		Update("pinned_at", pinnedAt).Error
}

// ListPinnedMessages returns all pinned messages in a channel, ordered
// by pinned_at DESC (newest pin first). Excludes soft-deleted rows.
// Uses sparse partial idx_messages_pinned_at WHERE pinned_at IS NOT NULL
// (DM-10.1 migration v=45) for hot-path lookup.
func (s *Store) ListPinnedMessages(channelID string) ([]Message, error) {
	var msgs []Message
	if err := s.db.Where(
		"channel_id = ? AND pinned_at IS NOT NULL AND deleted_at IS NULL",
		channelID,
	).Order("pinned_at DESC").Find(&msgs).Error; err != nil {
		return nil, err
	}
	return msgs, nil
}
