// visibility.ts — CHN-9 channel visibility 三向锁 with server.
//
// 反约束 (chn-9-content-lock.md §3+§4):
//   - VISIBILITY_CREATOR_ONLY = 'creator_only' / VISIBILITY_MEMBERS = 'private'
//     / VISIBILITY_ORG_PUBLIC = 'public' 字面单源
//   - 跟 server packages/server-go/internal/api/chn_9_visibility.go::Visibility*
//     字面 byte-identical (三向锁: server const + client const + DB 字面)
//   - 现有 'public'/'private' 行 byte-identical 保留 (向后兼容)

export const VISIBILITY_CREATOR_ONLY = 'creator_only';
export const VISIBILITY_MEMBERS = 'private';
export const VISIBILITY_ORG_PUBLIC = 'public';

export type ChannelVisibility =
  | typeof VISIBILITY_CREATOR_ONLY
  | typeof VISIBILITY_MEMBERS
  | typeof VISIBILITY_ORG_PUBLIC;

// VisibilityLabels — UI 文案 byte-identical 跟 content-lock §1.
export const VISIBILITY_LABELS: Record<ChannelVisibility, { emoji: string; text: string }> = {
  creator_only: { emoji: '🔒', text: '仅创建者' },
  private: { emoji: '👥', text: '成员可见' },
  public: { emoji: '🌐', text: '组织内可见' },
};

// isValidVisibility reports whether the given string is one of the
// three accepted enum values. Single-source predicate跟 server
// IsValidVisibility 同源 byte-identical.
export function isValidVisibility(s: string): s is ChannelVisibility {
  return s === VISIBILITY_CREATOR_ONLY || s === VISIBILITY_MEMBERS || s === VISIBILITY_ORG_PUBLIC;
}
