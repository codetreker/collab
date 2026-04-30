# Acceptance Template — AL-9: audit log SSE push (admin live monitor)

> Spec: `docs/implementation/modules/al-9-spec.md` (战马C v0, 649a704)
> 蓝图: `admin-model.md` §1.3 + `auth-permissions.md` §1.3 + ADM-0 §1.3 admin-rail 红线
> 前置: ADM-2.1 #484 admin_actions ✅ + ADM-2.2 GET /admin-api/v1/audit-log poll ✅ + RT-1.1 #290 cursor SSE pattern + #533 SSE subscribe-before-handshake fix + 6 audit writer (ADM-2.1 / AL-1 / BPP-4 / BPP-8 / AP-2 / AL-7)

## 验收清单

### AL-9.1 server SSE endpoint + AuditEventFrame

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 1.1 GET /admin-api/v1/audit-log/events admin-rail mw — Content-Type: text/event-stream + `:connected` flush + Last-Event-ID resume; subscribe-before-handshake 顺序 (跟 #533 fix 模式) | unit | 战马C / 烈马 | `internal/api/audit_events_test.go::TestAL91_HandleAuditEventsAdminOnly` (admin token 200 + Content-Type) + `TestAL91_SSESubscribeBeforeHandshakeOrdering` (Subscribe 在 WriteHeader 前, race 不再发) |
| 1.2 user-rail 反向断言 — `/api/v1/audit-log/events` 路径不存在 (反向 grep 0 hit + handler 路径不挂 user mw) | unit + reverse grep | 战马C / 烈马 | `TestAL91_UserRail401NotMounted` (走 user cookie → 401/404) + 反向 grep filepath.Walk |
| 1.3 AuditEventFrame 7 字段 byte-identical — `{type='audit_event', cursor, action_id, actor_id, action, target_user_id, created_at}` (跟 ArtifactUpdated 7 字段 / AnchorCommentAdded 10 字段 同 envelope 模式) | unit | 战马C / 烈马 | `internal/ws/audit_event_frame_test.go::TestAuditEventFrameFieldOrder` (golden JSON byte-equality) |
| 1.4 5 错码字面单源 — `audit.{not_admin / cursor_invalid / sse_unsupported / cross_org_denied / connection_dropped}` (跟 AP-1/AP-2/AP-3/CV-2 v2/CV-3 v2/CV-6 const 同模式) | unit | 战马C / 烈马 | `audit_events_test.go::TestAL91_AuditErrCodeConstByteIdentical` (5 const 字面) |
| 1.5 since=cursor backfill 限 50 行 (反 unbounded replay; 立场 ⑨) | unit | 战马C / 烈马 | `TestAL91_SinceCursorBackfillLimit50` (insert 100 admin_actions, since=0 SSE replay 最多 50) |
| 1.6 反向 grep CI lint 等价单测 (5 grep 锚) | unit | 烈马 | `TestAL91_ReverseGrep_5Patterns_AllZeroHit` (filepath.Walk 5 pattern count==0) |

### AL-9.2 admin_actions INSERT hook → hub.PushAuditEvent

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 2.1 `Store.InsertAdminAction` 末尾调 `auditPusher.PushAuditEvent` seam (nil-safe, 跟 ArtifactPusher / IterationPusher / AnchorPusher 5+ 处同模式) | unit | 战马C / 烈马 | `internal/store/admin_actions_audit_pusher_test.go::TestAL92_InsertTriggersPush` + `TestAL92_NilPusherSafeNoPanic` |
| 2.2 `Hub.PushAuditEvent` 5 字段 byte-identical 跟 ADM-2.1 admin_actions schema 同源 — actor_id / action / target_user_id / created_at + action_id (跟 fan-out 第 6 处 audit writer 同精神) | unit | 战马C / 烈马 | `internal/ws/audit_event_frame_test.go::TestAL92_PushAuditEventFiveFieldByteIdentical` |
| 2.3 fan-out 锁链 — InsertAdminAction 唯一入口, 6 audit writer (ADM-2.1 / AL-1 / BPP-4 / BPP-8 / AP-2 / AL-7) 自动经此 hook (改 = 改 InsertAdminAction 一处) | grep + unit | 烈马 | `grep -rn "Store.InsertAdminAction" packages/server-go/internal/` ≥6 hits + `TestAL92_FanoutFromAllSixWriters` (mock 6 writer call → 6 push) |
| 2.4 cursor 单调 + dedup (RT-1.1 #290 既有同精神) | unit | 战马C / 烈马 | `audit_event_frame_test.go::TestAL92_PushAuditEventDedup` (concurrent 32 racer + cursor 单调) |

### AL-9.3 client admin SPA + closure

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 3.1 `packages/client/src/admin/components/AuditLogStream.tsx` — `useEventSource('/admin-api/v1/audit-log/events?since=<cursor>')` + 列出最近 50 行 + auto-scroll + DOM `data-testid="audit-event-row"` + `data-action-id` byte-identical (content-lock §2) | vitest | 战马C | `packages/client/src/__tests__/admin/AuditLogStream.test.tsx` (DOM 字面 + 单 row attrs + auto-scroll smoke) |
| 3.2 立场 ③ 反 polling fallback — 反向 grep `setInterval.*audit\|setTimeout.*fetch.*audit-log\|polling.audit_fallback` 在 packages/client/src/admin/ count==0 | grep | 烈马 | `AuditLogStream.test.tsx::TestAL93_NoPollingFallback` (filepath grep 等价单测) |
| 3.3 SSE 状态 3 文案 byte-identical (content-lock §3): "已连接" / "重连中…" / "断开" — 改 = 改三处 server const + client toast + content-lock | vitest | 战马C / 野马 | `AuditLogStream.test.tsx::SSEStatusToast3LiteralByteIdentical` |
| 3.4 server-side full-flow integration — admin POST /admin-api/v1/audit-log + insert admin_actions row → SSE event 推到 admin SPA → client DOM 单 row 写入 ≤3s | http e2e | 战马C / 烈马 | `internal/api/al_9_3_audit_sse_integration_test.go::TestAL93_FullFlow_AdminInsertThenSSEReceive` |
| 3.5 closure: registry §3 REG-AL9-001..006 + acceptance + PROGRESS [x] AL-9 + docs/current sync (server/api/audit-events.md + admin/audit-log-stream.md, 跟 CV-2 v2 / CV-3 v2 / CV-6 双 docs 同模式) | docs | 战马C / 烈马 | registry + PROGRESS + 4 件套全闭 |

## 不在本轮范围 (spec §4)

- v2 user-rail audit / SSE filter / 离线追溯 unbounded / agent SSE / search / saved query / GC

## 退出条件

- AL-9.1 1.1-1.6 (SSE endpoint + admin-rail + AuditEventFrame 7 字段 + 5 错码 + 50 行 limit + 反向 grep) ✅
- AL-9.2 2.1-2.4 (audit pusher seam + 5 字段 byte-identical + 6 writer fan-out + dedup) ✅
- AL-9.3 3.1-3.5 (client AuditLogStream + 反 polling + 3 文案 + e2e + closure) ✅
- 现网回归不破: 5+ 既有 milestone 路径零变 (audit pusher seam nil-safe, ADM-2 既有 endpoint 不动)
- REG-AL9-001..006 落 registry + 5 反约束 grep 全 count==0
- 4 件套全闭 (spec ✅ + stance ✅ + acceptance ✅ + content-lock ✅ — admin SPA SSE 状态文案锁)

## 更新日志

- 2026-04-30 — 战马C v0 acceptance template (4 件套第二件): 3 段实施 (1.1-1.6 / 2.1-2.4 / 3.1-3.5) + 1 不在范围 + 6 项退出条件. 联签 AL-9.1/.2/.3 三段同 branch 同 PR (一 milestone 一 PR 协议默认 1 PR).
