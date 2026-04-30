# DM-8 Content Lock — bookmark 文案 + DOM byte-identical 锁 (野马 v0)

> 战马C · 2026-04-30 · DM-8 message bookmark 文案 + DOM 字面锁
> **关联**: spec `dm-8-spec.md` v0 + acceptance `dm-8.md` + stance `dm-8-stance-checklist.md`. 跟 CV-6 / AL-9 / DM-7 / CV-2 v2 / CV-3 v2 同 4 件套模式.

## §1 BookmarkButton 文案锁 (4 字面 byte-identical)

字面 (改 = 改三处: client component + 此 content-lock + 测试文件):

```
bookmark.off_label    → "收藏"
bookmark.on_label     → "已收藏"
bookmark.hover_title  → "取消收藏"
bookmark.panel_title  → "我的收藏"
```

**反向 grep** (count==0): `star|save|pin|favorite|⭐|♡|★|收(?!藏)` 在
`packages/client/src/` (排除 `收藏` 4 字面 white-list).

## §2 BookmarkButton + BookmarksPanel DOM 字面锁

容器 + 单 row byte-identical (改 = 改两处: 此 content-lock +
`packages/client/src/components/BookmarkButton.tsx` +
`packages/client/src/components/BookmarksPanel.tsx`):

### §2.1 BookmarkButton

```html
<button
  type="button"
  class="bookmark-btn"
  data-testid="bookmark-btn"
  data-bookmarked="true|false"
  title="{已收藏:取消收藏 | 未收藏:收藏}"
  aria-pressed="true|false"
>
  {已收藏 ? '已收藏' : '收藏'}
</button>
```

`data-bookmarked` 双 enum byte-identical 跟 server `bookmarked_by` array
contains current user.ID 1:1 映射.

### §2.2 BookmarksPanel

```html
<section
  class="bookmarks-panel"
  data-testid="bookmarks-panel"
  aria-label="我的收藏"
>
  <h2 class="bookmarks-panel-title">我的收藏</h2>
  <ul class="bookmarks-list">
    <li
      data-testid="bookmark-row"
      data-message-id="<uuid>"
      data-channel-id="<uuid>"
      class="bookmark-row"
    >
      <span class="bookmark-row-channel">{channel_name}</span>
      <span class="bookmark-row-content">{content_excerpt}</span>
      <span class="bookmark-row-time">{relative_time}</span>
    </li>
  </ul>
</section>
```

## §3 5 错码字面单源 (server const ↔ client toast 双向锁)

`internal/api/dm_8_bookmark.go::BookmarkErrCode*` const + `packages/client/
src/lib/api.ts::BOOKMARK_ERR_TOAST` map 双向锁 (跟 CV-6 SEARCH_ERR_TOAST
/ AL-9 AUDIT_ERR_TOAST 同模式):

```ts
export const BOOKMARK_ERR_TOAST: Record<string, string> = {
  'bookmark.not_found':         '消息不存在',
  'bookmark.not_member':        '无权访问此频道',
  'bookmark.not_owner':         '无权操作他人收藏',
  'bookmark.cross_org_denied':  '跨组织收藏被禁',
  'bookmark.invalid_request':   '请求格式不合法',
};
```

**改 = 改三处** (server const + client map + 此 content-lock); CI lint
等价单测守 future drift.

## §4 跨 PR drift 守

改 4 文案 / 5 错码 / DOM data-* attrs = 改五处 (双向 grep 等价单测覆盖):
1. `internal/api/dm_8_bookmark.go::BookmarkErrCode*` const (5 字面)
2. `packages/client/src/lib/api.ts::BOOKMARK_ERR_TOAST` (5 字面)
3. `packages/client/src/components/BookmarkButton.tsx` (4 文案 + DOM data-*)
4. `packages/client/src/components/BookmarksPanel.tsx` (1 文案 + DOM data-*)
5. 此 content-lock §1+§2+§3

## §5 admin god-mode 红线 (隐私承诺第 4 行同源)

bookmark 是 per-user 私人状态. admin-rail 0 endpoint, admin god-mode
看不到任意用户 bookmarks (跟 ADM-1 §4.1 用户隐私承诺 "admin 不看用户私人
状态" 字面同源, 反向 grep `admin-api.*bookmark|admin.*bookmark.*GET` 在
`internal/api/` count==0).

## 更新日志

- 2026-04-30 — 战马C v0 (4 件套第四件 ≤30 行): BookmarkButton 4 文案 +
  BookmarksPanel DOM + 5 错码 toast 双向锁 + admin 不挂红线; 反同义词
  漂移 8 字面禁; 跟 CV-6 / AL-9 / DM-7 / CV-2 v2 / CV-3 v2 / AL-5 同
  4 件套模式.
