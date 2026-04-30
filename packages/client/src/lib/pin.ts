// pin.ts — CHN-6 pin threshold double-locked with server.
//
// 反约束 (chn-6-content-lock.md §4):
//   - POSITION_PIN_THRESHOLD = 0 字面单源
//   - 跟 server packages/server-go/internal/api/chn_6_pin.go::PinThreshold
//     字面 byte-identical (双向锁: 改一处 = 改两处)
//   - filter `channel.position < POSITION_PIN_THRESHOLD` byte-identical

export const POSITION_PIN_THRESHOLD = 0;

// isPinned reports whether a user_channel_layout.position represents a
// pinned channel. Single-source predicate跟 server IsPinned 同源.
export function isPinned(position: number): boolean {
  return position < POSITION_PIN_THRESHOLD;
}
