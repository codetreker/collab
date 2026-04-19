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
}

function listAdminUsers(db: import('better-sqlite3').Database): AdminUser[] {
  return db
    .prepare('SELECT id, display_name, email, role, api_key, require_mention, created_at FROM users ORDER BY created_at ASC')
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

    if (!email || !password || !display_name || !role) {
      return reply.status(400).send({ error: 'email, password, display_name, and role are required' });
    }

    if (!['admin', 'member', 'agent'].includes(role)) {
      return reply.status(400).send({ error: 'role must be admin, member, or agent' });
    }

    const db = getDb();

    if (Q.getUserByEmail(db, email)) {
      return reply.status(409).send({ error: 'Email already in use' });
    }

    const id = customId?.trim() || uuidv4();

    if (customId?.trim() && Q.getUserById(db, id)) {
      return reply.status(409).send({ error: 'User ID already in use' });
    }
    const passwordHash = bcrypt.hashSync(password, 10);
    Q.createUser(db, id, display_name, role, null, email, passwordHash);
    Q.addUserToAllChannels(db, id);

    const user = db
      .prepare('SELECT id, display_name, email, role, api_key, require_mention, created_at FROM users WHERE id = ?')
      .get(id) as AdminUser;

    return reply.status(201).send({ user });
  });

  app.put('/api/v1/admin/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { display_name, password, role, require_mention } = request.body as {
      display_name?: string;
      password?: string;
      role?: string;
      require_mention?: boolean;
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

    const updates: string[] = [];
    const params: (string | null)[] = [];

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
      params.push(require_mention ? '1' : '0');
    }

    if (updates.length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    params.push(id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const user = db
      .prepare('SELECT id, display_name, email, role, api_key, require_mention, created_at FROM users WHERE id = ?')
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

    db.prepare('DELETE FROM mentions WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM channel_members WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);

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
}
