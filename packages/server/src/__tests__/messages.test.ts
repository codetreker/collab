import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedChannel,
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
  getOnlineUserIds: vi.fn(() => []),
  unsubscribeUserFromChannel: vi.fn(),
}));

import Fastify, { type FastifyInstance } from 'fastify';
import { registerMessageRoutes } from '../routes/messages.js';
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

describe('Messages API', () => {
  let adminId: string;
  let memberId: string;
  let channelId: string;

  beforeAll(async () => {
    testDb = createTestDb();
    app = Fastify({ logger: false });
    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/v1/auth/')) return;
      await authMiddleware(request, reply);
    });
    registerMessageRoutes(app);
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

    adminId = seedAdmin(testDb);
    memberId = seedMember(testDb, 'Chatter');
    channelId = seedChannel(testDb, adminId, 'msgs');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, memberId);
    grantPermission(testDb, memberId, 'message.send');
  });

  describe('POST /api/v1/channels/:channelId/messages', () => {
    it('sends a message', async () => {
      const res = await inject('POST', `/api/v1/channels/${channelId}/messages`, memberId, { content: 'hello world' });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.message.content).toBe('hello world');
      expect(body.message.sender_id).toBe(memberId);
    });

    it('rejects empty content', async () => {
      const res = await inject('POST', `/api/v1/channels/${channelId}/messages`, memberId, { content: '' });
      expect(res.statusCode).toBe(400);
    });

    it('rejects non-member', async () => {
      const outsider = seedMember(testDb, 'Outsider');
      grantPermission(testDb, outsider, 'message.send');
      const res = await inject('POST', `/api/v1/channels/${channelId}/messages`, outsider, { content: 'hi' });
      expect(res.statusCode).toBe(403);
    });

    it('rejects without message.send permission', async () => {
      const noPermUser = seedMember(testDb, 'NoPerm');
      addChannelMember(testDb, channelId, noPermUser);
      const res = await inject('POST', `/api/v1/channels/${channelId}/messages`, noPermUser, { content: 'hi' });
      expect(res.statusCode).toBe(403);
    });

    it('rejects invalid content_type', async () => {
      const res = await inject('POST', `/api/v1/channels/${channelId}/messages`, memberId, { content: 'hi', content_type: 'video' });
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for non-existent channel', async () => {
      const res = await inject('POST', '/api/v1/channels/no-such/messages', memberId, { content: 'hi' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/channels/:channelId/messages', () => {
    it('lists messages with pagination', async () => {
      for (let i = 0; i < 5; i++) {
        seedMessage(testDb, channelId, memberId, `msg-${i}`, Date.now() + i);
      }
      const res = await inject('GET', `/api/v1/channels/${channelId}/messages?limit=3`, adminId);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.messages.length).toBe(3);
      expect(body.has_more).toBe(true);
    });

    it('returns 404 for private channel non-member', async () => {
      const privCh = seedChannel(testDb, adminId, 'priv-msgs', 'private');
      const outsider = seedMember(testDb, 'Out');
      const res = await inject('GET', `/api/v1/channels/${privCh}/messages`, outsider);
      expect(res.statusCode).toBe(404);
    });

    it('deleted messages have empty content', async () => {
      const msgId = seedMessage(testDb, channelId, memberId, 'secret');
      testDb.prepare('UPDATE messages SET deleted_at = ? WHERE id = ?').run(Date.now(), msgId);
      const res = await inject('GET', `/api/v1/channels/${channelId}/messages`, adminId);
      const body = JSON.parse(res.body);
      const msg = body.messages.find((m: any) => m.id === msgId);
      expect(msg.content).toBe('');
    });
  });

  describe('GET /api/v1/channels/:channelId/messages/search', () => {
    it('searches messages by content', async () => {
      seedMessage(testDb, channelId, memberId, 'hello world');
      seedMessage(testDb, channelId, memberId, 'goodbye world');
      seedMessage(testDb, channelId, memberId, 'something else');
      const res = await inject('GET', `/api/v1/channels/${channelId}/messages/search?q=world`, adminId);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.messages.length).toBe(2);
    });

    it('requires query parameter', async () => {
      const res = await inject('GET', `/api/v1/channels/${channelId}/messages/search`, adminId);
      expect(res.statusCode).toBe(400);
    });
  });

  describe('PUT /api/v1/messages/:messageId', () => {
    it('edits own message', async () => {
      const msgId = seedMessage(testDb, channelId, memberId, 'original');
      const res = await inject('PUT', `/api/v1/messages/${msgId}`, memberId, { content: 'edited' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).message.content).toBe('edited');
    });

    it('cannot edit another user message', async () => {
      const msgId = seedMessage(testDb, channelId, adminId, 'admin msg');
      const res = await inject('PUT', `/api/v1/messages/${msgId}`, memberId, { content: 'hack' });
      expect(res.statusCode).toBe(403);
    });

    it('cannot edit deleted message', async () => {
      const msgId = seedMessage(testDb, channelId, memberId, 'to delete');
      testDb.prepare('UPDATE messages SET deleted_at = ? WHERE id = ?').run(Date.now(), msgId);
      const res = await inject('PUT', `/api/v1/messages/${msgId}`, memberId, { content: 'revive' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/v1/messages/:messageId', () => {
    it('owner can delete own message', async () => {
      const msgId = seedMessage(testDb, channelId, memberId, 'bye');
      const res = await inject('DELETE', `/api/v1/messages/${msgId}`, memberId);
      expect(res.statusCode).toBe(204);
    });

    it('admin can delete any message', async () => {
      const msgId = seedMessage(testDb, channelId, memberId, 'admin del');
      const res = await inject('DELETE', `/api/v1/messages/${msgId}`, adminId);
      expect(res.statusCode).toBe(204);
    });

    it('non-owner non-admin gets 403', async () => {
      const other = seedMember(testDb, 'Other');
      addChannelMember(testDb, channelId, other);
      const msgId = seedMessage(testDb, channelId, memberId, 'protected');
      const res = await inject('DELETE', `/api/v1/messages/${msgId}`, other);
      expect(res.statusCode).toBe(403);
    });

    it('idempotent delete returns 204', async () => {
      const msgId = seedMessage(testDb, channelId, memberId, 'twice');
      await inject('DELETE', `/api/v1/messages/${msgId}`, memberId);
      const res = await inject('DELETE', `/api/v1/messages/${msgId}`, memberId);
      expect(res.statusCode).toBe(204);
    });
  });
});
