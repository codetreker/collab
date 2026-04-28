// PresenceDot.test.tsx — AL-3.3 (#R3 Phase 2) DOM 字面锁单测.
//
// al-3.md §3.1 acceptance: online → data-presence="online" + 文本 "在线";
// offline → data-presence="offline" + 文本 "已离线"; error → data-presence=
// "error" + 文本 "故障 (REASON)" (跟 #249 6 reason codes byte-identical).
//
// §5.4 反约束: 每命中 .presence-dot 必带 sibling 文本 — 这里通过组件渲染
// 保证 dot + text 永远成对出现, 测两个 sibling 都在 DOM 里.
//
// §5.1 反约束: 文本不准是 "busy" / "idle" / "忙" / "空闲" — 这里穷举状态
// 反查输出文本, 守 phase 2 仅 3 态.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import PresenceDot from '../components/PresenceDot';

let container: HTMLDivElement | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (container) {
    document.body.removeChild(container);
    container = null;
  }
});

function render(node: React.ReactElement): HTMLElement {
  const root = createRoot(container!);
  act(() => {
    root.render(node);
  });
  return container!;
}

describe('PresenceDot DOM 字面锁 (al-3.md §3.1)', () => {
  it('online → data-presence="online" + 绿点 class + 文本 "在线"', () => {
    const c = render(<PresenceDot state="online" reason={undefined} />);
    const wrap = c.querySelector('[data-presence]')!;
    expect(wrap.getAttribute('data-presence')).toBe('online');
    expect(c.querySelector('.presence-dot.presence-online')).toBeTruthy();
    expect(c.textContent).toBe('在线');
  });

  it('offline → data-presence="offline" + 文本 "已离线" (野马 §11 不准 idle 灰糊弄)', () => {
    const c = render(<PresenceDot state="offline" reason={undefined} />);
    const wrap = c.querySelector('[data-presence]')!;
    expect(wrap.getAttribute('data-presence')).toBe('offline');
    expect(c.querySelector('.presence-dot.presence-offline')).toBeTruthy();
    expect(c.textContent).toBe('已离线');
  });

  it('error api_key_invalid → data-presence="error" + 文本 "故障 (API key 失效)"', () => {
    const c = render(<PresenceDot state="error" reason="api_key_invalid" />);
    const wrap = c.querySelector('[data-presence]')!;
    expect(wrap.getAttribute('data-presence')).toBe('error');
    expect(wrap.getAttribute('data-reason')).toBe('api_key_invalid');
    expect(c.textContent).toBe('故障 (API key 失效)');
  });

  it('error 6 reason codes byte-identical 文案 (跟 #249 lib/agent-state.ts 字面绑定)', () => {
    const cases: Array<[Parameters<typeof PresenceDot>[0]['reason'], string]> = [
      ['api_key_invalid',     '故障 (API key 失效)'],
      ['quota_exceeded',      '故障 (已超出配额)'],
      ['network_unreachable', '故障 (网络不可达)'],
      ['runtime_crashed',     '故障 (Runtime 崩溃)'],
      ['runtime_timeout',     '故障 (Runtime 超时)'],
      ['unknown',             '故障 (未知错误)'],
    ];
    for (const [reason, text] of cases) {
      const c = render(<PresenceDot state="error" reason={reason} />);
      expect(c.textContent).toBe(text);
    }
  });

  it('undefined state 兜底 offline (server 没回 state 时不糊弄)', () => {
    const c = render(<PresenceDot state={undefined} reason={undefined} />);
    expect(c.querySelector('[data-presence]')!.getAttribute('data-presence')).toBe('offline');
    expect(c.textContent).toBe('已离线');
  });

  it('compact mode 把文案放 title, 不渲染 visible text 旁标 (sidebar 密集列表用)', () => {
    const c = render(<PresenceDot state="online" reason={undefined} compact />);
    const wrap = c.querySelector('[data-presence]')! as HTMLElement;
    expect(wrap.getAttribute('title')).toBe('在线');
    // sr-only 仍含文本 (a11y), 但视觉上不显. 反约束 §5.4 仍通过 sr-only 满足.
    expect(c.textContent).toContain('在线');
  });

  it('反约束 §5.1: 任意状态的 text 都不准包含 busy/idle/忙/空闲', () => {
    for (const state of ['online', 'offline', 'error'] as const) {
      const c = render(<PresenceDot state={state} reason={state === 'error' ? 'unknown' : undefined} />);
      const text = c.textContent ?? '';
      expect(text).not.toMatch(/busy|idle|忙|空闲/i);
    }
  });
});
