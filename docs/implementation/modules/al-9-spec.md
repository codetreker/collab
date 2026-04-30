# AL-9 spec brief — audit log SSE push (admin live monitor)

> 战马C · 2026-04-30 · ≤80 行 spec lock (4 件套之一; ADM-2 #484 续作 — admin SPA 看 audit log 从 GET poll 升级到 SSE live push)
> **蓝图锚**: [`admin-model.md`](../../blueprint/admin-model.md) §1.4 (admin 互可见 + Audit 100% 留痕 + 受影响者必感知) + [`auth-permissions.md`](../../blueprint/auth-permissions.md) §1.3 主入口
> **关联**: ADM-2.1 #484 admin_actions audit table ✅ + ADM-2.2 endpoint `GET /admin-api/v1/audit-log` poll ✅ + RT-1.1 #290 cursor SSE pattern + AL-1 #492 forward-only state_log + BPP-4 watchdog 写 audit + AP-2 #525 sweeper 写 audit + AL-7 #536 retention 写 audit + BPP-8 plugin_actions 写 audit + ADM-0 §1.3 admin-rail 红线

> ⚠️ AL-9 是 **wrapper milestone** (跟 AL-5 / AL-7 / CV-2 v2 / CV-3 v2 / CV-6 wrapper 同模式) — 复用 RT-1.1 cursor SSE pattern + ADM-2.1 既有 admin_actions table + admin_actions writer 路径 (ADM-2.2 / BPP-4 / AP-2 / AL-7), **不裂新 audit 表**, 不另起 SSE 通道; 仅补 server-side push hook + admin-rail SSE endpoint + 反约束.

## 0. 关键约束 (3 条立场, 蓝图字面承袭)

1. **admin-rail SSE only (反 user-rail 漂出)** (蓝图 `admin-model.md` §1.3 + ADM-0 红线第 7 处 owner-only ACL 同精神): SSE endpoint 走 `GET /admin-api/v1/audit-log/events` (跟 ADM-2.2 #484 既有 GET /admin-api/v1/audit-log 同 path 同 mw); **反约束** user-rail (`/api/v1/`) 不挂 audit SSE 路径; 反向 grep `\/api\/v1\/audit-log\/events` 在 internal/api/ count==0; cookie 拆 admin/user 两 mw 已就位 (ADM-0.2 既有), 不动. 立场 ⑤ admin god-mode 不入业务路径同精神 — admin 看自己的 audit 不算业务 (走 admin-rail).
2. **audit fan-out 锁链终结 (复用 hub.PushXxx 模式)** (跟 RT-1.1 #290 PushArtifactUpdated + AL-2b #481 PushAgentConfig + DM-2.2 #372 PushMentionPushed + CV-2.1 #360 PushAnchorCommentAdded + CV-4.2 PushIterationStateChanged 同精神 fan-out 第 6+ 处, audit 域跨链终结): 每次 `Store.InsertAdminAction` 调用后, 写 admin_actions 行 → call `hub.PushAuditEvent(action_id, actor, action, target_user_id, created_at)` (5 字段 byte-identical 跟 ADM-2.1 audit log forward-only 五字段同源 — actor / action / target / when / scope, 跟 HB-1/HB-2/BPP-4/BPP-8/HB-3 v2/AL-7 audit log **跨链锁第 6 处**); 反向 grep `audit_event` 自创 frame 字面 0 hit (复用 RT-1 cursor SSE envelope + 加 `type='audit_event'` discriminator)
3. **反 polling fallback (admin 必走 SSE, 反 short-circuit)** (跟 BPP-1 #304 / BPP-4 / DL-4 反 polling 同精神; AST 锁链延伸第 7 处): admin SPA `useAuditLogStream` hook 仅 SSE; 反向 grep `polling.audit_fallback\|audit.*setInterval\|audit.*setTimeout.*fetch` 在 packages/client/src/admin/ count==0 (反 polling 短路兜底); 反约束 不另起 audit SSE 通道 (复用 SSE 路径配置, 跟 RT-1.3 既有同源)

## 1. 拆段实施 (AL-9.1 / 9.2 / 9.3, ≤3 PR 同 branch 叠 commit, 一 milestone 一 PR 默认 1 PR)

| 段 | 范围 | 闭锁 | owner |
|---|---|---|---|
| **AL-9.1** server SSE endpoint + admin-rail mw + cursor frame | `internal/api/audit_events.go::handleAuditEvents` (GET /admin-api/v1/audit-log/events) — admin-rail mw 复用 (跟 ADM-2.2 #484 同 path); SSE writer 走 `text/event-stream` MIME + `data: {audit_event JSON}\n\n` (跟 既有 SSE backfill #524 同 frame 模式); since=cursor query param 复用 RT-1 cursor pattern; `internal/ws/audit_event_frame.go::AuditEventFrame{type, cursor, action_id, actor_id, action, target_user_id, created_at}` 7 字段 byte-identical (跟 ArtifactUpdated 7 字段 / AgentConfigPush 8 字段 / MentionPushed 8 字段 / AnchorCommentAdded 10 字段 同模式 envelope), `type` discriminator 字面 `"audit_event"`; 5 错码字面 (audit.{not_admin / cursor_invalid / sse_unsupported / cross_org_denied / connection_dropped}); 6 unit (TestAL91_HandleAuditEventsAdminOnly + UserRail401 + SSEFrameByteIdentical + CursorRecover + 5ErrCodeConst + ReverseGrepNoUserRailAuditSSE) | 待 PR (战马C) | 战马C |
| **AL-9.2** server admin_actions INSERT hook → hub.PushAuditEvent | `internal/store/admin_actions.go::InsertAdminAction` 末尾调 `auditPusher` seam (跟 ArtifactPusher / IterationPusher / AnchorPusher 同 seam pattern, nil-safe); `internal/ws/audit_event_frame.go::Hub.PushAuditEvent` (5 字段 byte-identical) — 跟 PushArtifactUpdated 等 5+ 处 fan-out 同精神. 立场 ② 跨 milestone audit 锁链第 6 处: ADM-2.1 admin_actions writer + AL-1 state_log writer + BPP-4 watchdog writer + BPP-8 plugin_actions writer + AP-2 sweeper writer + AL-7 retention sweeper writer **6 处全经 InsertAdminAction → 自动 fan-out**; 5 unit (TestAL92_PushAuditEventDedup + InsertAdminActionTriggersPush + NilPusherSafe + ConcurrentInsertOrdered + 5FieldByteIdentical) | 待 PR (战马C) | 战马C |
| **AL-9.3** client admin SPA `AuditLogStream.tsx` (live tail v1) + e2e + closure | `packages/client/src/admin/components/AuditLogStream.tsx` — `useEventSource('/admin-api/v1/audit-log/events?since=<cursor>')` hook + 列出最近 50 行 + auto-scroll + DOM `data-testid="audit-event-row"` + `data-action-id` byte-identical (跟既有 audit list 视图同模式); 反约束 不另起 polling fallback (反向 grep `setInterval.*audit\|setTimeout.*fetch.*audit-log` count==0); content-lock §2 SSE 状态指示文案锁 ("已连接" / "重连中…" / "断开"); server-side full-flow integration + REG-AL9-001..006 + acceptance + PROGRESS [x] AL-9 + docs/current sync (server/api/audit-events.md + admin/audit-log-stream.md, 跟 CV-2 v2 / CV-3 v2 / CV-6 双 docs 同模式) | 待 PR (战马C) | 战马C / 烈马 |

## 2. 留账边界 (不接 v2+)

- v2 user-rail audit (走 user 自己看自己的 admin_actions, 留 ADM-3+) — AL-9 仅 admin 互可见 (跟 ADM-2.2 立场 ③ 同精神)
- v2 SSE filter (按 actor_id / action / target 过滤) — v0 全 stream, filter 留 v2+
- v2 离线追溯 (browser 离线 N min 后 reconnect 拉过去 N min) — 走 since=cursor 已就位, 但 server-side replay 限 50 行 (反 unbounded backfill)
- agent / plugin SSE 路径 — agent runtime 不需 audit live (跟 BPP-4 watchdog 写 audit 同精神, 不消费)
- v3 audit search / saved query (留 v3+)

## 3. 反查 grep 锚 (5 反约束, count==0)

```bash
# 1) user-rail audit SSE 漂出 (admin-rail only)
git grep -nE '/api/v1/audit-log/events|user.*audit-log/events' \
  packages/server-go/internal/api/  # 0 hit
# 2) audit_event 自创 envelope (复用 RT-1 cursor SSE envelope)
git grep -nE '"audit_event_v2"|"audit_stream"|"admin_actions_event"' \
  packages/server-go/internal/  # 0 hit
# 3) polling fallback 短路 (admin 必走 SSE, AST 锁链延伸)
grep -E 'setInterval.*audit|setTimeout.*fetch.*audit-log|polling\.audit_fallback' \
  packages/client/src/admin/  # 0 hit
# 4) 不裂 audit 表 (复用 admin_actions, 跟 ADM-2.1 + AL-7 同精神)
git grep -nE 'CREATE TABLE.*audit_events|audit_stream_buffer|audit_live' \
  packages/server-go/internal/migrations/  # 0 hit
# 5) hardcode error code (跟 AP-1/AP-2/AP-3/CV-2 v2/CV-3 v2/CV-6 const 同模式)
git grep -nE '"audit\.(not_admin|cursor_invalid|sse_unsupported|cross_org_denied|connection_dropped)"' \
  packages/server-go/internal/  # ≥5 hits (api/audit_events.go const) + 0 hit hardcode in handler logic
```

## 4. 不在范围

- v2 user-rail audit / SSE filter / 离线追溯 unbounded / agent SSE / search / saved query
- elasticsearch / opensearch / typesense audit search infrastructure (蓝图 SQLite SSOT 字面承袭)
- audit GC / multi-tenant 隔离 (走 AL-7 retention 既有 + AP-3 cross-org gate)

## 5. 跨 milestone byte-identical 锁

- 跟 ADM-2.1 #484 admin_actions audit table + ADM-2.2 GET /admin-api/v1/audit-log endpoint 同源 (同 path namespace, 同 admin-rail mw)
- 跟 RT-1.1 #290 cursor SSE pattern + #524 SSE backfill + DM-3 既有 SSE 同源 (复用 envelope 模式 + cursor 进展)
- 跟 BPP-4 watchdog actor='system' + AP-2 sweeper + AL-7 retention sweeper **fan-out 锁链第 6 处** (改 = 改 InsertAdminAction 一处, 自动 fan-out 全链)
- 跟 ADM-0 §1.3 admin god-mode 不入业务路径同精神 (admin-rail only, owner-only ACL **第 7 处一致**)
- audit log 5 字段 byte-identical 跟 HB-1 / HB-2 / BPP-4 / BPP-8 / HB-3 v2 / AL-7 / AL-9 audit **跨链第 6+ 处** (actor / action / target / when / scope)

## 6. 更新日志

| 日期 | 作者 | 变化 |
|------|------|------|
| 2026-04-30 | 战马C | v0 spec brief — Phase 5+ wrapper milestone (跟 AL-7 #536 / CV-6 #531 / CV-3 v2 / CV-2 v2 同期, ADM-2 #484 续作 — admin live monitor 真有缝). 3 立场 (admin-rail SSE only / audit fan-out 锁链终结 / 反 polling fallback) + 5 反约束 grep + 3 段拆 (server SSE endpoint + admin-rail mw + AuditEventFrame 7 字段 byte-identical / admin_actions INSERT hook → hub.PushAuditEvent 5 字段 audit 锁链第 6 处 / client AuditLogStream live tail + closure) + 4 件套 spec 第一件 (acceptance + stance + content-lock 后续, content-lock 必需 — admin SPA UI 有 SSE 状态指示文案锁). 一 milestone 一 PR 协议默认 1 PR. |
