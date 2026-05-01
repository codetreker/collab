// AP-2 client — capability label SSOT (i18n-ready, currently zh-CN literals).
//
// 立场承袭 (ap-2-spec.md §0.2 + content-lock):
//   - 14 capability const byte-identical 跟 server `internal/auth/capabilities.go::ALL`
//     (改 = 改两处: server const + 此 LABEL_MAP)
//   - capabilityLabel(token) 单源 helper, 反 inline 字面散落 (反向 grep
//     `function capabilityLabel|export.*capabilityLabel` ==1 hit)
//   - 反 RBAC 角色名双语 (英 a/e/v/o + 中文 3 词) 0 hit (反 role bleed)
//
// 改 = 改三处: server `internal/auth/capabilities.go::ALL` + 此 LABEL_MAP +
// content-lock §1+§2 字面锁.

/** 14 capability token byte-identical 跟 server `auth.ALL` 顺序 */
export const CAPABILITY_TOKENS = [
  // channel scope
  'read_channel',
  'write_channel',
  'delete_channel',
  // artifact scope
  'read_artifact',
  'write_artifact',
  'commit_artifact',
  'iterate_artifact',
  'rollback_artifact',
  // messaging
  'mention_user',
  'read_dm',
  'send_dm',
  // channel acl
  'manage_members',
  'invite_user',
  'change_role',
] as const;

export type CapabilityToken = (typeof CAPABILITY_TOKENS)[number];

/** 14 capability token → 中文 label SSOT (反 role 名双语漂). */
const LABEL_MAP: Record<CapabilityToken, string> = {
  read_channel: '查看频道',
  write_channel: '在频道发消息',
  delete_channel: '删除频道',
  read_artifact: '查看产物',
  write_artifact: '编辑产物',
  commit_artifact: '提交产物',
  iterate_artifact: '迭代产物',
  rollback_artifact: '回滚产物',
  mention_user: '提及用户',
  read_dm: '查看私信',
  send_dm: '发送私信',
  manage_members: '管理频道成员',
  invite_user: '邀请用户',
  change_role: '调整成员能力',
};

/**
 * capabilityLabel — single-source helper to render a capability token
 * label. Unknown tokens render the raw token (forward-compat).
 *
 * 反约束: 调用方禁止 inline 字面 (如 `'查看频道'`); 走此 helper SSOT
 * (反向 grep `function capabilityLabel|export.*capabilityLabel` ==1 hit).
 */
export function capabilityLabel(token: string): string {
  if (token in LABEL_MAP) {
    return LABEL_MAP[token as CapabilityToken];
  }
  return token;
}

/** isKnownCapability — 反向断言 helper (跟 server `auth.IsValidCapability` 同精神). */
export function isKnownCapability(token: string): token is CapabilityToken {
  return token in LABEL_MAP;
}
