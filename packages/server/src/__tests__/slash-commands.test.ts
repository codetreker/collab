import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedChannel,
  addChannelMember, authCookie,
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
import { broadcastToChannel } from '../ws.js';

let app: FastifyInstance;

function inject(method: string, url: string, userId?: string, payload?: unknown) {
  return app.inject({
    method: method as any,
    url,
    payload: payload as any,
    headers: userId ? { cookie: authCookie(userId) } : {},
  });
}

describe('Slash Commands — /topic', () => {
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
    vi.mocked(broadcastToChannel).mockClear();
  });

  it('PUT /topic updates topic and broadcasts', async () => {
    const adminId = seedAdmin(testDb);
    const chId = seedChannel(testDb, adminId, 'topic-cmd');
    addChannelMember(testDb, chId, adminId);

    const res = await inject('PUT', `/api/v1/channels/${chId}/topic`, adminId, { topic: 'New Topic via /topic' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).channel.topic).toBe('New Topic via /topic');
    expect(broadcastToChannel).toHaveBeenCalledWith(chId, expect.objectContaining({
      type: 'channel_updated',
      topic: 'New Topic via /topic',
    }));
  });

  it('non-member cannot set topic', async () => {
    const adminId = seedAdmin(testDb);
    const memberId = seedMember(testDb, 'NoTopic');
    const chId = seedChannel(testDb, adminId, 'topic-deny');

    const res = await inject('PUT', `/api/v1/channels/${chId}/topic`, memberId, { topic: 'nope' });
    expect(res.statusCode).toBe(403);
  });

  it('rejects missing topic field', async () => {
    const adminId = seedAdmin(testDb);
    const chId = seedChannel(testDb, adminId, 'topic-missing');
    addChannelMember(testDb, chId, adminId);

    const res = await inject('PUT', `/api/v1/channels/${chId}/topic`, adminId, {});
    expect(res.statusCode).toBe(400);
  });
});
