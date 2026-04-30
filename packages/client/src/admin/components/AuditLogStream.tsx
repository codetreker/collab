// AuditLogStream — AL-9.3 admin SPA live audit monitor (SSE consumer).
//
// Blueprint锚: docs/blueprint/admin-model.md §1.4 (admin 互可见 + Audit
// 100% 留痕 + 受影响者必感知).
// Spec: docs/implementation/modules/al-9-spec.md §1 拆段 AL-9.3.
// Acceptance: docs/qa/acceptance-templates/al-9.md §AL-9.3 (3.1-3.5).
// Content lock: docs/qa/al-9-content-lock.md §1 (3 SSE 状态文案) + §2
// (DOM data-* attrs byte-identical) + §3 (5 错码 toast 双向锁).
//
// DOM 锚 (改 = 改两处: 此组件 + content-lock §2):
//   - section[data-testid="audit-log-stream"]
//   - div[data-testid="audit-stream-status"][data-state]
//   - ul.audit-event-list
//   - li[data-testid="audit-event-row"][data-action-id][data-actor-id]
//     [data-action]
//
// 反约束:
//   - 仅 EventSource (反 polling fallback) — 反向 grep
//     `setInterval.*audit | setTimeout.*fetch.*audit-log` 在 admin/ 0 hit
//     (acceptance §3.2 + stance 立场 ③)
//   - 文案 3 字面单源 (SSE 状态) + 5 字面单源 (错码 toast)
import React, { useEffect, useRef, useState } from 'react';
import {
  AUDIT_SSE_STATUS,
  type AuditEventFrame,
  type AuditSSEState,
} from '../api';

// MAX_ROWS — UI 渲染上限, 跟 server backfill limit 50 同源 (acceptance §3.1
// "列出最近 50 行"). 立场 ⑨ 反 unbounded backfill.
const MAX_ROWS = 50;

interface AuditLogStreamProps {
  // since — initial cursor for SSE resume (defaults to 0 = backfill all
  // buffered frames up to MAX_ROWS).
  since?: number;
  // baseUrl — override for tests (vitest jsdom). Default reads from
  // window.location relative path.
  baseUrl?: string;
}

export default function AuditLogStream({
  since = 0,
  baseUrl = '',
}: AuditLogStreamProps) {
  const [rows, setRows] = useState<AuditEventFrame[]>([]);
  const [state, setState] = useState<AuditSSEState>('reconnecting');
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    // EventSource native — Last-Event-ID resume on reconnect handled by
    // browser. 反约束: no polling fallback (admin 必走 SSE, 立场 ③).
    const url = `${baseUrl}/admin-api/v1/audit-log/events?since=${since}`;
    let es: EventSource;
    try {
      es = new EventSource(url, { withCredentials: true });
    } catch {
      setState('disconnected');
      return;
    }

    es.onopen = () => setState('connected');
    es.onerror = () => {
      // Native EventSource will auto-reconnect; show reconnecting state
      // until the next open. If readyState=CLOSED no recovery, mark disconnected.
      setState(es.readyState === EventSource.CLOSED ? 'disconnected' : 'reconnecting');
    };
    es.addEventListener('audit_event', (ev) => {
      try {
        const frame = JSON.parse((ev as MessageEvent).data) as AuditEventFrame;
        setRows((prev) => {
          const next = [...prev, frame];
          if (next.length > MAX_ROWS) {
            return next.slice(next.length - MAX_ROWS);
          }
          return next;
        });
      } catch {
        // malformed frame — drop silently (server-side schema lock is the
        // primary defense; client is render layer only).
      }
    });

    return () => es.close();
  }, [baseUrl, since]);

  // Auto-scroll to bottom on new rows (acceptance §3.1 "auto-scroll smoke").
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows.length]);

  return (
    <section
      className="audit-log-stream"
      data-testid="audit-log-stream"
      aria-live="polite"
      aria-label="审计日志实时流"
    >
      <div
        className="audit-stream-status"
        data-testid="audit-stream-status"
        data-state={state}
      >
        {AUDIT_SSE_STATUS[state]}
      </div>
      <ul className="audit-event-list" ref={listRef}>
        {rows.map((f) => (
          <li
            key={f.action_id}
            data-testid="audit-event-row"
            data-action-id={f.action_id}
            data-actor-id={f.actor_id}
            data-action={f.action}
            className="audit-event-row"
          >
            <span className="audit-event-actor">{f.actor_id}</span>
            <span className="audit-event-action">{f.action}</span>
            <span className="audit-event-target">{f.target_user_id}</span>
            <span className="audit-event-time">
              {new Date(f.created_at).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
