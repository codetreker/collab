import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import * as Q from '../queries.js';
import { requirePermission } from '../middleware/permissions.js';
import { pluginManager } from '../plugin-manager.js';
import type { User } from '../types.js';

export function registerAgentRoutes(app: FastifyInstance): void {
  app.post<{
    Body: { display_name: string; avatar_url?: string; permissions?: string[] };
  }>('/api/v1/agents', { preHandler: [requirePermission('agent.manage')] }, async (request, reply) => {
    const user = request.currentUser;
    if (!user) return reply.status(401).send({ error: 'Authentication required' });
    if (user.role === 'agent') return reply.status(403).send({ error: 'Agents cannot create agents' });

    const { display_name, avatar_url } = request.body ?? {};
    if (!display_name || typeof display_name !== 'string' || !display_name.trim()) {
      return reply.status(400).send({ error: 'display_name is required' });
    }

    const db = getDb();
    const id = uuidv4();
    const apiKey = `col_${crypto.randomBytes(32).toString('hex')}`;

    const txn = db.transaction(() => {
      Q.createUser(db, id, display_name.trim(), 'agent', apiKey, null, null, user.id);
      if (avatar_url) {
        db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatar_url, id);
      }
      Q.grantDefaultPermissions(db, id, 'agent', user.id);

      const general = Q.getChannelByName(db, 'general');
      if (general) {
        Q.addChannelMember(db, general.id, id);
      }
    });
    txn();

    const agent = Q.getUserById(db, id)!;
    return reply.status(201).send({
      agent: {
        id: agent.id,
        display_name: agent.display_name,
        role: agent.role,
        avatar_url: agent.avatar_url,
        owner_id: agent.owner_id,
        created_at: agent.created_at,
        api_key: apiKey,
      },
    });
  });

  app.get('/api/v1/agents', async (request, reply) => {
    const user = request.currentUser;
    if (!user) return reply.status(401).send({ error: 'Authentication required' });

    const db = getDb();
    let agents: User[];
    if (user.role === 'admin') {
      agents = db.prepare("SELECT * FROM users WHERE role = 'agent' AND deleted_at IS NULL ORDER BY created_at ASC").all() as User[];
    } else {
      agents = db.prepare("SELECT * FROM users WHERE role = 'agent' AND owner_id = ? AND deleted_at IS NULL ORDER BY created_at ASC").all(user.id) as User[];
    }

    return {
      agents: agents.map((a) => ({
        id: a.id,
        display_name: a.display_name,
        role: a.role,
        avatar_url: a.avatar_url,
        owner_id: a.owner_id,
        created_at: a.created_at,
        disabled: a.disabled,
      })),
    };
  });

  app.delete<{
    Params: { id: string };
  }>('/api/v1/agents/:id', async (request, reply) => {
    const user = request.currentUser;
    if (!user) return reply.status(401).send({ error: 'Authentication required' });

    const { id } = request.params;
    const db = getDb();
    const agent = Q.getUserById(db, id);

    if (!agent || agent.role !== 'agent') {
      return reply.status(404).send({ error: 'Agent not found' });
    }
    if (user.role !== 'admin' && agent.owner_id !== user.id) {
      return reply.status(403).send({ error: 'Only the owner or admin can delete this agent' });
    }

    const txn = db.transaction(() => {
      const now = Date.now();
      db.prepare('UPDATE users SET deleted_at = ?, disabled = 1 WHERE id = ?').run(now, id);
      db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM channel_members WHERE user_id = ?').run(id);
    });
    txn();

    return { ok: true };
  });

  app.post<{
    Params: { id: string };
  }>('/api/v1/agents/:id/rotate-api-key', async (request, reply) => {
    const user = request.currentUser;
    if (!user) return reply.status(401).send({ error: 'Authentication required' });

    const { id } = request.params;
    const db = getDb();
    const agent = Q.getUserById(db, id);

    if (!agent || agent.role !== 'agent') {
      return reply.status(404).send({ error: 'Agent not found' });
    }
    if (user.role !== 'admin' && agent.owner_id !== user.id) {
      return reply.status(403).send({ error: 'Only the owner or admin can rotate this key' });
    }

    const apiKey = `col_${crypto.randomBytes(32).toString('hex')}`;
    db.prepare('UPDATE users SET api_key = ? WHERE id = ?').run(apiKey, id);

    return { api_key: apiKey };
  });

  app.get<{
    Params: { id: string };
  }>('/api/v1/agents/:id/permissions', async (request, reply) => {
    const user = request.currentUser;
    if (!user) return reply.status(401).send({ error: 'Authentication required' });

    const { id } = request.params;
    const db = getDb();
    const agent = Q.getUserById(db, id);

    if (!agent || agent.role !== 'agent') {
      return reply.status(404).send({ error: 'Agent not found' });
    }
    if (user.role !== 'admin' && agent.owner_id !== user.id) {
      return reply.status(403).send({ error: 'Permission denied' });
    }

    const details = db.prepare(
      'SELECT id, permission, scope, granted_by, granted_at FROM user_permissions WHERE user_id = ? ORDER BY granted_at ASC',
    ).all(id) as { id: number; permission: string; scope: string; granted_by: string | null; granted_at: number }[];

    return { agent_id: id, permissions: details.map((d) => d.permission), details };
  });

  app.put<{
    Params: { id: string };
    Body: { permissions: { permission: string; scope?: string }[] };
  }>('/api/v1/agents/:id/permissions', async (request, reply) => {
    const user = request.currentUser;
    if (!user) return reply.status(401).send({ error: 'Authentication required' });

    const { id } = request.params;
    const { permissions } = request.body ?? {};

    if (!Array.isArray(permissions)) {
      return reply.status(400).send({ error: 'permissions array is required' });
    }

    const db = getDb();
    const agent = Q.getUserById(db, id);

    if (!agent || agent.role !== 'agent') {
      return reply.status(404).send({ error: 'Agent not found' });
    }
    if (user.role !== 'admin' && agent.owner_id !== user.id) {
      return reply.status(403).send({ error: 'Permission denied' });
    }

    const txn = db.transaction(() => {
      db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(id);
      const now = Date.now();
      const stmt = db.prepare(
        'INSERT OR IGNORE INTO user_permissions (user_id, permission, scope, granted_by, granted_at) VALUES (?, ?, ?, ?, ?)',
      );
      for (const p of permissions) {
        if (typeof p.permission === 'string') {
          stmt.run(id, p.permission, p.scope ?? '*', user.id, now);
        }
      }
    });
    txn();

    const details = db.prepare(
      'SELECT id, permission, scope, granted_by, granted_at FROM user_permissions WHERE user_id = ? ORDER BY granted_at ASC',
    ).all(id) as { id: number; permission: string; scope: string; granted_by: string | null; granted_at: number }[];

    return { agent_id: id, permissions: details.map((d) => d.permission), details };
  });

  app.get<{
    Params: { id: string };
    Querystring: { path?: string };
  }>('/api/v1/agents/:id/files', async (request, reply) => {
    const user = request.currentUser;
    if (!user) return reply.status(401).send({ error: 'Authentication required' });

    const { id } = request.params;
    const { path } = request.query;

    if (!path || typeof path !== 'string') {
      return reply.status(400).send({ error: 'path query parameter is required' });
    }

    const db = getDb();
    const agent = Q.getUserById(db, id);

    if (!agent || agent.role !== 'agent') {
      return reply.status(404).send({ error: 'Agent not found' });
    }
    if (agent.owner_id !== user.id) {
      return reply.status(403).send({ error: 'Only the owner can read agent files' });
    }

    const conn = pluginManager.getConnection(id);
    if (!conn || conn.ws.readyState !== 1) {
      return reply.status(503).send({ error: 'agent_offline' });
    }

    try {
      const result = await pluginManager.request(id, {
        action: 'read_file',
        path,
      }, 10_000) as Record<string, unknown>;

      if (result.error === 'path_not_allowed') {
        return reply.status(403).send({ error: 'path_not_allowed' });
      }
      if (result.error === 'file_not_found') {
        return reply.status(404).send({ error: 'file_not_found' });
      }
      if (result.error === 'file_too_large') {
        return reply.status(413).send({ error: 'file_too_large' });
      }
      if (result.error) {
        return reply.status(500).send({ error: String(result.error) });
      }

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('timed out')) {
        return reply.status(504).send({ error: 'timeout' });
      }
      if (msg.includes('not connected') || msg.includes('disconnected')) {
        return reply.status(503).send({ error: 'agent_offline' });
      }
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}
