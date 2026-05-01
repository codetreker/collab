// AP-2 client — capability label SSOT + 反 role 名 + 反向 grep.
import { describe, it, expect } from 'vitest';
import {
  CAPABILITY_TOKENS,
  capabilityLabel,
  isKnownCapability,
} from '../lib/capabilities';

describe('AP-2 ⭐ capability label SSOT — 14 const + 反 role bleed', () => {
  it('§1 14 capability tokens byte-identical 跟 server `auth.ALL` 顺序', () => {
    expect(CAPABILITY_TOKENS).toEqual([
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
      // channel admin
      'manage_members',
      'invite_user',
      'change_role',
    ]);
  });

  it('§2 capabilityLabel — 14 token 各 byte-identical 中文 label', () => {
    expect(capabilityLabel('read_channel')).toBe('查看频道');
    expect(capabilityLabel('write_channel')).toBe('在频道发消息');
    expect(capabilityLabel('delete_channel')).toBe('删除频道');
    expect(capabilityLabel('read_artifact')).toBe('查看产物');
    expect(capabilityLabel('write_artifact')).toBe('编辑产物');
    expect(capabilityLabel('commit_artifact')).toBe('提交产物');
    expect(capabilityLabel('iterate_artifact')).toBe('迭代产物');
    expect(capabilityLabel('rollback_artifact')).toBe('回滚产物');
    expect(capabilityLabel('mention_user')).toBe('提及用户');
    expect(capabilityLabel('read_dm')).toBe('查看私信');
    expect(capabilityLabel('send_dm')).toBe('发送私信');
    expect(capabilityLabel('manage_members')).toBe('管理频道成员');
    expect(capabilityLabel('invite_user')).toBe('邀请用户');
    expect(capabilityLabel('change_role')).toBe('调整成员能力');
  });

  it('§3 capabilityLabel — unknown token forward-compat 渲染原 token (反 silent drop)', () => {
    expect(capabilityLabel('future_capability_v3')).toBe('future_capability_v3');
    expect(capabilityLabel('')).toBe('');
  });

  it('§4 isKnownCapability — 14 known + 反向断言 unknown', () => {
    for (const t of CAPABILITY_TOKENS) {
      expect(isKnownCapability(t)).toBe(true);
    }
    expect(isKnownCapability('admin')).toBe(false); // RBAC role 名反 reject
    expect(isKnownCapability('editor')).toBe(false);
    expect(isKnownCapability('viewer')).toBe(false);
    expect(isKnownCapability('owner')).toBe(false);
    expect(isKnownCapability('未知')).toBe(false);
  });

  it('§5 反 role 名双语 — capabilityLabel 输出 0 hit RBAC role 字面', () => {
    // 14 token 输出 label 反向断言不含 admin/editor/viewer/owner /
    // 管理员/编辑者/查看者 字面 (反 role bleed).
    const forbidden = [
      /admin/i,
      /editor/i,
      /viewer/i,
      /owner/i,
      /管理员/,
      /编辑者/,
      /查看者/,
    ];
    for (const tok of CAPABILITY_TOKENS) {
      const label = capabilityLabel(tok);
      for (const re of forbidden) {
        expect(re.test(label)).toBe(false);
      }
    }
  });
});
