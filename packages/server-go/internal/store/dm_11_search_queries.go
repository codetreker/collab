// Package store — dm_11_search_queries.go: DM-11 cross-DM message search.
//
// Spec: docs/implementation/modules/dm-11-spec.md §1 DM-11.2.
//
// Helper:
//   - SearchDMMessages(userID, query, limit) — list user's DM messages
//     matching `content LIKE %query%` across all DM channels the user is
//     a member of. Excludes soft-deleted rows. Filters channels to
//     type='dm' only (DM-only scope, 跟 DM-10 #597 同精神).

package store

// SearchDMMessages returns up to `limit` messages from DM channels the
// user is a member of, where content matches `query` case-sensitively
// (LIKE %query%). Ordered by created_at DESC.
//
// Reuses messages table + JOIN users for sender_name + JOIN channels
// for type filter (DM-only) + JOIN channel_members for ACL gate
// (反 cross-user leak).
//
// Forward-only stance: 0 schema 改 — 复用 messages.content + LIKE
// (跟 SearchMessages #467 既有同模式; FTS5 已在 CV-6 #531 落 artifacts_fts
// 表但不复用 — DM message search 不走 FTS5 避免跨表 join 复杂度, 留 v2).
func (s *Store) SearchDMMessages(userID string, query string, limit int) ([]MessageWithSender, error) {
	if limit <= 0 || limit > 50 {
		limit = 50
	}
	var msgs []MessageWithSender
	err := s.db.Table("messages m").
		Select("m.*, u.display_name AS sender_name").
		Joins("JOIN users u ON u.id = m.sender_id").
		Joins("JOIN channels c ON c.id = m.channel_id").
		Joins("JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = ?", userID).
		Where("c.type = ? AND m.content LIKE ? AND m.deleted_at IS NULL AND c.deleted_at IS NULL",
			"dm", "%"+query+"%").
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
