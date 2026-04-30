// mute.ts — CHN-7 mute bit double-locked with server.
//
// 反约束 (chn-7-content-lock.md §4):
//   - MUTE_BIT = 2 字面单源
//   - 跟 server packages/server-go/internal/api/chn_7_mute.go::MuteBit
//     字面 byte-identical (双向锁: 改一处 = 改两处)
//   - collapsed bitmap: bit 0 (=1) = 折叠态 (CHN-3 既有), bit 1 (=2) =
//     静音态 (CHN-7 新增)

export const MUTE_BIT = 2;

// isMuted reports whether a user_channel_layout.collapsed bitmap value
// represents a muted channel. Single-source predicate跟 server IsMuted
// 同源.
export function isMuted(collapsed: number | null | undefined): boolean {
  return ((collapsed ?? 0) & MUTE_BIT) !== 0;
}
