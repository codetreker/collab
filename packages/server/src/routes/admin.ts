import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import * as Q from '../queries.js';

interface AdminUser {
  id: string;
  display_name: string;
  email: string | null;
  role: string;
  api_key: string | null;
  require_mention: number;
  created_at: number;
  owner_id: string | null;
  disabled: number;
  deleted_at: number | null;
}

function listAdminUsers(db: import('better-sqlite3').Database): AdminUser[] {
  return db
    .prepare('SELECT id, display_name, email, role, api_key, require_mention, created_at, owner_id, disabled, deleted_at FROM users ORDER BY created_at ASC')
    .all() as AdminUser[];
}

export function registerAdminRoutes(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/v1/admin/')) return;
    if (request.currentUser?.role !== 'admin') {
      return reply.status(403).send({ error: 'Admin access required' });
    }
  });

  app.get('/api/v1/admin/users', async () => {
    const db = getDb();
    const users = listAdminUsers(db);
    return { users };
  });

  app.post('/api/v1/admin/users', async (request, reply) => {
    const { id: customId, email, password, display_name, role } = request.body as {
      id?: string;
      email?: string;
      password?: string;
      display_name?: string;
      role?: string;
    };

    if (!display_name || !role) {
      return reply.status(400).send({ error: 'display_name and role are required' });
    }

    if (!['admin', 'member', 'agent'].includes(role)) {
      return reply.status(400).send({ error: 'role must be admin, member, or agent' });
    }

    if (role !== 'agent' && (!email || !password)) {
      return reply.status(400).send({ error: 'email and password are required for non-agent users' });
    }

    const db = getDb();

    if (email && Q.getUserByEmail(db, email)) {
      return reply.status(409).send({ error: 'Email already in use' });
    }

    const id = customId?.trim() || uuidv4();

    if (customId?.trim() && Q.getUserById(db, id)) {
      return reply.status(409).send({ error: 'User ID already in use' });
    }
    const passwordHash = password ? bcrypt.hashSync(password, 10) : null;
    Q.createUser(db, id, display_name, role, null, email ?? null, passwordHash);
    Q.addUserToPublicChannels(db, id);

    const user = db
      .prepare('SELECT id, display_name, email, role, api_key, require_mention, created_at FROM users WHERE id = ?')
      .get(id) as AdminUser;

    return reply.status(201).send({ user });
  });

  app.patch('/api/v1/admin/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { display_name, password, role, require_mention, disabled } = request.body as {
      display_name?: string;
      password?: string;
      role?: string;
      require_mention?: boolean;
      disabled?: boolean;
    };

    const db = getDb();
    const existing = Q.getUserById(db, id);
    if (!existing) {
      return reply.status(404).send({ error: 'User not found' });
    }

    if (role && id === request.currentUser!.id) {
      return reply.status(400).send({ error: 'Cannot change own role' });
    }

    if (role && !['admin', 'member', 'agent'].includes(role)) {
      return reply.status(400).send({ error: 'role must be admin, member, or agent' });
    }

    if (role && role !== existing.role) {
      if (role === 'agent' && !existing.owner_id) {
        return reply.status(400).send({ error: 'Cannot change role to agent without owner_id' });
      }
      if ((role === 'member' || role === 'admin') && existing.owner_id) {
        return reply.status(400).send({ error: 'Cannot change agent to member/admin while owner_id is set' });
      }
    }

    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (display_name) {
      updates.push('display_name = ?');
      params.push(display_name);
    }
    if (password) {
      updates.push('password_hash = ?');
      params.push(bcrypt.hashSync(password, 10));
    }
    if (role) {
      updates.push('role = ?');
      params.push(role);
    }
    if (require_mention !== undefined) {
      updates.push('require_mention = ?');
      params.push(require_mention ? 1 : 0);
    }
    if (disabled !== undefined) {
      updates.push('disabled = ?');
      params.push(disabled ? 1 : 0);
    }

    if (updates.length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    const txn = db.transaction(() => {
      params.push(id);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

      if (disabled === true) {
        db.prepare("UPDATE users SET disabled = 1 WHERE owner_id = ? AND role = 'agent'").run(id);
      } else if (disabled === false) {
        db.prepare("UPDATE users SET disabled = 0 WHERE owner_id = ? AND role = 'agent' AND deleted_at IS NULL").run(id);
      }
    });
    txn();

    const user = db
      .prepare('SELECT id, display_name, email, role, api_key, require_mention, created_at, owner_id, disabled, deleted_at FROM users WHERE id = ?')
      .get(id) as AdminUser;

    return { user };
  });

  app.delete('/api/v1/admin/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    if (id === request.currentUser!.id) {
      return reply.status(400).send({ error: 'Cannot delete yourself' });
    }

    const db = getDb();
    const existing = Q.getUserById(db, id);
    if (!existing) {
      return reply.status(404).send({ error: 'User not found' });
    }

    if (existing.deleted_at) {
      return reply.status(400).send({ error: 'User already deleted' });
    }

    const txn = db.transaction(() => {
      const now = Date.now();
      db.prepare('UPDATE users SET deleted_at = ?, disabled = 1 WHERE id = ?').run(now, id);
      db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM channel_members WHERE user_id = ?').run(id);

      const agents = db.prepare("SELECT id FROM users WHERE owner_id = ? AND role = 'agent' AND deleted_at IS NULL").all(id) as { id: string }[];
      for (const agent of agents) {
        db.prepare('UPDATE users SET deleted_at = ?, disabled = 1 WHERE id = ?').run(now, agent.id);
        db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(agent.id);
        db.prepare('DELETE FROM channel_members WHERE user_id = ?').run(agent.id);
      }
    });
    txn();

    return { ok: true };
  });

  app.post('/api/v1/admin/users/:id/api-key', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const existing = Q.getUserById(db, id);
    if (!existing) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const apiKey = `col_${crypto.randomBytes(32).toString('hex')}`;
    db.prepare('UPDATE users SET api_key = ? WHERE id = ?').run(apiKey, id);

    return { api_key: apiKey };
  });

  app.delete('/api/v1/admin/users/:id/api-key', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const existing = Q.getUserById(db, id);
    if (!existing) {
      return reply.status(404).send({ error: 'User not found' });
    }

    db.prepare('UPDATE users SET api_key = NULL WHERE id = ?').run(id);

    return { ok: true };
  });

  app.get('/api/v1/admin/users/:id/permissions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const user = Q.getUserById(db, id);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    if (user.role === 'admin') {
      return {
        user_id: id,
        role: 'admin',
        permissions: ['*'],
        details: [],
        note: 'Admin role has all permissions implicitly',
      };
    }

    const details = db.prepare(
      'SELECT id, permission, scope, granted_by, granted_at FROM user_permissions WHERE user_id = ? ORDER BY granted_at ASC'
    ).all(id) as { id: number; permission: string; scope: string; granted_by: string | null; granted_at: number }[];

    return {
      user_id: id,
      role: user.role,
      permissions: details.map((d) => d.permission),
      details,
    };
  });

  app.post('/api/v1/admin/users/:id/permissions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { permission, scope } = request.body as { permission?: string; scope?: string };

    if (!permission || typeof permission !== 'string') {
      return reply.status(400).send({ error: 'permission is required' });
    }

    const db = getDb();
    const user = Q.getUserById(db, id);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const now = Date.now();
    const result = db.prepare(
      'INSERT OR IGNORE INTO user_permissions (user_id, permission, scope, granted_by, granted_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, permission, scope ?? '*', request.currentUser!.id, now);

    if (result.changes === 0) {
      return reply.status(409).send({ error: 'Permission already granted' });
    }

    return reply.status(201).send({ ok: true, permission, scope: scope ?? '*' });
  });

  app.delete('/api/v1/admin/users/:id/permissions', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { permission, scope } = request.body as { permission?: string; scope?: string };

    if (!permission || typeof permission !== 'string') {
      return reply.status(400).send({ error: 'permission is required' });
    }

    const db = getDb();
    const user = Q.getUserById(db, id);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const result = db.prepare(
      'DELETE FROM user_permissions WHERE user_id = ? AND permission = ? AND scope = ?',
    ).run(id, permission, scope ?? '*');

    if (result.changes === 0) {
      return reply.status(404).send({ error: 'Permission not found' });
    }

    return { ok: true };
  });

  // ─── Invite Codes ───────────────────────────────────

  app.post('/api/v1/admin/invites', async (request, reply) => {
    const { expires_in_hours, note } = request.body as { expires_in_hours?: number; note?: string };
    const db = getDb();
    const expiresAt = expires_in_hours ? Date.now() + expires_in_hours * 3600_000 : null;
    const invite = Q.createInviteCode(db, request.currentUser!.id, expiresAt, note ?? null);
    return reply.status(201).send({ invite });
  });

  app.get('/api/v1/admin/invites', async () => {
    const db = getDb();
    return { invites: Q.listInviteCodes(db) };
  });

  app.delete('/api/v1/admin/invites/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const db = getDb();
    const ok = Q.deleteInviteCode(db, code);
    if (!ok) return reply.status(404).send({ error: 'Invite code not found' });
    return { ok: true };
  });
}
