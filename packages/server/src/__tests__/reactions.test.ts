import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedChannel,
  addChannelMember, authCookie, seedMessage,
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
import { registerReactionRoutes } from '../routes/reactions.js';
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

describe('Reactions API', () => {
  let adminId: string;
  let memberId: string;
  let channelId: string;
  let messageId: string;

  beforeAll(async () => {
    testDb = createTestDb();
    app = Fastify({ logger: false });
    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/v1/auth/')) return;
      await authMiddleware(request, reply);
    });
    registerReactionRoutes(app);
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
    memberId = seedMember(testDb, 'Reactor');
    channelId = seedChannel(testDb, adminId, 'reactions-ch');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, memberId);
    messageId = seedMessage(testDb, channelId, adminId, 'react to me');
  });

  describe('PUT /api/v1/messages/:messageId/reactions', () => {
    it('adds a reaction', async () => {
      const res = await inject('PUT', `/api/v1/messages/${messageId}/reactions`, memberId, { emoji: '👍' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.reactions.length).toBeGreaterThanOrEqual(1);
    });

    it('is idempotent — same user same emoji', async () => {
      await inject('PUT', `/api/v1/messages/${messageId}/reactions`, memberId, { emoji: '👍' });
      const res = await inject('PUT', `/api/v1/messages/${messageId}/reactions`, memberId, { emoji: '👍' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const thumbs = body.reactions.find((r: any) => r.emoji === '👍');
      expect(thumbs.count).toBe(1);
    });

    it('rejects non-member', async () => {
      const outsider = seedMember(testDb, 'OutReactor');
      const res = await inject('PUT', `/api/v1/messages/${messageId}/reactions`, outsider, { emoji: '👍' });
      expect(res.statusCode).toBe(403);
    });

    it('rejects invalid emoji', async () => {
      const res = await inject('PUT', `/api/v1/messages/${messageId}/reactions`, memberId, { emoji: 'notanemoji' });
      expect(res.statusCode).toBe(400);
    });

    it('enforces 20 emoji limit', async () => {
      const emojis = ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙'];
      for (const e of emojis) {
        testDb.prepare('INSERT INTO message_reactions (id, message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?, ?)').run(
          `r-${e}`, messageId, adminId, e, Date.now(),
        );
      }
      const res = await inject('PUT', `/api/v1/messages/${messageId}/reactions`, memberId, { emoji: '🆕' });
      expect(res.statusCode).toBe(429);
    });

    it('allows existing emoji even at limit', async () => {
      const emojis = ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙'];
      for (const e of emojis) {
        testDb.prepare('INSERT INTO message_reactions (id, message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?, ?)').run(
          `r2-${e}`, messageId, adminId, e, Date.now(),
        );
      }
      const res = await inject('PUT', `/api/v1/messages/${messageId}/reactions`, memberId, { emoji: '😀' });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('DELETE /api/v1/messages/:messageId/reactions', () => {
    it('removes a reaction', async () => {
      await inject('PUT', `/api/v1/messages/${messageId}/reactions`, memberId, { emoji: '👍' });
      const res = await inject('DELETE', `/api/v1/messages/${messageId}/reactions`, memberId, { emoji: '👍' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const thumbs = body.reactions.find((r: any) => r.emoji === '👍');
      expect(thumbs).toBeUndefined();
    });

    it('rejects non-member', async () => {
      const outsider = seedMember(testDb, 'OutDel');
      const res = await inject('DELETE', `/api/v1/messages/${messageId}/reactions`, outsider, { emoji: '👍' });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/v1/messages/:messageId/reactions', () => {
    it('lists reactions', async () => {
      await inject('PUT', `/api/v1/messages/${messageId}/reactions`, memberId, { emoji: '👍' });
      await inject('PUT', `/api/v1/messages/${messageId}/reactions`, adminId, { emoji: '👍' });
      const res = await inject('GET', `/api/v1/messages/${messageId}/reactions`, memberId);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.reactions.length).toBeGreaterThanOrEqual(1);
    });

    it('returns 404 for non-existent message', async () => {
      const res = await inject('GET', '/api/v1/messages/no-such/reactions', memberId);
      expect(res.statusCode).toBe(404);
    });
  });
});
