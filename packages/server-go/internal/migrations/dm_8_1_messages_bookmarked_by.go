package migrations

import "gorm.io/gorm"

// dm81MessagesBookmarkedBy is migration v=36 — Phase 6 / DM-8.1.
//
// Blueprint锚: dm-model.md §1 message-level user-state. Spec brief:
// docs/implementation/modules/dm-8-spec.md §0 立场 ① + §1 拆段 DM-8.1.
//
// What this migration does (跟 DM-7.1 edit_history v=34 + AP-1.1+AP-3.1+
// AP-2.1+AL-7.1+HB-5.1+CHN-5.1 跨八 milestone ALTER ADD COLUMN nullable
// 同模式):
//
//   ALTER TABLE messages ADD COLUMN bookmarked_by TEXT NULL
//
// bookmarked_by is a JSON array of user UUIDs (`["user-uuid", ...]`)
// toggled by Store.ToggleMessageBookmark (DM-8.2 single-source RMW).
// NULL = no one bookmarked / 老消息行 byte-identical 不动 / 现网行为
// 零变.
//
// 反约束 (dm-8-spec.md §0 立场 ①+④):
//   - 不挂 NOT NULL — bookmarked_by NULL = 无收藏 (跟 DM-7.1 edit_history
//     NULL = no edits 同精神).
//   - 不挂 default 值 — NULL 是合法终态.
//   - 不另起 message_bookmarks 表 — JSON array on messages 列单源 (反向
//     grep `CREATE TABLE.*bookmark|message_bookmarks` 0 hit, 立场 ① 守).
//
// v=36 sequencing: DM-7.1 v=34 (#558 merged) → CV-6.1 v=35 (#531 in flight)
// → DM-8.1 **v=36** (本 migration). registry.go 字面锁; 顺位.
//
// v0 stance: forward-only, no Down().
var dm81MessagesBookmarkedBy = Migration{
	Version: 36,
	Name:    "dm_8_1_messages_bookmarked_by",
	Up: func(tx *gorm.DB) error {
		if exists, err := hasTable(tx, "messages"); err != nil {
			return err
		} else if !exists {
			return nil
		}
		// Idempotent guard 跟 DM-7.1 / AL-7.1 / HB-5.1 同模式.
		if has, err := hasColumn(tx, "messages", "bookmarked_by"); err != nil {
			return err
		} else if has {
			return nil
		}
		return tx.Exec(`ALTER TABLE messages ADD COLUMN bookmarked_by TEXT`).Error
	},
}
