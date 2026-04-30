// CS-4 — SyncStatusIndicator (cs-4-content-lock §2 + 沉默胜于假 loading).
//
// DOM 字面锁:
//   <span data-cs4-sync-state="{offline_cache_hit|synced|syncing|cache_miss}">{label}</span>
//
// 反约束:
//   - cache_miss 时 return null (不准 fallback toast)
//   - syncing 时 ≤3s return null (沉默胜于假 loading; 跟 RT-1 §1.1 字面承袭)
//   - 不准 spinner 旁路 (走 DOM data-attr 单源)
import React, { useEffect, useState } from 'react';
import { type SyncState, SYNC_STATE_LABELS, SYNCING_LABEL_DELAY_MS } from '../lib/cs4-sync-state';

export interface SyncStatusIndicatorProps {
  state: SyncState;
  /** ms epoch when this state began; if undefined, treat as just now. */
  startedAtMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

export default function SyncStatusIndicator({
  state,
  startedAtMs,
  now = Date.now,
}: SyncStatusIndicatorProps) {
  const [showSyncing, setShowSyncing] = useState<boolean>(() => {
    if (state !== 'syncing') return false;
    if (startedAtMs === undefined) return false;
    return now() - startedAtMs >= SYNCING_LABEL_DELAY_MS;
  });

  useEffect(() => {
    if (state !== 'syncing' || startedAtMs === undefined) {
      setShowSyncing(false);
      return;
    }
    const elapsed = now() - startedAtMs;
    if (elapsed >= SYNCING_LABEL_DELAY_MS) {
      setShowSyncing(true);
      return;
    }
    const timer = setTimeout(() => setShowSyncing(true), SYNCING_LABEL_DELAY_MS - elapsed);
    return () => clearTimeout(timer);
  }, [state, startedAtMs, now]);

  if (state === 'cache_miss') return null;
  if (state === 'syncing' && !showSyncing) return null;

  return (
    <span
      className={`cs4-sync-state cs4-sync-state-${state}`}
      data-cs4-sync-state={state}
    >
      {SYNC_STATE_LABELS[state]}
    </span>
  );
}
