// RT-3 ⭐ presence — multi-device fanout + 活物感 4 态 (蓝图 §1.4).
//
// 立场承袭 (rt-3-spec.md §0):
//   - 4 态 enum SSOT byte-identical 跟 server `internal/datalayer/presence.go`
//     PresenceState const (online / away / offline / thinking)
//   - 字面 byte-identical 跟 content-lock §1+§2 (`在线` / `离线` / `刚刚活跃` /
//     `最近活跃 ${N} 分钟前` + DOM data-attr `data-rt3-presence-dot|last-seen|cursor-user`)
//   - 反 false-loading indicator 漂 (content-lock §3) + 反 thought-process
//     5-pattern 漂 (content-lock §4 — RT-3 = 锁链第 N+1 处延伸)
//   - 不重复 AL-3 既有 usePresence (那是 agent presence cache, RT-3 是 human
//     multi-device presence)
//
// Tests: __tests__/RT3PresenceDot.test.tsx + presence-reverse-grep.test.ts (扩).
import { useEffect, useState } from 'react';

/** RT-3 4 态 enum SSOT — byte-identical 跟 server PresenceState const. */
export type RT3PresenceState = 'online' | 'away' | 'offline' | 'thinking';

/** RT-3 presence cache entry. */
export interface RT3PresenceEntry {
  state: RT3PresenceState;
  /** Subject 字段 — thinking 态必带非空 (蓝图 §1.1 ⭐ 关键纪律). */
  subject?: string;
  /** Unix ms — 上次活动时间 (last-seen 派生 away 阈值). */
  lastSeenAt: number;
}

/** Away 阈值 — 5 分钟无活动转 away (跟 server 端 5min 节流窗口同精神). */
export const RT3_AWAY_THRESHOLD_MS = 5 * 60 * 1000;

type Listener = (userID: string) => void;

interface RT3PresenceStore {
  entries: Map<string, RT3PresenceEntry>;
  listeners: Set<Listener>;
  now: () => number;
}

function createStore(now: () => number = () => Date.now()): RT3PresenceStore {
  return { entries: new Map(), listeners: new Set(), now };
}

let defaultStore: RT3PresenceStore = createStore();

/** 测试用: 重置 + 注入 fake clock. 生产代码不应调用. */
export function __resetRT3PresenceStoreForTest(now?: () => number): RT3PresenceStore {
  defaultStore = createStore(now);
  return defaultStore;
}

function notify(store: RT3PresenceStore, userID: string): void {
  for (const l of store.listeners) l(userID);
}

/**
 * markRT3Presence — 客户端入口: WS multi-device fanout frame → cache.
 * thinking 态 subject 字段必带非空 (反"假 loading" 漂); 空 subject 走
 * `thinking.subject_required` server reject 路径 byte-identical (RT-3 立场 ②).
 */
export function markRT3Presence(
  userID: string,
  state: RT3PresenceState,
  subject: string | undefined,
  store: RT3PresenceStore = defaultStore,
): void {
  if (!userID) return;
  // thinking 态 subject 必带非空 — 反"假 loading" 漂. 空 subject 直接 drop
  // (server 走 ValidateTaskStarted SSOT reject, client 防御层兜底).
  if (state === 'thinking' && (!subject || subject.trim() === '')) {
    return;
  }
  const now = store.now();
  store.entries.set(userID, { state, subject, lastSeenAt: now });
  notify(store, userID);
}

/** 直接读取 cached presence (无副作用). */
export function getRT3Presence(
  userID: string,
  store: RT3PresenceStore = defaultStore,
): RT3PresenceEntry | undefined {
  return store.entries.get(userID);
}

/**
 * useRT3Presence — React hook: 订阅指定 userID 的 cached presence + 派生
 * away (last-seen ≥ 5min 自动降级 online → away).
 */
export function useRT3Presence(userID: string | undefined): RT3PresenceEntry | undefined {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!userID) return;
    const store = defaultStore;
    const listener: Listener = (id) => {
      if (id === userID) setTick(t => t + 1);
    };
    store.listeners.add(listener);
    return () => {
      store.listeners.delete(listener);
    };
  }, [userID]);
  if (!userID) return undefined;
  const entry = defaultStore.entries.get(userID);
  if (!entry) return undefined;
  // last-seen 派生 away — online 状态下 ≥ 5min 无活动转 away.
  if (entry.state === 'online' && defaultStore.now() - entry.lastSeenAt >= RT3_AWAY_THRESHOLD_MS) {
    return { ...entry, state: 'away' };
  }
  return entry;
}
