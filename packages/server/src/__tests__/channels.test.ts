import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedAgent, seedChannel,
  grantPermission, addChannelMember, authCookie,
} from './setup.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

vi.mock('../ws.js', () => ({
  broadcastToChannel: vi.fn(),
  broadcastToUser: vi.fn(),
  getOnlineUserIds: vi.fn(() => []),
  unsubscribeUserFromChannel: vi.fn(),
}));

import Fastify, { type FastifyInstance } from 'fastify';
import { registerChannelRoutes } from '../routes/channels.js';
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

describe('Channels API', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    app = Fastify({ logger: false });
    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/v1/auth/')) return;
      await authMiddleware(request, reply);
    });
    registerChannelRoutes(app);
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

  describe('POST /api/v1/channels', () => {
    it('creates a public channel', async () => {
      const adminId = seedAdmin(testDb);
      const res = await inject('POST', '/api/v1/channels', adminId, { name: 'Dev Chat' });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.channel.name).toBe('dev-chat');
      expect(body.channel.visibility).toBe('public');
    });

    it('requires channel.create permission', async () => {
      const memberId = seedMember(testDb, 'NoPerm');
      const res = await inject('POST', '/api/v1/channels', memberId, { name: 'test' });
      expect(res.statusCode).toBe(403);
    });

    it('allows member with channel.create permission', async () => {
      const memberId = seedMember(testDb, 'HasPerm');
      grantPermission(testDb, memberId, 'channel.create');
      const res = await inject('POST', '/api/v1/channels', memberId, { name: 'allowed' });
      expect(res.statusCode).toBe(201);
    });

    it('rejects duplicate channel name', async () => {
      const adminId = seedAdmin(testDb);
      await inject('POST', '/api/v1/channels', adminId, { name: 'dup' });
      const res = await inject('POST', '/api/v1/channels', adminId, { name: 'dup' });
      expect(res.statusCode).toBe(409);
    });

    it('rejects empty name', async () => {
      const adminId = seedAdmin(testDb);
      const res = await inject('POST', '/api/v1/channels', adminId, { name: '' });
      expect(res.statusCode).toBe(400);
    });

    it('rejects topic over 250 chars on create', async () => {
      const adminId = seedAdmin(testDb);
      const res = await inject('POST', '/api/v1/channels', adminId, { name: 'longtopic', topic: 'x'.repeat(251) });
      expect(res.statusCode).toBe(400);
    });

    it('rejects invalid visibility on create', async () => {
      const adminId = seedAdmin(testDb);
      const res = await inject('POST', '/api/v1/channels', adminId, { name: 'badvis', visibility: 'secret' });
      expect(res.statusCode).toBe(400);
    });

    it('creates a private channel with members', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'Bob');
      const res = await inject('POST', '/api/v1/channels', adminId, {
        name: 'secret', visibility: 'private', member_ids: [memberId],
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).channel.visibility).toBe('private');
    });
  });

  describe('GET /api/v1/channels', () => {
    it('admin sees all channels including private', async () => {
      const adminId = seedAdmin(testDb);
      seedChannel(testDb, adminId, 'pub1', 'public');
      seedChannel(testDb, adminId, 'priv1', 'private');
      const res = await inject('GET', '/api/v1/channels', adminId);
      expect(res.statusCode).toBe(200);
      const { channels } = JSON.parse(res.body);
      expect(channels.length).toBe(2);
    });

    it('member sees only joined + public channels', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'Viewer');
      const pubId = seedChannel(testDb, adminId, 'pub2', 'public');
      addChannelMember(testDb, pubId, memberId);
      seedChannel(testDb, adminId, 'priv2', 'private');
      const res = await inject('GET', '/api/v1/channels', memberId);
      const { channels } = JSON.parse(res.body);
      const names = channels.map((c: any) => c.name);
      expect(names).toContain('pub2');
      expect(names).not.toContain('priv2');
    });
  });

  describe('GET /api/v1/channels/:channelId', () => {
    it('returns channel detail', async () => {
      const adminId = seedAdmin(testDb);
      const chId = seedChannel(testDb, adminId, 'detail-ch');
      addChannelMember(testDb, chId, adminId);
      const res = await inject('GET', `/api/v1/channels/${chId}`, adminId);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).channel.name).toBe('detail-ch');
    });

    it('returns 404 for private channel to non-member', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'Outsider');
      const chId = seedChannel(testDb, adminId, 'secret-detail', 'private');
      const res = await inject('GET', `/api/v1/channels/${chId}`, memberId);
      expect(res.statusCode).toBe(404);
    });

    it('returns 404 for non-existent channel', async () => {
      const adminId = seedAdmin(testDb);
      const res = await inject('GET', '/api/v1/channels/no-such-id', adminId);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/channels/:channelId/preview', () => {
    it('returns preview for public channel', async () => {
      const adminId = seedAdmin(testDb);
      const chId = seedChannel(testDb, adminId, 'preview-ch');
      const res = await inject('GET', `/api/v1/channels/${chId}/preview`, adminId);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.channel).toBeDefined();
      expect(body.messages).toBeDefined();
    });

    it('returns 404 for private channel preview', async () => {
      const adminId = seedAdmin(testDb);
      const chId = seedChannel(testDb, adminId, 'priv-preview', 'private');
      const res = await inject('GET', `/api/v1/channels/${chId}/preview`, adminId);
      expect(res.statusCode).toBe(404);
    });

    it('returns 401 without auth', async () => {
      const adminId = seedAdmin(testDb);
      const chId = seedChannel(testDb, adminId, 'noauth-preview');
      const res = await inject('GET', `/api/v1/channels/${chId}/preview`);
      expect(res.statusCode).toBe(401);
    });

    it('returns 404 for non-existent channel', async () => {
      const adminId = seedAdmin(testDb);
      const res = await inject('GET', '/api/v1/channels/no-such/preview', adminId);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /api/v1/channels/:channelId/topic', () => {
    it('member can set topic', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'TopicMember');
      const chId = seedChannel(testDb, adminId, 'topic-set');
      addChannelMember(testDb, chId, memberId);
      const res = await inject('PUT', `/api/v1/channels/${chId}/topic`, memberId, { topic: 'new topic' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).channel.topic).toBe('new topic');
    });

    it('non-member gets 403', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'NoTopic');
      const chId = seedChannel(testDb, adminId, 'topic-no');
      const res = await inject('PUT', `/api/v1/channels/${chId}/topic`, memberId, { topic: 'nope' });
      expect(res.statusCode).toBe(403);
    });

    it('returns 400 without topic', async () => {
      const adminId = seedAdmin(testDb);
      const chId = seedChannel(testDb, adminId, 'topic-bad');
      addChannelMember(testDb, chId, adminId);
      const res = await inject('PUT', `/api/v1/channels/${chId}/topic`, adminId, {});
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for non-existent channel', async () => {
      const adminId = seedAdmin(testDb);
      const res = await inject('PUT', '/api/v1/channels/no-such/topic', adminId, { topic: 'x' });
      expect(res.statusCode).toBe(404);
    });

    it('returns 401 without auth', async () => {
      const adminId = seedAdmin(testDb);
      const chId = seedChannel(testDb, adminId, 'topic-noauth');
      const res = await inject('PUT', `/api/v1/channels/${chId}/topic`, undefined, { topic: 'x' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('PUT /api/v1/channels/:channelId', () => {
    it('member can update topic if member of channel', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'TopicSetter');
      const chId = seedChannel(testDb, adminId, 'topic-ch');
      addChannelMember(testDb, chId, memberId);
      const res = await inject('PUT', `/api/v1/channels/${chId}`, memberId, { topic: 'new topic' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).channel.topic).toBe('new topic');
    });

    it('non-member cannot update topic', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'NonMember');
      const chId = seedChannel(testDb, adminId, 'topic-ch2');
      const res = await inject('PUT', `/api/v1/channels/${chId}`, memberId, { topic: 'nope' });
      expect(res.statusCode).toBe(403);
    });

    it('requires permission to change visibility', async () => {
      const memberId = seedMember(testDb, 'VisChanger');
      const chId = seedChannel(testDb, memberId, 'vis-ch');
      const res = await inject('PUT', `/api/v1/channels/${chId}`, memberId, { visibility: 'private' });
      expect(res.statusCode).toBe(403);
    });

    it('rejects topic over 250 chars', async () => {
      const adminId = seedAdmin(testDb);
      const chId = seedChannel(testDb, adminId, 'long-topic');
      addChannelMember(testDb, chId, adminId);
      const res = await inject('PUT', `/api/v1/channels/${chId}`, adminId, { topic: 'x'.repeat(251) });
      expect(res.statusCode).toBe(400);
    });

    it('rejects invalid visibility value', async () => {
      const adminId = seedAdmin(testDb);
      const chId = seedChannel(testDb, adminId, 'bad-vis');
      const res = await inject('PUT', `/api/v1/channels/${chId}`, adminId, { visibility: 'secret' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for non-existent channel', async () => {
      const adminId = seedAdmin(testDb);
      const res = await inject('PUT', '/api/v1/channels/no-such', adminId, { topic: 'x' });
      expect(res.statusCode).toBe(404);
    });

    it('rejects invalid name', async () => {
      const adminId = seedAdmin(testDb);
      const chId = seedChannel(testDb, adminId, 'name-ch');
      const res = await inject('PUT', `/api/v1/channels/${chId}`, adminId, { name: '' });
      expect(res.statusCode).toBe(400);
    });

    it('cannot make general private', async () => {
      const adminId = seedAdmin(testDb);
      const chId = seedChannel(testDb, adminId, 'general');
      const res = await inject('PUT', `/api/v1/channels/${chId}`, adminId, { visibility: 'private' });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Channel membership', () => {
    it('join a public channel', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'Joiner');
      const chId = seedChannel(testDb, adminId, 'join-ch');
      const res = await inject('POST', `/api/v1/channels/${chId}/join`, memberId);
      expect(res.statusCode).toBe(200);
    });

    it('cannot join private channel', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'PrivJoiner');
      const chId = seedChannel(testDb, adminId, 'priv-join', 'private');
      const res = await inject('POST', `/api/v1/channels/${chId}/join`, memberId);
      expect(res.statusCode).toBe(403);
    });

    it('agent cannot self-join', async () => {
      const adminId = seedAdmin(testDb);
      const agentId = seedAgent(testDb, adminId, 'JoinBot');
      const chId = seedChannel(testDb, adminId, 'agent-join');
      const res = await inject('POST', `/api/v1/channels/${chId}/join`, agentId);
      // agent auth via JWT won't work the same way — use Bearer
      expect([401, 403]).toContain(res.statusCode);
    });

    it('leave a channel', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'Leaver');
      const chId = seedChannel(testDb, adminId, 'leave-ch');
      addChannelMember(testDb, chId, memberId);
      const res = await inject('POST', `/api/v1/channels/${chId}/leave`, memberId);
      expect(res.statusCode).toBe(200);
    });

    it('cannot leave #general', async () => {
      const adminId = seedAdmin(testDb);
      const chId = seedChannel(testDb, adminId, 'general');
      addChannelMember(testDb, chId, adminId);
      const res = await inject('POST', `/api/v1/channels/${chId}/leave`, adminId);
      expect(res.statusCode).toBe(403);
    });

    it('add member to channel with permission', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'Added');
      const chId = seedChannel(testDb, adminId, 'add-member-ch');
      addChannelMember(testDb, chId, adminId);
      const res = await inject('POST', `/api/v1/channels/${chId}/members`, adminId, { user_id: memberId });
      expect(res.statusCode).toBe(201);
    });

    it('remove member from channel', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'Removed');
      const chId = seedChannel(testDb, adminId, 'rm-member-ch');
      addChannelMember(testDb, chId, adminId);
      addChannelMember(testDb, chId, memberId);
      const res = await inject('DELETE', `/api/v1/channels/${chId}/members/${memberId}`, adminId);
      expect(res.statusCode).toBe(200);
    });

    it('cannot remove from #general', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'GenRM');
      const chId = seedChannel(testDb, adminId, 'general');
      addChannelMember(testDb, chId, adminId);
      addChannelMember(testDb, chId, memberId);
      const res = await inject('DELETE', `/api/v1/channels/${chId}/members/${memberId}`, adminId);
      expect(res.statusCode).toBe(403);
    });

    it('list channel members', async () => {
      const adminId = seedAdmin(testDb);
      const chId = seedChannel(testDb, adminId, 'list-members');
      addChannelMember(testDb, chId, adminId);
      const res = await inject('GET', `/api/v1/channels/${chId}/members`, adminId);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).members.length).toBeGreaterThanOrEqual(1);
    });

    it('private channel members hidden from non-members', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'PrivMembers');
      const chId = seedChannel(testDb, adminId, 'priv-members', 'private');
      addChannelMember(testDb, chId, adminId);
      const res = await inject('GET', `/api/v1/channels/${chId}/members`, memberId);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /api/v1/channels/:channelId/read', () => {
    it('marks channel as read for member', async () => {
      const adminId = seedAdmin(testDb);
      const chId = seedChannel(testDb, adminId, 'read-ch');
      addChannelMember(testDb, chId, adminId);
      const res = await inject('PUT', `/api/v1/channels/${chId}/read`, adminId);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).ok).toBe(true);
    });

    it('non-member cannot mark read', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'NoRead');
      const chId = seedChannel(testDb, adminId, 'noread-ch');
      const res = await inject('PUT', `/api/v1/channels/${chId}/read`, memberId);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('DELETE /api/v1/channels/:channelId', () => {
    it('deletes channel with permission', async () => {
      const adminId = seedAdmin(testDb);
      const chId = seedChannel(testDb, adminId, 'del-ch');
      addChannelMember(testDb, chId, adminId);
      const res = await inject('DELETE', `/api/v1/channels/${chId}`, adminId);
      expect(res.statusCode).toBe(200);
    });

    it('cannot delete #general', async () => {
      const adminId = seedAdmin(testDb);
      const chId = seedChannel(testDb, adminId, 'general');
      addChannelMember(testDb, chId, adminId);
      const res = await inject('DELETE', `/api/v1/channels/${chId}`, adminId);
      expect(res.statusCode).toBe(403);
    });

    it('member without permission gets 403', async () => {
      const adminId = seedAdmin(testDb);
      const memberId = seedMember(testDb, 'NoDel');
      const chId = seedChannel(testDb, adminId, 'no-del-ch');
      addChannelMember(testDb, chId, memberId);
      const res = await inject('DELETE', `/api/v1/channels/${chId}`, memberId);
      expect(res.statusCode).toBe(403);
    });

    it('idempotent delete returns 204', async () => {
      const adminId = seedAdmin(testDb);
      const chId = seedChannel(testDb, adminId, 'idempotent-del');
      addChannelMember(testDb, chId, adminId);
      await inject('DELETE', `/api/v1/channels/${chId}`, adminId);
      const res = await inject('DELETE', `/api/v1/channels/${chId}`, adminId);
      expect(res.statusCode).toBe(204);
    });
  });
});
