# DM-5 spec brief — DM message reaction summary (CV-7..CV-12 续, client only)

> 战马E · Phase 5+ · ≤80 行 · 蓝图 [`concept-model.md`](../../blueprint/concept-model.md) §4 + DM-2/DM-3/DM-4 续 + CV-7 #535 既有 reaction endpoint 复用 + CV-9..CV-12 client-only 同模式. DM-5 让 DM message reaction 渲染 aggregated count chip — server 既有 GET `/api/v1/messages/{id}/reactions` 已返 `[{emoji, count, user_ids}]` (store/queries_phase2b.go::AggregatedReaction), client 仅渲染. **0 server production code + 0 schema 改 + 0 新 endpoint + 0 新 lib**.

## 0. 关键约束 (4 项立场, 跨链承袭)

1. **reaction 走既有 PUT/DELETE/GET `/api/v1/messages/{id}/reactions` 单源, 0 server code** (CV-7 #535 既有 endpoint + AggregatedReaction 既有 shape; CV-9..CV-12 client-only 同模式延伸): client 调既有 GET 拉 `[{emoji, count, user_ids}]`, 渲染 chip. **反约束**: 不开 `/api/v1/dm/.*/reactions` 别名 endpoint / 不开 reaction_summary 缓存表 / 不另写 server aggregator. 反向 grep `dm5.*reaction|reaction_summary.*PRIMARY|dm5.*aggregator` 在 internal/ count==0.

2. **owner-only ACL byte-identical 15+ 处一致** (DM channel-member 既有 ACL 自动覆盖 reaction PUT/DELETE/GET; admin god-mode 不入 user rail): 跟 ADM-0 §1.3 + CV-7..CV-12 同源. **反向 grep**: `admin.*dm.*reaction|admin.*reaction.*summary` 在 admin*.go count==0.

3. **thinking 5-pattern 锁链不漂** (read-side, 不解 markdown / thinking): 5-pattern 仍 server CV-7/CV-8 既有 hook 第 8 处不变. client reaction chip 不预判 thinking. 锁链 8 处不变 (RT-3 + BPP-2.2 + AL-1b + CV-5 + CV-7 + CV-8 + CV-9 + CV-11).

4. **client UI: chip DOM 锚 + 文案 byte-identical** (content-lock): chip 渲染 `data-dm5-reaction-chip="<emoji>"` + `data-dm5-reaction-count="<N>"` 锚; 文案 `{emoji} {count}` byte-identical (空格分隔, 跟 既有 chat reaction chip 同模式承袭若有, 否则新锁); current user reacted highlight `data-dm5-reaction-mine` 锚 (反向 grep ≥1). **反约束**: 不另起 emoji picker 类 (复用现有 unicode 直接发).

## 1. 拆段实施 (3 段, 一 milestone 一 PR)

| 段 | 文件 | 范围 |
|---|---|---|
| DM-5.1 server | (无 server 实施) + `internal/api/dm_5_reaction_summary_test.go` 1 unit 反向断 既有 GET endpoint 在 DM channel 上工作 byte-identical (跟 channel message reaction 等价) | 1 unit PASS; **0 行 production code** |
| DM-5.2 client | `packages/client/src/components/ReactionChip.tsx` + `ReactionSummary.tsx` (新, 渲染 array of chips) + content-lock | 复用 CV-7 既有 `addReaction` + 加 `removeReaction` (若不存在) + 拉 GET aggregated; chip click → toggle (mine: DELETE / not-mine: PUT); 5 vitest |
| DM-5.3 e2e + closure | `packages/e2e/tests/dm-5-reaction-summary.spec.ts` (3 case, REST-driven) + REG-DM5-001..005 + acceptance + PROGRESS [x] | 3 case: 2 users reaction → count==2 / same user reaction idempotent / cross-channel reject |

## 2. 错误码 (0 新 — 沿用 CV-7..CV-12 既有)

DM-5 复用 CV-7 既有 reaction response shape; 0 错误码新增.

## 3. 反向 grep 锚 (DM-5 实施 PR 必跑)

```
git grep -nE 'dm5.*reaction|reaction_summary.*PRIMARY|dm5.*aggregator' packages/server-go/internal/  # 0 hit (单源)
git grep -nE 'admin.*dm.*reaction|admin.*reaction.*summary' packages/server-go/internal/api/admin  # 0 hit (ADM-0 §1.3)
git grep -nE 'data-dm5-reaction-chip|data-dm5-reaction-count|data-dm5-reaction-mine' packages/client/src/  # ≥ 3 hit (DOM 锚)
git grep -nE 'dm5.*emoji.*picker|DM5EmojiPicker' packages/client/src/  # 0 hit (反约束 emoji picker)
git grep -nE 'dm5.*thinking|dm5.*subject' packages/client/src/  # 0 hit (5-pattern 锁链不漂)
```

## 4. 不在本轮范围 (deferred)

- ❌ 自定义 emoji upload (留 v2)
- ❌ reaction notification (留 v2 — 类 mention)
- ❌ admin god-mode 看 reaction summary (ADM-0 §1.3 红线)
- ❌ schema migration (0 schema 改, message_reactions 既有表覆盖)
- ❌ reaction WS push frame (留 v2 — 现 polling on render is OK; CV-7 已有 GET 拉)
