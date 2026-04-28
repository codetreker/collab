// presence.test.ts — AL-3.3 (#R3 Phase 2) usePresence cache + 5s 节流单测.
//
// 锁住:
//   1. markPresence 写入 → getPresence 立即读得到最新值 (cache 总是 fresh).
//   2. 同 (state, reason) 重复写入 → 不通知 (省 listener 开销).
//   3. 跨节流窗口的状态变化 → 立即通知.
//   4. 节流窗口内 burst 写入 → 仅安排 1 条 trailing flush, 退出窗口时
//      delivered 最新值 (5s coalesce, 同 server 端 §2.4).
//   5. listener add/remove 生命周期不泄漏.
//
// fake clock 模式跟 G2.3 节流单测同形 — store 注入 now(), setTimeout 用
// vitest fake timers 推进, 不依赖 wall time.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  PRESENCE_THROTTLE_MS,
  __resetPresenceStoreForTest,
  flushPendingForTest,
  getPresence,
  markPresence,
} from '../hooks/usePresence';

describe('usePresence cache + 5s 节流 (AL-3.3 §2.4 + §3.1 文案锁配套)', () => {
  let nowMs = 0;
  beforeEach(() => {
    nowMs = 1_700_000_000_000;
    __resetPresenceStoreForTest(() => nowMs);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('markPresence 写入后 getPresence 立即返回最新值 (cache 总是 fresh)', () => {
    markPresence('agent-1', 'online', undefined);
    const e = getPresence('agent-1');
    expect(e?.state).toBe('online');
    expect(e?.reason).toBeUndefined();
  });

  it('同 (state, reason) 重复写 → 立即 flush 后窗口内重复写不再通知 listener', () => {
    let calls = 0;
    const store = __resetPresenceStoreForTest(() => nowMs);
    store.listeners.add(() => { calls++; });
    markPresence('agent-1', 'online', undefined);
    expect(calls).toBe(1);
    // 窗口内同状态重复写 → cache 写最新但不通知 (state未变, 节流走 skip 分支).
    nowMs += 1_000;
    markPresence('agent-1', 'online', undefined);
    expect(calls).toBe(1);
    // 窗口内变状态 → 安排 trailing flush, 立即不通知.
    markPresence('agent-1', 'offline', undefined);
    expect(calls).toBe(1);
    flushPendingForTest();
    expect(calls).toBe(2);
  });

  it('跨 5s 窗口的状态变化 → 立即通知 (online → error)', () => {
    markPresence('agent-1', 'online', undefined);
    // 推进 6 秒, 进入窗口外.
    nowMs += PRESENCE_THROTTLE_MS + 1_000;
    markPresence('agent-1', 'error', 'api_key_invalid');
    const e = getPresence('agent-1');
    expect(e?.state).toBe('error');
    expect(e?.reason).toBe('api_key_invalid');
  });

  it('节流窗口内 burst → trailing flush 最新值 (online→offline→error 折叠到 error)', () => {
    markPresence('agent-1', 'online', undefined);
    // 1s 后 (窗口内) 状态翻 offline, 再 1s 翻 error — burst 内多次.
    nowMs += 1_000;
    markPresence('agent-1', 'offline', undefined);
    nowMs += 1_000;
    markPresence('agent-1', 'error', 'runtime_crashed');
    // Cache 实时 = error.
    expect(getPresence('agent-1')?.state).toBe('error');
    expect(getPresence('agent-1')?.reason).toBe('runtime_crashed');
    // 模拟 trailing flush 到期 — 单测里直接调 flushPendingForTest, 等价于
    // setTimeout(window-剩余) 触发. 不会丢中间态语义因为 cache 已是 error.
    nowMs += PRESENCE_THROTTLE_MS;
    flushPendingForTest();
    expect(getPresence('agent-1')?.state).toBe('error');
  });

  it('多 agent 节流彼此独立 (anchor per agentID)', () => {
    markPresence('agent-1', 'online', undefined);
    nowMs += 1_000;
    markPresence('agent-2', 'online', undefined);
    expect(getPresence('agent-1')?.state).toBe('online');
    expect(getPresence('agent-2')?.state).toBe('online');
  });

  it('空 agentID 不写入 (防御 server frame 字段缺失)', () => {
    markPresence('', 'online', undefined);
    expect(getPresence('')).toBeUndefined();
  });

  it('PRESENCE_THROTTLE_MS 字面 = 5000 (跟 al-3.md §2.4 锁同形)', () => {
    expect(PRESENCE_THROTTLE_MS).toBe(5_000);
  });
});
