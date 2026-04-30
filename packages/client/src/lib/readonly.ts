// CHN-15 readonly — bit 4 of user_channel_layout.collapsed (creator's row).
// Server const lives in `internal/api/chn_15_readonly.go::ReadonlyBit`.
// 双向锁 byte-identical = 16; 改一处 = 改两处 (vitest + go test 双向编译期检查).

export const READONLY_BIT = 16;

/** 3 文案 byte-identical 跟 docs/qa/chn-15-content-lock.md §1 同源. */
export const READONLY_LABEL = {
  set_toast:        '已设为只读',
  unset_toast:      '已恢复编辑',
  no_send_reject:   '只读频道, 仅创建者可发言',
} as const;
