// Package store — dm_8_bookmark.go: DM-8.2 message bookmark helpers.
//
// Spec: docs/implementation/modules/dm-8-spec.md §0 立场 ②+③ + §1 拆段
// DM-8.2.
//
// Behaviour contract:
//   - ToggleMessageBookmark: atomic RMW (SELECT bookmarked_by → JSON
//     unmarshal → add/remove userID → JSON marshal → UPDATE) inside a
//     single transaction. Returns added=true if user was added, false
//     if user was removed (toggle semantic, idempotent for repeat).
//   - ListMessagesBookmarkedByUser: returns the messages a user has
//     bookmarked, ordered by message created_at DESC, capped at limit.
//   - IsMessageBookmarkedByUser: pure read helper (used by handler when
//     building per-message `is_bookmarked` bool —立场 ⑤ does NOT expose
//     raw bookmarked_by JSON to other users).
//
// 反约束 (dm-8-spec.md §0 立场 ②+③+⑤):
//   - 改 = 改此一处 — handler / api 层不直接 SQL touch bookmarked_by.
//   - admin god-mode 0 endpoint (handler 层守门).
//   - per-user view 不漏 cross-user UUID — sanitize 在 handler 层.
package store

import (
	"encoding/json"
	"errors"

	"gorm.io/gorm"
)

// ToggleMessageBookmark adds or removes userID from messageID's
// bookmarked_by JSON array. Returns:
//   - added=true when userID was newly added (was not present before)
//   - added=false when userID was removed (was present before)
//
// Atomic via a single transaction so concurrent toggles by the same
// user are race-safe.
func (s *Store) ToggleMessageBookmark(messageID, userID string) (added bool, err error) {
	if messageID == "" || userID == "" {
		return false, errors.New("messageID and userID required")
	}
	err = s.db.Transaction(func(tx *gorm.DB) error {
		var existing Message
		if err := tx.Select("id", "bookmarked_by").
			Where("id = ?", messageID).First(&existing).Error; err != nil {
			return err
		}
		var arr []string
		if existing.BookmarkedBy != nil && *existing.BookmarkedBy != "" {
			if err := json.Unmarshal([]byte(*existing.BookmarkedBy), &arr); err != nil {
				// Corrupt JSON treated as empty (forward-only repair).
				arr = nil
			}
		}
		// Toggle: if present, remove; else add.
		idx := -1
		for i, u := range arr {
			if u == userID {
				idx = i
				break
			}
		}
		if idx >= 0 {
			arr = append(arr[:idx], arr[idx+1:]...)
			added = false
		} else {
			arr = append(arr, userID)
			added = true
		}
		var blob *string
		if len(arr) > 0 {
			b, mErr := json.Marshal(arr)
			if mErr != nil {
				return mErr
			}
			s := string(b)
			blob = &s
		}
		// Persist (NULL when array is empty — keeps cardinality of
		// "no bookmarks" rows to NULL like before any toggle).
		updates := map[string]any{"bookmarked_by": blob}
		return tx.Model(&Message{}).Where("id = ?", messageID).
			Updates(updates).Error
	})
	return added, err
}

// IsMessageBookmarkedByUser returns true iff userID is in messageID's
// bookmarked_by array. Used by handler to render per-message
// `is_bookmarked` bool (立场 ⑤ — does NOT leak raw array to other users).
func (s *Store) IsMessageBookmarkedByUser(messageID, userID string) (bool, error) {
	if messageID == "" || userID == "" {
		return false, errors.New("messageID and userID required")
	}
	var existing Message
	if err := s.db.Select("bookmarked_by").
		Where("id = ?", messageID).First(&existing).Error; err != nil {
		return false, err
	}
	if existing.BookmarkedBy == nil || *existing.BookmarkedBy == "" {
		return false, nil
	}
	var arr []string
	if err := json.Unmarshal([]byte(*existing.BookmarkedBy), &arr); err != nil {
		return false, nil
	}
	for _, u := range arr {
		if u == userID {
			return true, nil
		}
	}
	return false, nil
}

// ListMessagesBookmarkedByUser returns messages userID has bookmarked,
// ordered by message created_at DESC, capped at limit (default 50, max
// 200). Filters deleted_at IS NULL (无活跃 message 不返回).
//
// JSON_EXTRACT scan (SQLite native) — 反向 grep `bookmark.*WHERE.*LIKE`
// 0 hit (反约束 不走 string LIKE 漏检).
func (s *Store) ListMessagesBookmarkedByUser(userID string, limit int) ([]Message, error) {
	if userID == "" {
		return nil, errors.New("userID required")
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var rows []Message
	// SQLite JSON1: EXISTS (SELECT 1 FROM json_each(bookmarked_by) WHERE value=?)
	err := s.db.
		Where("bookmarked_by IS NOT NULL").
		Where("EXISTS (SELECT 1 FROM json_each(bookmarked_by) WHERE value = ?)", userID).
		Where("deleted_at IS NULL").
		Order("created_at DESC").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}
