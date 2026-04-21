import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedAgent, seedChannel,
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

describe('Public Channel Preview', () => {
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

  it('returns preview messages for public channel', async () => {
    const adminId = seedAdmin(testDb);
    const memberId = seedMember(testDb, 'Previewer');
    const chId = seedChannel(testDb, adminId, 'preview-ch');
    addChannelMember(testDb, chId, adminId);
    seedMessage(testDb, chId, adminId, 'recent msg', Date.now());

    const res = await inject('GET', `/api/v1/channels/${chId}/preview`, memberId);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.channel).toBeDefined();
    expect(Array.isArray(body.messages)).toBe(true);
  });

  it('returns 404 for private channel preview', async () => {
    const adminId = seedAdmin(testDb);
    const memberId = seedMember(testDb, 'PrivPreview');
    const chId = seedChannel(testDb, adminId, 'priv-preview', 'private');

    const res = await inject('GET', `/api/v1/channels/${chId}/preview`, memberId);
    expect(res.statusCode).toBe(404);
  });

  it('requires authentication', async () => {
    const adminId = seedAdmin(testDb);
    const chId = seedChannel(testDb, adminId, 'anon-preview');

    const res = await inject('GET', `/api/v1/channels/${chId}/preview`);
    expect(res.statusCode).toBe(401);
  });

  it('self-join a public channel after preview', async () => {
    const adminId = seedAdmin(testDb);
    const memberId = seedMember(testDb, 'SelfJoiner');
    const chId = seedChannel(testDb, adminId, 'join-after-preview');

    const previewRes = await inject('GET', `/api/v1/channels/${chId}/preview`, memberId);
    expect(previewRes.statusCode).toBe(200);

    const joinRes = await inject('POST', `/api/v1/channels/${chId}/join`, memberId);
    expect(joinRes.statusCode).toBe(200);
  });

  it('agent cannot self-join after preview', async () => {
    const adminId = seedAdmin(testDb);
    const agentId = seedAgent(testDb, adminId, 'PreviewBot');
    const chId = seedChannel(testDb, adminId, 'agent-preview');

    const joinRes = await app.inject({
      method: 'POST',
      url: `/api/v1/channels/${chId}/join`,
      headers: { authorization: `Bearer col_${agentId}` },
    });
    expect(joinRes.statusCode).toBe(403);
  });
});
