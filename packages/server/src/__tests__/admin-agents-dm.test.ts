import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedAgent, seedChannel,
  grantPermission, addChannelMember, authCookie, seedMessage,
} from './setup.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

vi.mock('../ws.js', () => ({
  broadcastToChannel: vi.fn(),
  broadcastToUser: vi.fn(),
  broadcastToAll: vi.fn(),
  getOnlineUserIds: vi.fn(() => []),
  unsubscribeUserFromChannel: vi.fn(),
}));

import Fastify, { type FastifyInstance } from 'fastify';
import { registerAdminRoutes } from '../routes/admin.js';
import { registerAgentRoutes } from '../routes/agents.js';
import { registerDmRoutes } from '../routes/dm.js';
import { registerUserRoutes } from '../routes/users.js';
import { authMiddleware } from '../auth.js';

let app: FastifyInstance;

function inject(method: string, url: string, userId?: string, payload?: unknown) {
  return app.inject({
    method: method as any,
    url,
    payload: payload as any,
    headers: userId ? { cookie: authCookie(userId) } : {},
  });
}

describe('Admin, Agents, DM, Users API', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    app = Fastify({ logger: false });
    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/v1/auth/')) return;
      await authMiddleware(request, reply);
    });
    registerAdminRoutes(app);
    registerAgentRoutes(app);
    registerDmRoutes(app);
    registerUserRoutes(app);
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    testDb.exec('DELETE FROM message_reactions');
    testDb.exec('DELETE FROM mentions');
    testDb.exec('DELETE FROM invite_codes');
    testDb.exec('DELETE FROM user_permissions');
    testDb.exec('DELETE FROM channel_members');
    testDb.exec('DELETE FROM messages');
    testDb.exec('DELETE FROM events');
    testDb.exec('DELETE FROM channels');
    testDb.exec('DELETE FROM users');
  });

  // ─── Users ─────────────────────────────────────────
  describe('GET /api/v1/users', () => {
    it('lists only users sharing a channel with the current user', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'Alice');
      const outsiderId = seedMember(testDb, 'Outsider');
      const channelId = seedChannel(testDb, adminId, 'shared');
      addChannelMember(testDb, channelId, adminId);
      addChannelMember(testDb, channelId, memberId);

      const res = await inject('GET', '/api/v1/users', memberId);
      expect(res.statusCode).toBe(200);
      const users = JSON.parse(res.body).users;
      expect(users.map((u: { id: string }) => u.id).sort()).toEqual([adminId, memberId].sort());
      expect(users.map((u: { id: string }) => u.id)).not.toContain(outsiderId);
    });

    it('returns only public-safe user fields', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'Alice');
      const agentId = seedAgent(testDb, adminId, 'MentionBot');
      const channelId = seedChannel(testDb, adminId, 'mentions');
      addChannelMember(testDb, channelId, memberId);
      addChannelMember(testDb, channelId, agentId);

      const res = await inject('GET', '/api/v1/users', memberId);
      expect(res.statusCode).toBe(200);
      const users = JSON.parse(res.body).users;
      expect(users.find((u: { id: string }) => u.id === agentId)).toEqual({
        id: agentId,
        display_name: 'MentionBot',
        role: 'agent',
        avatar_url: null,
      });
      expect(Object.keys(users[0]).sort()).toEqual(['avatar_url', 'display_name', 'id', 'role']);
    });
  });

  // ─── DM ────────────────────────────────────────────
  describe('DM routes', () => {
    it('creates a DM channel', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'DmPeer');
      const res = await inject('POST', `/api/v1/dm/${memberId}`, adminId);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).channel).toBeDefined();
      expect(JSON.parse(res.body).peer.id).toBe(memberId);
    });

    it('cannot DM yourself', async () => {
      const adminId = seedAdmin(testDb);
      const res = await inject('POST', `/api/v1/dm/${adminId}`, adminId);
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for non-existent user', async () => {
      const adminId = seedAdmin(testDb);
      const res = await inject('POST', '/api/v1/dm/no-such-user', adminId);
      expect(res.statusCode).toBe(404);
    });

    it('lists DM channels', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'DmList');
      await inject('POST', `/api/v1/dm/${memberId}`, adminId);
      const res = await inject('GET', '/api/v1/dm', adminId);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).channels.length).toBe(1);
    });
  });

  // ─── Admin Users ───────────────────────────────────
  describe('Admin user routes', () => {
    it('lists users as admin', async () => {
      const adminId = seedAdmin(testDb);
      const res = await inject('GET', '/api/v1/admin/users', adminId);
      expect(res.statusCode).toBe(200);
    });

    it('non-admin gets 403', async () => {
      const memberId = seedMember(testDb, 'NoAdmin');
      const res = await inject('GET', '/api/v1/admin/users', memberId);
      expect(res.statusCode).toBe(403);
    });

    it('creates a user', async () => {
      const adminId = seedAdmin(testDb);
      const res = await inject('POST', '/api/v1/admin/users', adminId, {
        display_name: 'NewGuy', role: 'member', email: 'new@test.com', password: 'password123',
      });
      expect(res.statusCode).toBe(201);
    });

    it('rejects missing fields', async () => {
      const adminId = seedAdmin(testDb);
      const res = await inject('POST', '/api/v1/admin/users', adminId, { display_name: 'NoRole' });
      expect(res.statusCode).toBe(400);
    });

    it('rejects invalid role', async () => {
      const adminId = seedAdmin(testDb);
      const res = await inject('POST', '/api/v1/admin/users', adminId, {
        display_name: 'Bad', role: 'superadmin', email: 'b@t.com', password: 'pw123456',
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects duplicate email', async () => {
      const adminId = seedAdmin(testDb);
      seedMember(testDb, 'Exists');
      const res = await inject('POST', '/api/v1/admin/users', adminId, {
        display_name: 'Dup', role: 'member', email: 'exists@test.com', password: 'pw123456',
      });
      expect(res.statusCode).toBe(409);
    });

    it('patches a user', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'ToPatch');
      const res = await inject('PATCH', `/api/v1/admin/users/${memberId}`, adminId, { display_name: 'Patched' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).user.display_name).toBe('Patched');
    });

    it('cannot change own role', async () => {
      const adminId = seedAdmin(testDb);
      const res = await inject('PATCH', `/api/v1/admin/users/${adminId}`, adminId, { role: 'member' });
      expect(res.statusCode).toBe(400);
    });

    it('rejects empty update', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'EmptyPatch');
      const res = await inject('PATCH', `/api/v1/admin/users/${memberId}`, adminId, {});
      expect(res.statusCode).toBe(400);
    });

    it('deletes a user', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'ToDelete');
      const res = await inject('DELETE', `/api/v1/admin/users/${memberId}`, adminId);
      expect(res.statusCode).toBe(200);
    });

    it('cannot delete self', async () => {
      const adminId = seedAdmin(testDb);
      const res = await inject('DELETE', `/api/v1/admin/users/${adminId}`, adminId);
      expect(res.statusCode).toBe(400);
    });

    it('manages api keys', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'ApiKey');
      const createRes = await inject('POST', `/api/v1/admin/users/${memberId}/api-key`, adminId);
      expect(createRes.statusCode).toBe(200);
      expect(JSON.parse(createRes.body).api_key).toMatch(/^bgr_/);
      const delRes = await inject('DELETE', `/api/v1/admin/users/${memberId}/api-key`, adminId);
      expect(delRes.statusCode).toBe(200);
    });

    it('manages user permissions', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'PermUser');
      const getRes = await inject('GET', `/api/v1/admin/users/${memberId}/permissions`, adminId);
      expect(getRes.statusCode).toBe(200);

      const addRes = await inject('POST', `/api/v1/admin/users/${memberId}/permissions`, adminId, { permission: 'test.perm' });
      expect(addRes.statusCode).toBe(201);

      const dupRes = await inject('POST', `/api/v1/admin/users/${memberId}/permissions`, adminId, { permission: 'test.perm' });
      expect(dupRes.statusCode).toBe(409);

      const delRes = await inject('DELETE', `/api/v1/admin/users/${memberId}/permissions`, adminId, { permission: 'test.perm' });
      expect(delRes.statusCode).toBe(200);
    });

    it('admin permissions returns note for admin user', async () => {
      const adminId = seedAdmin(testDb);
      const res = await inject('GET', `/api/v1/admin/users/${adminId}/permissions`, adminId);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).note).toMatch(/admin/i);
    });
  });

  // ─── Admin Invites ─────────────────────────────────
  describe('Admin invite routes', () => {
    it('creates and lists invites', async () => {
      const adminId = seedAdmin(testDb);
      const createRes = await inject('POST', '/api/v1/admin/invites', adminId, { note: 'test invite' });
      expect(createRes.statusCode).toBe(201);

      const listRes = await inject('GET', '/api/v1/admin/invites', adminId);
      expect(listRes.statusCode).toBe(200);
      expect(JSON.parse(listRes.body).invites.length).toBe(1);
    });

    it('deletes an invite', async () => {
      const adminId = seedAdmin(testDb);
      const createRes = await inject('POST', '/api/v1/admin/invites', adminId, {});
      const code = JSON.parse(createRes.body).invite.code;
      const res = await inject('DELETE', `/api/v1/admin/invites/${code}`, adminId);
      expect(res.statusCode).toBe(200);
    });
  });

  // ─── Admin Channels ────────────────────────────────
  describe('Admin channel routes', () => {
    it('lists all channels', async () => {
      const adminId = seedAdmin(testDb);
      seedChannel(testDb, adminId, 'admin-ch');
      const res = await inject('GET', '/api/v1/admin/channels', adminId);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).channels.length).toBe(1);
    });

    it('force deletes a channel', async () => {
      const adminId = seedAdmin(testDb);
      const chId = seedChannel(testDb, adminId, 'force-del');
      const res = await inject('DELETE', `/api/v1/admin/channels/${chId}/force`, adminId);
      expect(res.statusCode).toBe(200);
    });

    it('cannot force delete #general', async () => {
      const adminId = seedAdmin(testDb);
      const chId = seedChannel(testDb, adminId, 'general');
      const res = await inject('DELETE', `/api/v1/admin/channels/${chId}/force`, adminId);
      expect(res.statusCode).toBe(409);
    });
  });

  // ─── Agents ────────────────────────────────────────
  describe('Agent routes', () => {
    it('creates an agent', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'AgentOwner');
      grantPermission(testDb, memberId, 'agent.manage');
      const res = await inject('POST', '/api/v1/agents', memberId, { display_name: 'MyBot' });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.agent.api_key).toMatch(/^bgr_/);
      expect(body.agent.owner_id).toBe(memberId);
    });

    it('lists agents — owner sees own only', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'Owner2');
      grantPermission(testDb, memberId, 'agent.manage');
      seedAgent(testDb, adminId, 'AdminBot');
      seedAgent(testDb, memberId, 'MemberBot');
      const res = await inject('GET', '/api/v1/agents', memberId);
      const body = JSON.parse(res.body);
      expect(body.agents.length).toBe(1);
      expect(body.agents[0].display_name).toBe('MemberBot');
    });

    it('admin sees all agents', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'Owner3');
      seedAgent(testDb, adminId, 'A1');
      seedAgent(testDb, memberId, 'A2');
      const res = await inject('GET', '/api/v1/agents', adminId);
      expect(JSON.parse(res.body).agents.length).toBe(2);
    });

    it('deletes an agent', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'DelOwner');
      grantPermission(testDb, memberId, 'agent.manage');
      const agentId = seedAgent(testDb, memberId, 'DelBot');
      const res = await inject('DELETE', `/api/v1/agents/${agentId}`, memberId);
      expect(res.statusCode).toBe(200);
    });

    it('non-owner cannot delete agent', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'NotOwner');
      const agentId = seedAgent(testDb, adminId, 'ProtectedBot');
      const res = await inject('DELETE', `/api/v1/agents/${agentId}`, memberId);
      expect(res.statusCode).toBe(403);
    });

    it('rotates api key', async () => {
      const adminId = seedAdmin(testDb);
      const agentId = seedAgent(testDb, adminId, 'RotateBot');
      const res = await inject('POST', `/api/v1/agents/${agentId}/rotate-api-key`, adminId);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).api_key).toMatch(/^bgr_/);
    });

    it('gets agent permissions', async () => {
      const adminId = seedAdmin(testDb);
      const agentId = seedAgent(testDb, adminId, 'PermBot');
      grantPermission(testDb, agentId, 'message.send');
      const res = await inject('GET', `/api/v1/agents/${agentId}/permissions`, adminId);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).permissions).toContain('message.send');
    });

    it('replaces agent permissions', async () => {
      const adminId = seedAdmin(testDb);
      const agentId = seedAgent(testDb, adminId, 'ReplBot');
      const res = await inject('PUT', `/api/v1/agents/${agentId}/permissions`, adminId, {
        permissions: [{ permission: 'message.send' }, { permission: 'channel.create' }],
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).permissions.length).toBe(2);
    });
  });
});
