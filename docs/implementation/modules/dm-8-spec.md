# DM-8 spec brief — DM message bookmark (战马C v0)

> Phase 6 DM message bookmark — 用户标记任意 message 为 "我的收藏",
> per-user toggle. 跟 DM-7 #558 edit_history 同 ALTER 模式 (messages
> 表 ALTER ADD COLUMN nullable) — 跨八 milestone (AP-1.1+AP-3.1+AP-2.1+
> AL-7.1+HB-5.1+CHN-5.1+DM-7.1+DM-8.1) 同 schema migration 模式.
> Per-user owner-only ACL (跟 owner-only ACL 锁链第 20 处).

## §0 立场 (3 + 3 边界)

- **①** schema migration v=36 ALTER messages ADD COLUMN bookmarked_by
  TEXT NULL (跟 DM-7.1 edit_history v=34 + AP-1.1+AP-3.1+AP-2.1+AL-7.1+
  HB-5.1+CHN-5.1 跨八 milestone ALTER ADD nullable 同模式; NULL = 无人
  收藏 / 现网行为零变 / 老消息行 byte-identical 不动). 反向 grep
  `migrations/dm_8_\d+|ALTER messages.*bookmarked_by` 在 dm_7_1 后必有 1
  hit (本 migration 单源). JSON array `["user-uuid", ...]`, RMW 走 store
  layer 单源.
- **②** Toggle SSOT 路径 — `Store.ToggleMessageBookmark(messageID, userID)`
  原子 RMW (SELECT bookmarked_by → JSON parse → add/remove userID →
  UPDATE), 改 = 改 store 一处. POST /api/v1/messages/:id/bookmark add +
  DELETE 同 endpoint remove + GET /api/v1/me/bookmarks list (sender +
  current user 在 bookmarked_by 反向断言, owner-only per-user). admin
  god-mode 不挂 (ADM-0 §1.3 红线 — admin 看用户收藏违反 §4.1 隐私承诺).
- **③** owner-only ACL 锁链第 20 处 — POST/DELETE/GET 全 user-rail; 反向
  grep `admin.*bookmark\|admin-api.*bookmark` 0 hit.

边界:
- **④** 文案 byte-identical 跟 content-lock §1 — `收藏` 2 字 toggle off
  state + `已收藏` 3 字 toggle on state + `取消收藏` 4 字 hover/title +
  `我的收藏` 4 字 panel title. 同义词反向 reject (`star/save/pin/
  favorite/⭐/♡/★/收`) 在 packages/client/src/ user-visible 0 hit.
- **⑤** 反 cross-user view — bookmark 是 per-user 状态, GET 仅返回当前
  user 的 bookmarks (反向断言: 别 user 的 bookmark UUID 不漏出 — 反向
  grep handler return `bookmarked_by.*[]string` 0 行 raw exposure).
- **⑥** AST 锁链延伸第 17 处 forbidden 3 token (`pendingBookmarks /
  bookmarkQueue / deadLetterBookmark`) 在 internal/api 0 hit.

## §1 拆段

**DM-8.1 — schema migration v=36**: ALTER messages ADD COLUMN
bookmarked_by TEXT NULL (跟 DM-7.1 同模式; idempotent guard).

**DM-8.2 — server**:
- `internal/store/queries.go` 加 `ToggleMessageBookmark(messageID, userID)
  (added bool, err error)` + `ListMessagesBookmarkedByUser(userID, limit)
  ([]Message, error)`. RMW 原子 — SELECT bookmarked_by → JSON Unmarshal
  → toggle → JSON Marshal → UPDATE 单源 (跟 DM-7 UpdateMessage 同精神).
- `internal/api/dm_8_bookmark.go` POST /api/v1/messages/:id/bookmark add
  + DELETE 同 endpoint remove + GET /api/v1/me/bookmarks list. message
  存在 + channel.member 反向断言 + cross-org reject (走 HasCapability AP-3
  自动 enforce). admin-rail 不挂 — 反向 grep 守.

**DM-8.3 — client**:
- `lib/api.ts::toggleMessageBookmark` (POST/DELETE) +
  `listMyBookmarks(limit?)` GET 单源.
- `components/BookmarkButton.tsx` 文案 byte-identical (`收藏` /
  `已收藏` / hover title `取消收藏`) + DOM `data-testid="bookmark-btn"` +
  `data-bookmarked={true|false}` + own-only render reverse assertion.
- `components/BookmarksPanel.tsx` `我的收藏` title byte-identical + 列表
  DOM `data-testid="bookmarks-panel"` + 行 `data-testid="bookmark-row"`
  + click jump to message anchor.

**DM-8.4 — closure**: REG-DM8-001..006 6 🟢 + AST scan + admin-not-mounted
+ 同义词反向 grep 全 0 hit.

## §2 反约束 grep 锚

- ALTER ADD COLUMN nullable 跨八 milestone (AP-1.1+AP-3.1+AP-2.1+AL-7.1+
  HB-5.1+CHN-5.1+DM-7.1+DM-8.1).
- admin god-mode 不挂: 反向 grep `admin.*bookmark\|admin-api.*bookmark`
  0 hit (ADM-0 §1.3 + 立场 ②).
- 同义词反向 reject (user-visible): `star\|save\|pin\|favorite\|⭐\|♡\|★`
  在 packages/client/src/ user-visible 文案 0 hit (i18n 中文锁).
- bookmark cross-user 漏出反向: handler return `bookmarked_by.*\[\]
  string` 0 行 raw exposure.
- AST 锁链延伸第 17 处 forbidden 3 token 0 hit.

## §3 不在范围

- bookmark 全文搜 (留 v3, 跟 CV-6 FTS5 同期 message body search).
- bookmark folder / 分组 (留 v3, MVP per-user flat list).
- bookmark export / share (永久不挂 — per-user private).
- bookmark notification / digest (留 v3 + DL-4 web push).
- admin god-mode bookmark view (永久不挂 ADM-0 §1.3 + content-lock §4.1
  隐私承诺).
- bookmark 计数 aggregate (per-message popularity, 留 v3).
