// RT-1.2 (#290 follow) — last_seen_cursor persistence for WS reconnect
// backfill. The cursor is the monotonic int64 minted by the server's
// CursorAllocator (RT-1.1 #290): every push frame carries it; the
// client tracks the highest one observed; on WS reconnect the client
// passes it back via `GET /api/v1/events?since=N` to pull any events
// missed during the disconnect window.
//
// Why sessionStorage (not localStorage / IndexedDB):
//   - sessionStorage is per-tab, so two open tabs don't fight over a
//     single shared cursor (each tab has its own WS + own backfill).
//   - sessionStorage survives page reloads (the unit-tested behaviour),
//     which is the realistic "user hits F5 mid-session" case.
//   - localStorage would survive across tabs but break the per-device /
//     per-tab cursor independence the realtime spec §1.4 hardlines.
//   - IndexedDB is overkill for a single int64 + we want sync reads on
//     hot paths (WS open).
//
// Reverse约束 (RT-1 spec §3): NEVER sort events by `updated_at` /
// `created_at`. The cursor IS the order; an `updated_at` sort would
// break dedup and re-introduce flicker. This file deals only with the
// cursor — no timestamp paths.

const STORAGE_KEY = 'borgee.rt1.last_seen_cursor';

// Defensive sessionStorage access — SSR / private-mode browsers may
// throw on access; we degrade to in-memory in that case.
let memoryFallback: number | null = null;

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    // probe — Safari private-mode throws on setItem, not getItem.
    const probeKey = STORAGE_KEY + '.__probe';
    window.sessionStorage.setItem(probeKey, '1');
    window.sessionStorage.removeItem(probeKey);
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Read the persisted last_seen_cursor. Returns 0 when absent. */
export function loadLastSeenCursor(): number {
  const s = safeStorage();
  if (s === null) return memoryFallback ?? 0;
  const raw = s.getItem(STORAGE_KEY);
  if (raw === null) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * Persist the cursor IF it is strictly greater than what's already
 * stored. The reducer is monotonic — RT-1.1 server cursors only ever
 * increase, so a smaller value can only mean an out-of-order frame
 * arrived after a larger one already updated the high-water mark.
 *
 * Returns the value that ended up persisted (the new max).
 */
export function persistLastSeenCursor(cursor: number): number {
  if (!Number.isFinite(cursor) || cursor <= 0) return loadLastSeenCursor();
  const current = loadLastSeenCursor();
  if (cursor <= current) return current;
  const s = safeStorage();
  if (s === null) {
    memoryFallback = cursor;
    return cursor;
  }
  s.setItem(STORAGE_KEY, String(cursor));
  return cursor;
}

/** Test-only reset hook. Not exported from a barrel. */
export function __resetLastSeenCursorForTests(): void {
  memoryFallback = null;
  const s = safeStorage();
  if (s !== null) s.removeItem(STORAGE_KEY);
}
