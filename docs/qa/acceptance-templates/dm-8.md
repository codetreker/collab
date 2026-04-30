# Acceptance Template — DM-8: DM message bookmark

> Spec: `docs/implementation/modules/dm-8-spec.md` (战马C v0)
> 立场: `docs/qa/dm-8-stance-checklist.md` (3 + 3 边界)
> 关联: DM-7 #558 ALTER messages 模式 + AL-7 archived_at + ADM-0 §1.3 admin god-mode 红线 + ADM-1 §4.1 隐私承诺第 4 行 (admin 不看用户私人状态)
> 前置: messages 表既有 ✅ + DM-7.1 v=34 edit_history ✅ + auth user-rail mw ✅

## 验收清单

### DM-8.1 schema migration v=36 ALTER messages ADD COLUMN bookmarked_by

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 1.1 ALTER messages ADD COLUMN bookmarked_by TEXT NULL idempotent | unit | 战马C / 烈马 | `migrations/dm_8_1_messages_bookmarked_by_test.go::TestDM81_AddsBookmarkedByColumn` + `TestDM81_Idempotent` (rerun no-op) |
| 1.2 跨八 milestone ALTER ADD nullable byte-identical | grep + unit | 烈马 | `grep -n 'ALTER TABLE.*ADD COLUMN.*NULL' migrations/{ap_1_1,ap_3_1,ap_2_1,al_7_1,hb_5_1,chn_5_1,dm_7_1,dm_8_1}*.go` 8 hits 同句法 |
| 1.3 不裂表 反向断言 | grep | 战马C / 烈马 | `grep -rE 'CREATE TABLE.*bookmark\|message_bookmarks' migrations/` 0 hit |
| 1.4 registry.go 字面锁 cv61 后追加 | unit | 烈马 | `TestDM81_RegistryHasV36` (v=36 name byte-identical) |

### DM-8.2 server Toggle SSOT + 3 endpoints owner-only

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 2.1 `Store.ToggleMessageBookmark` 原子 RMW (SELECT → unmarshal → toggle → marshal → UPDATE 单 tx) | unit | 战马C / 烈马 | `store/queries_test.go::TestDM82_ToggleAddsThenRemoves` (idempotent toggle) + `TestDM82_ConcurrentToggleNoLost` (32 racer, final state determinant) |
| 2.2 `Store.ListMessagesBookmarkedByUser` JSON_EXTRACT 查询 + limit clamp default 50/max 200 | unit | 战马C / 烈马 | `TestDM82_ListBookmarkedByUser_Returns` (seed 3 → list 3) + `_LimitClampDefault` |
| 2.3 POST + DELETE /api/v1/messages/{messageID}/bookmark — owner-only (auth user.ID write self), message 存在 + channel.member ACL | unit | 战马C / 烈马 | `internal/api/dm_8_bookmark_test.go::TestDM82_BookmarkAddRemove_HappyPath` + `_NotFound404` + `_NonMember403` |
| 2.4 GET /api/v1/me/bookmarks 仅返回 current user 的 bookmarks (cross-user UUID 不漏) | unit | 战马C / 烈马 | `TestDM82_ListMyBookmarks_Returns` + `_DoesNotExposeOtherUsersBookmarks` (seed userA + userB → userA GET only A's) |
| 2.5 admin-rail 0 endpoint 反向断言 + admin token POST/DELETE/GET 401/404 | grep + unit | 战马C / 烈马 | filepath grep `admin-api.*bookmark` 0 hit + `TestDM82_AdminAPINotMounted` |
| 2.6 sanitize layer — handler return 不暴露 bookmarked_by raw JSON array | unit | 战马C / 烈马 | `TestDM82_NoBookmarkedByRawExposure` (response body grep `bookmarked_by` 0 hit) |
| 2.7 5 错码字面单源 (`bookmark.{not_found, not_member, not_owner, cross_org_denied, invalid_request}`) byte-identical 跟 client BOOKMARK_ERR_TOAST + content-lock §3 | unit | 战马C / 烈马 | `TestDM82_BookmarkErrCodeConstByteIdentical` (5 const) |

### DM-8.3 client BookmarkButton + BookmarksPanel + 文案锁

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 3.1 `BookmarkButton.tsx` DOM `data-testid="bookmark-btn"` + `data-bookmarked={true|false}` + 4 文案 byte-identical (`收藏 / 已收藏` + hover title `取消收藏`); click toggle | vitest | 战马C | `__tests__/BookmarkButton.test.tsx` 5 cases (DOM/4 文案/toggle on/toggle off/hover title) |
| 3.2 `BookmarksPanel.tsx` `我的收藏` title byte-identical + `data-testid="bookmarks-panel"` 容器 + `data-testid="bookmark-row"` 行 + click jump | vitest | 战马C | `__tests__/BookmarksPanel.test.tsx` 5 cases (title/容器/row/click anchor/空状态) |
| 3.3 同义词反向 grep 8 字面 user-visible 0 hit | grep | 烈马 | `bookmark-content-lock.test.ts` filepath grep `star\|save\|pin\|favorite\|⭐\|♡\|★\|收(?!藏)` in packages/client/src 0 hit (excluding 收藏 4 字面 white-list) |
| 3.4 BOOKMARK_ERR_TOAST 5 错码 byte-identical 跟 server const + content-lock §3 (改 = 改三处) | vitest | 战马C / 野马 | `BookmarkButton.test.tsx::ErrToastByteIdentical` (5 keys exact) |
| 3.5 closure: REG-DM8-001..006 + acceptance + PROGRESS [x] DM-8 | docs | 战马C / 烈马 | registry + PROGRESS + 4 件套全闭 |

## 不在本轮范围 (spec §3)

- bookmark 全文搜 (留 v3, 跟 CV-6 FTS5 同期)
- bookmark folder / 分组 (留 v3, MVP per-user flat list)
- bookmark export / share (永久不挂 — per-user private)
- bookmark notification / digest (留 v3 + DL-4 web push)
- admin god-mode bookmark view (永久不挂 ADM-0 §1.3 + ADM-1 §4.1)
- bookmark 计数 aggregate (留 v3, per-message popularity)

## 退出条件

- DM-8.1 1.1-1.4 (schema ALTER + idempotent + 跨八 byte-identical + 不裂表) ✅
- DM-8.2 2.1-2.7 (Toggle SSOT + ListByUser + 3 endpoints owner-only + cross-user 不漏 + admin-not-mounted + sanitize + 5 错码) ✅
- DM-8.3 3.1-3.5 (BookmarkButton + BookmarksPanel + 同义词反向 + ERR_TOAST + closure) ✅
- 5 反向 grep count==0 (admin-api/bookmark + CREATE TABLE bookmark + 同义词 + handler raw expose + AST forbidden 3 token)
- REG-DM8-001..006 落 registry + 4 件套全闭 (spec ✅ + stance ✅ + acceptance ✅ + content-lock ✅)
