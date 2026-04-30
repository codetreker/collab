# AL-9 立场反查清单 (战马C v0)

> 战马C · 2026-04-30 · 立场 review checklist (跟 CV-6 / AL-7 / CV-3 v2 / CV-2 v2 / AP-2 / AP-3 同模式)
> **目的**: AL-9 三段实施 (9.1 server SSE endpoint / 9.2 admin_actions hook → hub.PushAuditEvent / 9.3 client + closure) PR review 时, 飞马 / 烈马按此清单逐立场 sign-off.
> **关联**: spec `docs/implementation/modules/al-9-spec.md` (战马C v0, 649a704). 复用 ADM-2.1 #484 admin_actions table + ADM-2.2 endpoint + RT-1.1 cursor SSE pattern (#533 subscribe-before-handshake fix) + 6 处 audit writer (ADM-2.1 / AL-1 / BPP-4 / BPP-8 / AP-2 / AL-7).

## §0 立场总表 (3 立场 + 7 边界)

| # | 立场 | 蓝图字面 | 反约束 (代码层守门) |
|---|---|---|---|
| ① | admin-rail SSE only (反 user-rail 漂出) | admin-model.md §1.3 + ADM-0 红线第 7 处 owner-only ACL 同精神 | endpoint 走 `GET /admin-api/v1/audit-log/events` (跟 ADM-2.2 同 mw); 反向 grep `\/api\/v1\/audit-log\/events` 在 internal/api/ count==0 |
| ② | audit fan-out 锁链终结 (复用 hub.PushXxx 模式) | 跟 RT-1.1 PushArtifactUpdated + AL-2b PushAgentConfig + DM-2.2 PushMentionPushed 等 fan-out 第 6+ 处, audit 域跨链终结 | `Store.InsertAdminAction` 末尾调 `auditPusher.PushAuditEvent` (nil-safe seam, 跟 ArtifactPusher / IterationPusher 同模式); AuditEventFrame 5 字段 byte-identical (action_id / actor_id / action / target_user_id / created_at), envelope 7 字段 (type/cursor 头 + 5 业务字段) byte-identical 跟 ArtifactUpdated 7 / AnchorCommentAdded 10 同 envelope 模式 |
| ③ | 反 polling fallback (admin 必走 SSE, 反 short-circuit) | 跟 BPP-1 / BPP-4 / DL-4 反 polling 同精神; AST 锁链延伸第 7 处 | 反向 grep `setInterval.*audit\|setTimeout.*fetch.*audit-log\|polling\.audit_fallback` 在 packages/client/src/admin/ count==0 |
| ④ (边界) | SSE handler subscribe-before-handshake (跟 #533 fix 同模式) | 跟 PR #533 SSE backfill 真因修同源 — 反 race window | `handleAuditEvents` 顺序: (a) Subscribe + GetLatestCursor → (b) WriteHeader → (c) `:connected` flush → (d) live loop; 反约束 不复制 race-prone 旧 pattern (反向 grep `WriteHeader.*Subscribe.*audit` 顺序倒置 0 hit) |
| ⑤ (边界) | 5 字段 audit byte-identical 跟跨链第 6 处 | 跟 HB-1 / HB-2 / BPP-4 / BPP-8 / HB-3 v2 / AL-7 audit log 5 字段 (actor / action / target / when / scope) 同源 | AuditEventFrame `{type='audit_event', cursor, action_id, actor_id, action, target_user_id, created_at}` 7 字段 byte-identical; 反向 grep AuditEventFrame 字段集跨 milestone drift 0 hit |
| ⑥ (边界) | 错码字面单源 (跟 AP-1/AP-2/AP-3/CV-2 v2/CV-3 v2/CV-6 const 同模式) | const SSOT 同精神 | `AuditErrCode{NotAdmin / CursorInvalid / SSEUnsupported / CrossOrgDenied / ConnectionDropped}` 5 const 字面单源; 反向 grep handler 内 hardcode `"audit\."` 字面 in non-const path count==0 |
| ⑦ (边界) | content-lock SSE 状态文案 (3 字面 byte-identical) | 跟 BPP-3.2 / AL-5 / CV-2 v2 / CV-3 v2 / CV-6 文案锁同精神 | "已连接" / "重连中…" / "断开" 3 字面 byte-identical 跟 server SSE 状态字面 + content-lock §3 同源 (改 = 改三处) |
| ⑧ (边界) | nil-safe pusher seam (跟既有 5+ 处 pusher 同模式) | 跟 ArtifactPusher / IterationPusher / AnchorPusher / AgentInvitationPusher / PermissionDeniedPusher 5+ 处 nil-safe seam | `auditPusher` interface 在 store package; nil pusher → InsertAdminAction 仍 OK 不 panic; 跟既有 5 处 nil-safe seam 测试模式同 |
| ⑨ (边界) | unbounded backfill 限 50 行 (反 unbounded replay) | 跟 RT-1.2 #292 既有 limit 同精神 | `since=cursor` query → server replay 最近 50 行 admin_actions; 反约束 limit 上限 50 hardcoded const, 反向 grep `audit.*limit.*[0-9]{3,}` (3+ 位数) 0 hit |
| ⑩ (边界) | not 裂 audit 表 (复用 admin_actions, 跟 ADM-2.1 + AL-7 同精神) | 跟 ADM-2.1 #484 admin_actions SSOT + AL-7 retention 同精神 | 反向 grep `CREATE TABLE.*audit_events\|audit_stream_buffer\|audit_live` 在 internal/migrations/ count==0; AL-9 不需 schema migration |

## §1 立场 ① admin-rail SSE only (AL-9.1 守)

**蓝图字面源**: admin-model.md §1.3 + ADM-0 红线第 7 处 owner-only ACL 同精神

**反约束清单**:

- [ ] endpoint 走 `GET /admin-api/v1/audit-log/events` (跟 ADM-2.2 #484 既有 GET /admin-api/v1/audit-log 同 path namespace + 同 mw)
- [ ] cookie 拆 admin/user 两 mw 已就位 (ADM-0.2 既有), 不动
- [ ] 反向 grep `/api/v1/audit-log/events` 在 internal/api/ count==0
- [ ] handler subscribe-before-handshake 顺序 (跟 #533 fix 模式)

## §2 立场 ② audit fan-out 锁链终结 (AL-9.2 守)

**蓝图字面源**: 跟 RT-1.1 / AL-2b / DM-2.2 / CV-2.1 / CV-4.2 fan-out 5+ 处第 6 处, audit 域跨链终结

**反约束清单**:

- [ ] `Store.InsertAdminAction` 末尾调 `auditPusher` seam (nil-safe, 跟 ArtifactPusher 5+ 处同模式)
- [ ] AuditEventFrame 5 字段 byte-identical: `action_id / actor_id / action / target_user_id / created_at` (跟 ADM-2.1 admin_actions schema 5 字段 byte-identical)
- [ ] envelope 7 字段 byte-identical: `{type='audit_event', cursor, ...5 业务字段}` (跟 ArtifactUpdated 7 字段 / AnchorCommentAdded 10 字段 同 envelope 模式)
- [ ] **改 = 改 InsertAdminAction 一处, 6 处 audit writer 自动 fan-out** (ADM-2.1 / AL-1 / BPP-4 / BPP-8 / AP-2 / AL-7)
- [ ] hub `Subscribe(name='audit')` + `Push` 通道独立 (admin-rail 不污染 user-rail SSE)

## §3 立场 ③ 反 polling fallback (AL-9.3 守)

**蓝图字面源**: 跟 BPP-1 / BPP-4 / DL-4 反 polling 同精神; AST 锁链延伸第 7 处

**反约束清单**:

- [ ] client `useAuditLogStream` hook 仅 EventSource; 反向 grep `setInterval.*audit\|setTimeout.*fetch.*audit-log` 在 packages/client/src/admin/ count==0
- [ ] reconnect 走 EventSource native (`Last-Event-ID` header), 不另起 polling fallback 短路 ("admin 必走 SSE")
- [ ] 反向 grep `polling\.audit_fallback` count==0

## §4 联签清单 (实施 PR 时填)

- [ ] 飞马 (spec ↔ 立场对齐): _(签)_
- [ ] 烈马 (反向 grep + 单测覆盖率 ≥84% + 5 反约束全 count==0 + SSE ordering 跟 #533 同模式): _(签)_
- [ ] 战马C (实施代码 ↔ 立场反查 10 项全过): _(签)_
