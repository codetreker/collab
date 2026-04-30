// notif_pref.ts — CHN-8 notification preference 三向锁 with server.
//
// 反约束 (chn-8-content-lock.md §3+§4):
//   - NOTIF_PREF_SHIFT = 2 / NOTIF_PREF_MASK = 3 字面单源
//   - NOTIF_PREF_ALL = 0 / NOTIF_PREF_MENTION = 1 / NOTIF_PREF_NONE = 2
//   - 跟 server packages/server-go/internal/api/chn_8_notif_pref.go 字面
//     byte-identical (三向锁: 改一处 = 改三处)
//   - bitmap `(collapsed >> 2) & 3` 字面拆 bits 2-3

export const NOTIF_PREF_SHIFT = 2;
export const NOTIF_PREF_MASK = 3;

export const NOTIF_PREF_ALL = 0;
export const NOTIF_PREF_MENTION = 1;
export const NOTIF_PREF_NONE = 2;

export type NotifPref = 'all' | 'mention' | 'none';

export const NOTIF_PREF_STRING_TO_INT: Record<NotifPref, number> = {
  all: NOTIF_PREF_ALL,
  mention: NOTIF_PREF_MENTION,
  none: NOTIF_PREF_NONE,
};

export const NOTIF_PREF_INT_TO_STRING: Record<number, NotifPref> = {
  [NOTIF_PREF_ALL]: 'all',
  [NOTIF_PREF_MENTION]: 'mention',
  [NOTIF_PREF_NONE]: 'none',
};

// getNotifPref reports the current notification preference encoded in
// collapsed bits 2-3. Single-source predicate跟 server GetNotifPref 同源.
export function getNotifPref(collapsed: number | null | undefined): number {
  return ((collapsed ?? 0) >> NOTIF_PREF_SHIFT) & NOTIF_PREF_MASK;
}
