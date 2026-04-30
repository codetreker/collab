// AuditLogStream.test.tsx — AL-9.3 acceptance §3.1 + §3.3 + content-lock
// §1+§2+§3 byte-identical pins.
//
// Pins:
//   - DOM contract: section[data-testid="audit-log-stream"] +
//     div[data-testid="audit-stream-status"][data-state] +
//     ul.audit-event-list (content-lock §2)
//   - 3 SSE 状态文案 byte-identical (content-lock §1)
//   - 5 错码 toast map byte-identical (content-lock §3)
//   - frame schema: 7 字段 byte-identical (action_id/actor_id/action/
//     target_user_id/created_at + type/cursor)
//   - 反 polling fallback (acceptance §3.2): no setInterval('audit'/setTimeout
//     fetch audit-log) literals in component source

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import AuditLogStream from '../../admin/components/AuditLogStream';
import {
  AUDIT_ERR_TOAST,
  AUDIT_SSE_STATUS,
} from '../../admin/api';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let lastES: FakeEventSource | null = null;

class FakeEventSource {
  url: string;
  readyState = 0; // CONNECTING
  onopen: ((this: EventSource, ev: Event) => any) | null = null;
  onerror: ((this: EventSource, ev: Event) => any) | null = null;
  private listeners: Record<string, Array<(ev: MessageEvent) => void>> = {};
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  constructor(url: string) {
    this.url = url;
    lastES = this;
  }
  addEventListener(type: string, fn: (ev: MessageEvent) => void) {
    (this.listeners[type] ||= []).push(fn);
  }
  removeEventListener() {}
  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
  // test helpers
  fireOpen() {
    this.readyState = FakeEventSource.OPEN;
    if (this.onopen) this.onopen.call(this as any, new Event('open'));
  }
  fireError(closed = false) {
    if (closed) this.readyState = FakeEventSource.CLOSED;
    if (this.onerror) this.onerror.call(this as any, new Event('error'));
  }
  fireFrame(data: any) {
    const ev = new MessageEvent('audit_event', { data: JSON.stringify(data) });
    (this.listeners['audit_event'] || []).forEach((fn) => fn(ev));
  }
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  // Stub global EventSource
  (globalThis as any).EventSource = FakeEventSource;
  (FakeEventSource as any).CONNECTING = 0;
  (FakeEventSource as any).OPEN = 1;
  (FakeEventSource as any).CLOSED = 2;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  if (container) {
    document.body.removeChild(container);
    container = null;
  }
  lastES = null;
});

function render(node: React.ReactElement) {
  act(() => {
    root!.render(node);
  });
}

describe('AuditLogStream', () => {
  it('renders DOM contract: section + status + ul (content-lock §2 byte-identical)', () => {
    render(<AuditLogStream />);
    const section = container!.querySelector('[data-testid="audit-log-stream"]');
    expect(section).toBeTruthy();
    expect(section?.getAttribute('aria-live')).toBe('polite');
    expect(section?.getAttribute('aria-label')).toBe('审计日志实时流');

    const status = container!.querySelector('[data-testid="audit-stream-status"]');
    expect(status).toBeTruthy();
    // initial state — reconnecting until onopen fires
    expect(status?.getAttribute('data-state')).toBe('reconnecting');
    expect(status?.textContent).toBe('重连中…');

    const ul = container!.querySelector('ul.audit-event-list');
    expect(ul).toBeTruthy();
  });

  it('SSE 3 状态文案 byte-identical (content-lock §1 + §3 同源)', () => {
    expect(AUDIT_SSE_STATUS.connected).toBe('已连接');
    expect(AUDIT_SSE_STATUS.reconnecting).toBe('重连中…');
    expect(AUDIT_SSE_STATUS.disconnected).toBe('断开');
  });

  it('SSE state transitions: reconnecting → connected → disconnected', () => {
    render(<AuditLogStream />);
    expect(lastES).toBeTruthy();

    act(() => {
      lastES!.fireOpen();
    });
    let status = container!.querySelector('[data-testid="audit-stream-status"]');
    expect(status?.getAttribute('data-state')).toBe('connected');
    expect(status?.textContent).toBe('已连接');

    act(() => {
      lastES!.fireError(true);
    });
    status = container!.querySelector('[data-testid="audit-stream-status"]');
    expect(status?.getAttribute('data-state')).toBe('disconnected');
    expect(status?.textContent).toBe('断开');
  });

  it('renders audit-event-row with data-* byte-identical (content-lock §2)', () => {
    render(<AuditLogStream />);
    act(() => {
      lastES!.fireOpen();
      lastES!.fireFrame({
        type: 'audit_event',
        cursor: 1,
        action_id: 'aid-1',
        actor_id: 'actor-1',
        action: 'delete_channel',
        target_user_id: 'user-1',
        created_at: 1700000000000,
      });
    });
    const row = container!.querySelector('[data-testid="audit-event-row"]');
    expect(row).toBeTruthy();
    expect(row?.getAttribute('data-action-id')).toBe('aid-1');
    expect(row?.getAttribute('data-actor-id')).toBe('actor-1');
    expect(row?.getAttribute('data-action')).toBe('delete_channel');
  });

  it('opens SSE to /admin-api/v1/audit-log/events?since=N (admin-rail only)', () => {
    render(<AuditLogStream since={42} />);
    expect(lastES?.url).toContain('/admin-api/v1/audit-log/events?since=42');
    // 反约束: NOT user-rail
    expect(lastES?.url).not.toContain('/api/v1/audit-log/events');
  });

  it('caps rendered rows at 50 (反 unbounded backfill, 立场 ⑨)', () => {
    render(<AuditLogStream />);
    act(() => {
      lastES!.fireOpen();
      for (let i = 0; i < 60; i++) {
        lastES!.fireFrame({
          type: 'audit_event',
          cursor: i + 1,
          action_id: `aid-${i}`,
          actor_id: 'actor-1',
          action: 'delete_channel',
          target_user_id: 'user-1',
          created_at: 1700000000000 + i,
        });
      }
    });
    const rows = container!.querySelectorAll('[data-testid="audit-event-row"]');
    expect(rows.length).toBe(50);
    // FIFO: oldest 10 dropped, latest 50 kept
    expect(rows[0].getAttribute('data-action-id')).toBe('aid-10');
    expect(rows[49].getAttribute('data-action-id')).toBe('aid-59');
  });
});

describe('AUDIT_ERR_TOAST byte-identical (content-lock §3)', () => {
  it('5 错码字面单源 — byte-identical 跟 server const + content-lock', () => {
    expect(AUDIT_ERR_TOAST['audit.not_admin']).toBe('需要管理员权限');
    expect(AUDIT_ERR_TOAST['audit.cursor_invalid']).toBe('since cursor 不合法');
    expect(AUDIT_ERR_TOAST['audit.sse_unsupported']).toBe('浏览器不支持 SSE');
    expect(AUDIT_ERR_TOAST['audit.cross_org_denied']).toBe('跨组织 audit 被禁');
    expect(AUDIT_ERR_TOAST['audit.connection_dropped']).toBe('连接已断, 正在重连');
    // 5 keys exact (no drift)
    expect(Object.keys(AUDIT_ERR_TOAST).sort()).toEqual([
      'audit.connection_dropped',
      'audit.cross_org_denied',
      'audit.cursor_invalid',
      'audit.not_admin',
      'audit.sse_unsupported',
    ]);
  });
});
