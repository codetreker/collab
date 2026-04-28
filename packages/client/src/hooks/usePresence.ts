// AL-3.3 (#R3 Phase 2) — usePresence hook + presence cache.
//
// 设计原则:
//   - 单一真源: server `presence.IsOnline(agent_id)` (AL-3.2 #317 hub
//     lifecycle hook 写端 → presence_sessions 表 → IsOnline OR-query 读端).
//     客户端只缓存 WS `presence.changed` frame, 不重复实现 "在线判定".
//   - 5s 节流: server 端 §2.4 PresenceChange5sCoalesce 已节流出口; 客户端
//     再加一道**通知节流** — cache 永远存最新值, 但订阅者 (UI) 至多每 5s
//     重渲染一次, 抑制 flap 抖动. 跨窗口的实质状态变化必通知; 同状态重复
//     写直接跳过 (省 render).
//   - clock fixture: throttle 用注入式 now() — vitest 单测用 fake clock 把
//     时间线推进, 不依赖 setTimeout / wall time.
//   - 反约束: cache 只存 (state, reason, updatedAt) 三元组, 不存 IP / 心跳
//     时间 / 连接数 (acceptance §2.5 frame 字段白名单同形, 拒绝 leak
//     runtime internals 到 UI).
import { useEffect, useState } from 'react';
import type { AgentRuntimeReason, AgentRuntimeState } from '../lib/api';

/** Cache 行: 单个 agentID 当前已知 presence 状态. */
export interface PresenceEntry {
  state: AgentRuntimeState;
  reason: AgentRuntimeReason | undefined;
  /** Unix ms — 上次发布通知的时间 (5s 节流 anchor). */
  updatedAt: number;
}

/** 5 秒节流窗口 (跟 server 端 §2.4 PresenceChange5sCoalesce 字面一致). */
export const PRESENCE_THROTTLE_MS = 5_000;

type Listener = (id: string) => void;

interface PresenceStore {
  /** Latest known value (cache 永远写入). */
  entries: Map<string, PresenceEntry>;
  /** 上次 notify 时间 (anchor for throttle window). */
  lastNotified: Map<string, number>;
  /** 节流窗口内有未发布的 pending 状态? 若有, 退出窗口时 trailing-flush. */
  pendingFlush: Map<string, ReturnType<typeof setTimeout>>;
  listeners: Set<Listener>;
  /** 注入式 now() — 默认 Date.now, 单测覆盖. */
  now: () => number;
}

function createStore(now: () => number = () => Date.now()): PresenceStore {
  return {
    entries: new Map(),
    lastNotified: new Map(),
    pendingFlush: new Map(),
    listeners: new Set(),
    now,
  };
}

let defaultStore: PresenceStore = createStore();

/** 测试用: 重置 + 注入 fake clock. 生产代码不应调用. */
export function __resetPresenceStoreForTest(now?: () => number): PresenceStore {
  defaultStore = createStore(now);
  return defaultStore;
}

function notify(store: PresenceStore, id: string): void {
  store.lastNotified.set(id, store.now());
  for (const l of store.listeners) l(id);
}

/**
 * markPresence — 客户端入口: WS `presence.changed` frame → cache.
 *
 * Cache 总是写最新值. 通知 (UI 重渲染) 5s 节流:
 *   - 距上次通知 ≥ 5s → 立即 notify.
 *   - 距上次通知 < 5s → 不立即 notify, 但保证窗口结束时 trailing-flush
 *     最后一次写入 (用 setTimeout, 单测可走 flushPendingForTest).
 *   - 同 (state, reason) 重复写入 → 跳过 (省 listener 开销).
 */
export function markPresence(
  agentID: string,
  state: AgentRuntimeState,
  reason: AgentRuntimeReason | undefined,
  store: PresenceStore = defaultStore,
): void {
  if (!agentID) return;
  const existing = store.entries.get(agentID);
  const stateChanged = !existing || existing.state !== state || existing.reason !== reason;
  const now = store.now();
  // Always write cache (so getPresence reflects latest).
  store.entries.set(agentID, { state, reason, updatedAt: now });
  if (!stateChanged) return;

  const last = store.lastNotified.get(agentID) ?? 0;
  if (now - last >= PRESENCE_THROTTLE_MS) {
    // 节流窗口外: 立即通知, 顺手清掉任何 pending flush.
    const pending = store.pendingFlush.get(agentID);
    if (pending) {
      clearTimeout(pending);
      store.pendingFlush.delete(agentID);
    }
    notify(store, agentID);
    return;
  }
  // 窗口内: 安排 trailing flush (若已 pending 则保留, 总是 flush 最新值).
  if (!store.pendingFlush.has(agentID)) {
    const delay = PRESENCE_THROTTLE_MS - (now - last);
    const t = setTimeout(() => {
      store.pendingFlush.delete(agentID);
      notify(store, agentID);
    }, delay);
    store.pendingFlush.set(agentID, t);
  }
}

/** 测试用: 立即 flush 所有 pending. 模拟 setTimeout 到期. */
export function flushPendingForTest(store: PresenceStore = defaultStore): void {
  const ids = [...store.pendingFlush.keys()];
  for (const id of ids) {
    const t = store.pendingFlush.get(id);
    if (t) clearTimeout(t);
    store.pendingFlush.delete(id);
    notify(store, id);
  }
}

/** 直接读取一个 agent 的 cached presence (无副作用). */
export function getPresence(
  agentID: string,
  store: PresenceStore = defaultStore,
): PresenceEntry | undefined {
  return store.entries.get(agentID);
}

/**
 * usePresence — React hook: 订阅指定 agentID 的 cached presence.
 * 返回 undefined 表示 cache miss; 调用方应让 PresenceDot 兜底渲染 "已离线"
 * (describeAgentState(undefined, undefined) 已守这一兜底, 野马 §11).
 */
export function usePresence(agentID: string | undefined): PresenceEntry | undefined {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!agentID) return;
    const store = defaultStore;
    const listener: Listener = (id) => {
      if (id === agentID) setTick(t => t + 1);
    };
    store.listeners.add(listener);
    return () => {
      store.listeners.delete(listener);
    };
  }, [agentID]);
  return agentID ? defaultStore.entries.get(agentID) : undefined;
}
