# AL-9 Content Lock — admin SPA AuditLogStream DOM + SSE 状态文案锁 (野马 v0)

> 战马C · 2026-04-30 · ≤40 行 byte-identical 锁 (4 件套第三件; 跟 CV-6 / CV-3 v2 / CV-2 v2 / AL-5 / BPP-3.2 同模式)
> **蓝图锚**: [`admin-model.md`](../blueprint/admin-model.md) §1.4 admin 互可见
> **关联**: spec `docs/implementation/modules/al-9-spec.md` (战马C v0, 649a704) + stance `docs/qa/al-9-stance-checklist.md` + acceptance `docs/qa/acceptance-templates/al-9.md`. 复用 ADM-2.1 admin_actions 5 字段 + RT-1.1 cursor SSE pattern.

## §1 SSE 状态文案锁 (3 字面, 跟 server const 同源)

字面 (改 = 改三处: server const + client useAuditLogStream toast + 此 content-lock):

```
audit.connected       → "已连接"
audit.reconnecting    → "重连中…"
audit.disconnected    → "断开"
```

**反向 grep** (count==0): `连接成功|连接失败|断网|重新连接|reconnecting...` 在 packages/client/src/admin/ (近义词漂禁, 仅上 3 字面).

## §2 AuditLogStream DOM 字面锁

容器 + 单 row byte-identical (改 = 改两处: 此 content-lock + `packages/client/src/admin/components/AuditLogStream.tsx`):

```html
<section
  class="audit-log-stream"
  data-testid="audit-log-stream"
  aria-live="polite"
  aria-label="审计日志实时流"
>
  <div class="audit-stream-status" data-testid="audit-stream-status" data-state="connected|reconnecting|disconnected">
    {STATUS_TEXT}
  </div>
  <ul class="audit-event-list">
    <li
      data-testid="audit-event-row"
      data-action-id="<uuid>"
      data-actor-id="<uuid>"
      data-action="<5-tuple>"
      class="audit-event-row"
    >
      <span class="audit-event-actor">{actor_name}</span>
      <span class="audit-event-action">{action_label}</span>
      <span class="audit-event-target">{target_name}</span>
      <span class="audit-event-time">{relative_time}</span>
    </li>
  </ul>
</section>
```

`data-state` 三 enum byte-identical 跟 §1 三文案 1:1 映射.

`data-action` 6 enum byte-identical 跟 server admin_actions CHECK 6-tuple (delete_channel / suspend_user / change_role / reset_password / start_impersonation / permission_expired) — 跟 ADM-2.1 + AP-2 schema 同源.

## §3 5 错码字面单源 (server const ↔ client toast 双向锁)

`internal/api/audit_events.go::AuditErrCode*` const + `packages/client/src/lib/api.ts::AUDIT_ERR_TOAST` map 双向锁 (e2e 反断 server 错码 → client toast 字面 1:1 映射, 跟 CV-6 SEARCH_ERR_TOAST 同模式):

```ts
export const AUDIT_ERR_TOAST: Record<string, string> = {
  'audit.not_admin':           '需要管理员权限',
  'audit.cursor_invalid':      'since cursor 不合法',
  'audit.sse_unsupported':     '浏览器不支持 SSE',
  'audit.cross_org_denied':    '跨组织 audit 被禁',
  'audit.connection_dropped':  '连接已断, 正在重连',
};
```

**改 = 改三处** (server const + client map + 此 content-lock); CI lint 等价单测守 future drift.

## §4 跨 PR drift 守

改 SSE 状态 / 5 错码 / DOM data-* attrs = 改五处 (双向 grep 等价单测覆盖):
1. `internal/api/audit_events.go::AuditErrCode*` const + SSE 3 状态 const
2. `packages/client/src/lib/api.ts::AUDIT_ERR_TOAST` + SSE 3 状态 helper
3. `packages/client/src/admin/components/AuditLogStream.tsx` (DOM data-testid / data-state / data-action-id byte-identical)
4. `internal/ws/audit_event_frame.go` (envelope 7 字段 + 5 业务字段 byte-identical 跟 ADM-2.1 同源)
5. 此 content-lock §1+§2+§3

## 更新日志

- 2026-04-30 — 战马C + 野马 v0 (4 件套第三件 ≤40 行): SSE 3 状态文案锁 + AuditLogStream 容器 + 单 row data-* DOM 字面 + 5 错码 toast 双向锁; 反 hardcode 文案漂移 5 同义词禁; 跟 CV-6 SEARCH_ERR_TOAST / CV-3 v2 / CV-2 v2 / AL-5 / BPP-3.2 同模式.
