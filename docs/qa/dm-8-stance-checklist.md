# DM-8 立场反查清单 (战马C v0)

> 战马C · 2026-04-30 · DM-8 message bookmark 立场反查 (跟 DM-7 #558 / AL-7 / HB-5 同模式)

## §0 立场总表 (3 + 3 边界)

| # | 立场 | 蓝图字面 | 反约束 |
|---|---|---|---|
| ① | schema ALTER ADD nullable 跨八 milestone | 跟 AP-1.1+AP-3.1+AP-2.1+AL-7.1+HB-5.1+CHN-5.1+DM-7.1 同模式 (NULL=无收藏 / 现网零变) | `migrations/dm_8_\d+|ALTER messages.*bookmarked_by` 在 dm_7 后 1 hit; idempotent guard |
| ② | Toggle SSOT — store 层 RMW 原子单源 | 改 = 改 store 一处, handler 不直 SQL | 反向 grep `inline.*UPDATE.*messages.*bookmarked_by` 在 internal/api 0 hit |
| ③ | owner-only ACL 锁链第 20 处 (per-user) | 跟 AL-2a/BPP-3.2/AL-1/AL-5/DM-4/CV-4 v2/BPP-7/BPP-8/CV-6 9+ 处同模式 | POST/DELETE/GET 全 user-rail; admin god-mode 不挂 (ADM-0 §1.3 + content-lock 隐私承诺第 4 行) |
| ④ (边界) | 文案 byte-identical 4 字面 | content-lock §1 (`收藏 / 已收藏 / 取消收藏 / 我的收藏`) | 同义词反向 reject `star/save/pin/favorite/⭐/♡/★/收` 在 user-visible 0 hit |
| ⑤ (边界) | per-user view — bookmark cross-user 不漏 | bookmark 是 per-user 状态, server return 仅 current user 的 list | 反向 grep handler return `bookmarked_by.*\[\]string` 0 行 raw exposure |
| ⑥ (边界) | AST 锁链延伸第 17 处 forbidden token | best-effort 立场代码层守, 跟 BPP-4/5/6/7/8/CV-6 同模式 | 3 token (`pendingBookmarks/bookmarkQueue/deadLetterBookmark`) 0 hit |

## §1 立场 ① schema ALTER ADD nullable 跨八 milestone

- [ ] migration v=36 `dm_8_1_messages_bookmarked_by` ALTER messages ADD COLUMN bookmarked_by TEXT NULL
- [ ] idempotent guard (PRAGMA table_info check)
- [ ] registry.go 字面锁 cv61ArtifactsFTS 后追加
- [ ] 反向 grep `CREATE TABLE.*bookmark|message_bookmarks 表` 0 hit (复用 messages 单源)

## §2 立场 ② Toggle SSOT

- [ ] `Store.ToggleMessageBookmark(messageID, userID) (added bool, err error)` 原子 RMW (SELECT → unmarshal → toggle → marshal → UPDATE)
- [ ] `Store.ListMessagesBookmarkedByUser(userID, limit) ([]Message, error)` JSON_EXTRACT 查询
- [ ] 反向 grep handler 内 `UPDATE messages.*bookmarked_by` 0 hit (强制走 store 单源)
- [ ] concurrent toggle 反 race — RMW 单 transaction 单源

## §3 立场 ③ owner-only ACL 锁链第 20 处

- [ ] POST/DELETE /api/v1/messages/{messageID}/bookmark — user-rail (auth user.ID 写 self)
- [ ] GET /api/v1/me/bookmarks — user-rail (returns current user 的 bookmarks)
- [ ] message 存在 + channel.member 反向断言 (cross-org 走 HasCapability AP-3 自动 enforce)
- [ ] admin-rail 0 endpoint 反向断言 (反向 grep `admin-api.*bookmark` 0 hit)

## §4 立场 ④ 文案 byte-identical

- [ ] BookmarkButton 4 文案: `收藏` (off) / `已收藏` (on) / hover title `取消收藏` / panel title `我的收藏`
- [ ] 同义词反向 reject (8 字面同义词 user-visible 0 hit)

## §5 立场 ⑤ per-user view 不漏 cross-user

- [ ] sanitize layer 在 handler return 不暴露 bookmarked_by raw array
- [ ] GET /me/bookmarks 仅返回 current user 的 messages (反向断言 别 user UUID 不出现)

## §6 立场 ⑥ AST forbidden token

- [ ] `internal/api` AST scan `pendingBookmarks/bookmarkQueue/deadLetterBookmark` 0 hit (跟 BPP-4/5/6/7/8 forbidden 同模式)

## §7 联签 (实施 PR 时填)

- [ ] 飞马 (spec ↔ 立场对齐): _(签)_
- [ ] 烈马 (反向 grep + 单测覆盖率 ≥84% + 5 反约束 0 hit + ALTER 跨八 milestone byte-identical 锁): _(签)_
- [ ] 战马C (实施代码 ↔ 立场反查 6 项全过): _(签)_
