package migrations

import (
	"gorm.io/gorm"
)

// chn31UserChannelLayout is migration v=19 — Phase 3 / CHN-3.1.
//
// Blueprint锚: `channel-model.md` §1.4 (作者定义大局 + 个人偏好微调) +
// §3.4 (差距 — 缺个人折叠/排序, 蓝图建议 `user_channel_layout(user_id,
// channel_id, collapsed, position)`).
// Spec: `docs/implementation/modules/chn-3-spec.md` §0 (3 立场) + §1
// CHN-3.1 段.
// Stance: `docs/qa/chn-3-stance-checklist.md` (野马 #366, 7 立场 byte-
// identical).
// Acceptance: `docs/qa/acceptance-templates/chn-3.md` §1.* (待 #376).
// Content lock: `docs/qa/chn-3-content-lock.md` (野马 #402, 6 字面锁 +
// DM 反约束 5 源).
//
// What this migration does:
//   1. CREATE TABLE user_channel_layout:
//        - user_id    TEXT    NOT NULL              (FK users.id; 逻辑 FK,
//                                                    跟 al_3_1 / al_4_1 /
//                                                    cv_2_1 / dm_2_1 /
//                                                    cv_4_1 同模式)
//        - channel_id TEXT    NOT NULL              (FK channels.id; 同上)
//        - collapsed  INTEGER NOT NULL DEFAULT 0    (BOOL 0/1; group 折叠
//                                                    状态; 立场 ① 个人偏好
//                                                    两维之一)
//        - position   REAL    NOT NULL              (单调小数 ordering;
//                                                    pin = MIN(已有) - 1.0,
//                                                    立场 ②; 反约束: 不裂
//                                                    pinned BOOL 双源排序)
//        - created_at INTEGER NOT NULL              (Unix ms)
//        - updated_at INTEGER NOT NULL              (Unix ms; 客户端写时
//                                                    server stamp, 跟
//                                                    channel_groups #276
//                                                    同模式)
//        - PRIMARY KEY (user_id, channel_id)         (复合 PK; 本人偏好按
//                                                    user_id + channel_id
//                                                    唯一, 重复对 reject)
//   2. CREATE INDEX idx_user_channel_layout_user_id
//        ON user_channel_layout(user_id) — 本人 GET /me/layout 热路径
//        (CHN-3.2 server endpoint, acceptance §1.3 同模式 AL-4.1 #398
//        idx_runtime_owner 显式命名让 EXPLAIN QUERY PLAN 可读).
//
// 反约束 (chn-3-spec.md §0 + §3 + 野马 #366 stance 7 立场 + #402 6 字面锁):
//   - 立场 ① 物理拆死: 不动 channels / channel_groups 表 schema. 反向
//     grep `ALTER TABLE channels.*ADD.*collapsed` / `ALTER TABLE
//     channel_groups.*ADD.*position.*user` count==0 (#366 黑名单 ①).
//   - 立场 ② 个人偏好两维: 仅 collapsed + position. 列名反向断言:
//     hidden / muted / pinned / is_pinned / group_id 全无 (#366 黑名单
//     ② + ③, mute 走 Phase 5+ notification, hide 留 v3+).
//   - 立场 ③ pin 走 position 单调小数: 反向 grep `pinned BOOL` /
//     `pinned INTEGER` / `is_pinned` 列名 count==0 (避免 ORDER BY pinned
//     DESC, position ASC 双源排序, #366 立场 ③).
//   - 立场 ⑤ ADM-0 红线: schema 不挂 admin god-mode 字段 (admin 不读
//     业务数据). 列层无可视化, 反向 grep `admin.*user_channel_layout`
//     在 admin 路径 count==0.
//   - 立场 ⑥ ordering client 端: 表无 cursor 列 (跟 al_3_1 / al_4_1 /
//     cv_1_1 / cv_2_1 / dm_2_1 / cv_4_1 同模式 — RT-1 envelope cursor
//     是 frame 路径, 不下沉到偏好 schema).
//   - 立场 ⑦ lazy 清理不级联: 表无 ON DELETE CASCADE (作者删 group →
//     个人 layout 行 lazy GC 90d cron, 不阻塞作者删 group 路径; #366
//     立场 ⑦ + CHN-1 ⑤ soft delete 同精神).
//
// v0 stance: forward-only, no Down(). 表本身 v0 新增, IF NOT EXISTS 守
// idempotency. 跟 al_3_1 / al_4_1 / cv_2_1 / dm_2_1 / cv_4_1 同模式
// 逻辑 FK.
//
// v=19 sequencing (chn-3-spec.md §1 CHN-3.1): CV-2.1 v=14 ✅ (#359
// merged) / DM-2.1 v=15 ✅ (#361 merged) / AL-4.1 v=16 ✅ (#398 merged) /
// CV-3.1 v=17 ✅ (#388/#396 merged) / CV-4.1 v=18 ✅ (待 #404+ merge —
// 已落 registry.go) / **CHN-3.1 v=19** (本 migration).
// registry.go 字面锁.
var chn31UserChannelLayout = Migration{
	Version: 19,
	Name:    "chn_3_1_user_channel_layout",
	Up: func(tx *gorm.DB) error {
		if err := tx.Exec(`CREATE TABLE IF NOT EXISTS user_channel_layout (
  user_id    TEXT    NOT NULL,
  channel_id TEXT    NOT NULL,
  collapsed  INTEGER NOT NULL DEFAULT 0,
  position   REAL    NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, channel_id)
)`).Error; err != nil {
			return err
		}
		if err := tx.Exec(`CREATE INDEX IF NOT EXISTS idx_user_channel_layout_user_id
			ON user_channel_layout(user_id)`).Error; err != nil {
			return err
		}
		return nil
	},
}
