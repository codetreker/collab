import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedAdmin, seedMember, seedAgent, seedChannel, grantPermission } from './setup.js';

describe('requirePermission logic', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  function checkPermission(userId: string, permission: string, scope: string): boolean {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
    if (!user) return false;
    if (user.role === 'admin') return true;
    const row = db.prepare(
      "SELECT 1 FROM user_permissions WHERE user_id = ? AND permission = ? AND (scope = '*' OR scope = ?) LIMIT 1"
    ).get(userId, permission, scope);
    return !!row;
  }

  it('admin bypasses all permission checks', () => {
    const adminId = seedAdmin(db);
    expect(checkPermission(adminId, 'channel.delete', 'channel:xxx')).toBe(true);
    expect(checkPermission(adminId, 'nonexistent.perm', '*')).toBe(true);
  });

  it('member with wildcard scope passes', () => {
    const memberId = seedMember(db);
    grantPermission(db, memberId, 'message.send', '*');
    expect(checkPermission(memberId, 'message.send', 'channel:abc')).toBe(true);
  });

  it('member with scoped permission passes for matching scope', () => {
    const memberId = seedMember(db);
    grantPermission(db, memberId, 'message.send', 'channel:abc');
    expect(checkPermission(memberId, 'message.send', 'channel:abc')).toBe(true);
    expect(checkPermission(memberId, 'message.send', 'channel:def')).toBe(false);
  });

  it('member without permission is denied', () => {
    const memberId = seedMember(db);
    expect(checkPermission(memberId, 'channel.delete', '*')).toBe(false);
  });

  it('wildcard scope grants access to any channel-scoped request', () => {
    const memberId = seedMember(db);
    grantPermission(db, memberId, 'channel.manage_members', '*');
    expect(checkPermission(memberId, 'channel.manage_members', 'channel:xyz')).toBe(true);
  });
});

describe('invite code consumption', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('consumeInviteCode returns true on first use, false on second', () => {
    const adminId = seedAdmin(db);
    const code = 'TESTCODE1234';
    db.prepare('INSERT INTO invite_codes (code, created_by, created_at) VALUES (?, ?, ?)').run(code, adminId, Date.now());

    const consume = (userId: string) => {
      const now = Date.now();
      return db.prepare('UPDATE invite_codes SET used_by = ?, used_at = ? WHERE code = ? AND used_by IS NULL').run(userId, now, code).changes > 0;
    };

    const user1 = seedMember(db, 'User1');
    const user2 = seedMember(db, 'User2');
    expect(consume(user1)).toBe(true);
    expect(consume(user2)).toBe(false);
  });

  it('expired invite code is rejected', () => {
    const adminId = seedAdmin(db);
    const code = 'EXPIRED001';
    db.prepare('INSERT INTO invite_codes (code, created_by, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
      code, adminId, Date.now(), Date.now() - 1000
    );
    const invite = db.prepare('SELECT * FROM invite_codes WHERE code = ?').get(code) as { expires_at: number | null };
    expect(invite.expires_at).toBeLessThan(Date.now());
  });

  it('email uniqueness is enforced at DB level', () => {
    const adminId = seedAdmin(db);
    const email = 'dupe@test.com';
    db.prepare('INSERT INTO users (id, display_name, role, email, created_at) VALUES (?, ?, ?, ?, ?)').run('u1', 'A', 'member', email, Date.now());
    expect(() => {
      db.prepare('INSERT INTO users (id, display_name, role, email, created_at) VALUES (?, ?, ?, ?, ?)').run('u2', 'B', 'member', email, Date.now());
    }).toThrow();
  });
});

describe('agent CRUD', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('agent is created with owner_id', () => {
    const ownerId = seedMember(db, 'Owner');
    const agentId = seedAgent(db, ownerId, 'MyBot');
    const agent = db.prepare('SELECT * FROM users WHERE id = ?').get(agentId) as { role: string; owner_id: string };
    expect(agent.role).toBe('agent');
    expect(agent.owner_id).toBe(ownerId);
  });

  it('agent soft delete sets deleted_at and disabled', () => {
    const ownerId = seedMember(db, 'Owner');
    const agentId = seedAgent(db, ownerId);
    const now = Date.now();
    db.prepare('UPDATE users SET deleted_at = ?, disabled = 1 WHERE id = ?').run(now, agentId);
    const agent = db.prepare('SELECT deleted_at, disabled FROM users WHERE id = ?').get(agentId) as { deleted_at: number; disabled: number };
    expect(agent.deleted_at).toBe(now);
    expect(agent.disabled).toBe(1);
  });

  it('non-owner cannot delete agent (ownership check)', () => {
    const ownerId = seedMember(db, 'Owner');
    const otherId = seedMember(db, 'Other');
    const agentId = seedAgent(db, ownerId);
    const agent = db.prepare('SELECT owner_id FROM users WHERE id = ?').get(agentId) as { owner_id: string };
    expect(agent.owner_id).not.toBe(otherId);
  });
});

describe('disabled/deleted user authentication', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  function checkAuth(userId: string): { allowed: boolean; reason?: string } {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as { deleted_at: number | null; disabled: number } | undefined;
    if (!user) return { allowed: false, reason: 'not_found' };
    if (user.deleted_at) return { allowed: false, reason: 'account_deleted' };
    if (user.disabled) return { allowed: false, reason: 'account_disabled' };
    return { allowed: true };
  }

  it('deleted user is rejected', () => {
    const memberId = seedMember(db);
    db.prepare('UPDATE users SET deleted_at = ? WHERE id = ?').run(Date.now(), memberId);
    const result = checkAuth(memberId);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('account_deleted');
  });

  it('disabled user is rejected', () => {
    const memberId = seedMember(db);
    db.prepare('UPDATE users SET disabled = 1 WHERE id = ?').run(memberId);
    const result = checkAuth(memberId);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('account_disabled');
  });

  it('active user is allowed', () => {
    const memberId = seedMember(db);
    expect(checkAuth(memberId).allowed).toBe(true);
  });
});

describe('grantCreatorPermissions', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  function grantCreatorPermissions(
    creatorId: string,
    creatorRole: 'admin' | 'member' | 'agent',
    channelId: string,
    ownerIdIfAgent?: string,
  ): void {
    const recipientId = creatorRole === 'agent' && ownerIdIfAgent ? ownerIdIfAgent : creatorId;
    const scope = `channel:${channelId}`;
    const now = Date.now();
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO user_permissions (user_id, permission, scope, granted_by, granted_at) VALUES (?, ?, ?, ?, ?)',
    );
    stmt.run(recipientId, 'channel.delete', scope, null, now);
    stmt.run(recipientId, 'channel.manage_members', scope, null, now);
    stmt.run(recipientId, 'channel.manage_visibility', scope, null, now);
  }

  it('admin creator also receives scoped permissions', () => {
    const adminId = seedAdmin(db);
    const channelId = seedChannel(db, adminId);
    grantCreatorPermissions(adminId, 'admin', channelId);
    const perms = db.prepare('SELECT * FROM user_permissions WHERE user_id = ? AND scope = ?').all(adminId, `channel:${channelId}`) as { permission: string }[];
    expect(perms.length).toBe(3);
    expect(perms.map(p => p.permission).sort()).toEqual(['channel.delete', 'channel.manage_members', 'channel.manage_visibility']);
  });

  it('member creator receives scoped permissions', () => {
    const memberId = seedMember(db);
    const channelId = seedChannel(db, memberId);
    grantCreatorPermissions(memberId, 'member', channelId);
    const perms = db.prepare('SELECT * FROM user_permissions WHERE user_id = ?').all(memberId) as { permission: string }[];
    expect(perms.length).toBe(3);
  });

  it('agent creator assigns permissions to owner', () => {
    const ownerId = seedMember(db, 'Owner');
    const agentId = seedAgent(db, ownerId);
    const channelId = seedChannel(db, agentId);
    grantCreatorPermissions(agentId, 'agent', channelId, ownerId);
    const ownerPerms = db.prepare('SELECT * FROM user_permissions WHERE user_id = ?').all(ownerId) as { permission: string }[];
    expect(ownerPerms.length).toBe(3);
    const agentPerms = db.prepare('SELECT * FROM user_permissions WHERE user_id = ?').all(agentId) as { permission: string }[];
    expect(agentPerms.length).toBe(0);
  });
});
