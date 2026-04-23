import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedChannel,
  addChannelMember, authCookie, grantPermission,
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
import { registerDmRoutes } from '../routes/dm.js';
import { authMiddleware } from '../auth.js';

let app: FastifyInstance;
let adminId: string;
let memberAId: string;
let memberBId: string;
let channelId: string;

function inject(method: string, url: string, userId?: string, payload?: unknown) {
  return app.inject({
    method: method as any,
    url,
    payload: payload as any,
    headers: userId ? { cookie: authCookie(userId) } : {},
  });
}

describe('Slash commands (integration)', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    app = Fastify({ logger: false });
    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/v1/auth/')) return;
      await authMiddleware(request, reply);
    });
    registerChannelRoutes(app);
    registerDmRoutes(app);
    await app.ready();

    adminId = seedAdmin(testDb, 'SlashAdmin');
    memberAId = seedMember(testDb, 'SlashMemberA');
    memberBId = seedMember(testDb, 'SlashMemberB');
    channelId = seedChannel(testDb, adminId, 'slash-ch');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, memberAId);
  });

  afterAll(async () => {
    await app.close();
    testDb.close();
  });

  it('/topic → updates channel topic', async () => {
    const res = await inject('PUT', `/api/v1/channels/${channelId}/topic`, memberAId, { topic: 'New Topic Here' });
    expect(res.statusCode).toBe(200);
    const ch = testDb.prepare('SELECT topic FROM channels WHERE id = ?').get(channelId) as any;
    expect(ch.topic).toBe('New Topic Here');
  });

  it('/invite → admin adds member to channel', async () => {
    const invCh = seedChannel(testDb, adminId, 'invite-slash');
    addChannelMember(testDb, invCh, adminId);
    const res = await inject('POST', `/api/v1/channels/${invCh}/members`, adminId, { user_id: memberBId });
    expect(res.statusCode).toBe(201);
    const member = testDb.prepare('SELECT * FROM channel_members WHERE channel_id = ? AND user_id = ?').get(invCh, memberBId);
    expect(member).toBeDefined();
  });

  it('/leave → member leaves channel', async () => {
    const leaveCh = seedChannel(testDb, adminId, 'leave-slash');
    addChannelMember(testDb, leaveCh, memberAId);
    const res = await inject('POST', `/api/v1/channels/${leaveCh}/leave`, memberAId);
    expect(res.statusCode).toBe(200);
    const member = testDb.prepare('SELECT * FROM channel_members WHERE channel_id = ? AND user_id = ?').get(leaveCh, memberAId);
    expect(member).toBeUndefined();
  });

  it('/dm → creates DM channel between two users', async () => {
    const res = await inject('POST', `/api/v1/dm/${memberBId}`, memberAId);
    expect(res.statusCode).toBe(200);
    expect(res.json().channel).toBeDefined();
    expect(res.json().peer.id).toBe(memberBId);
  });

  it('/join → member joins public channel', async () => {
    const joinCh = seedChannel(testDb, adminId, 'join-slash');
    const res = await inject('POST', `/api/v1/channels/${joinCh}/join`, memberAId);
    expect(res.statusCode).toBe(200);
  });

  it('non-member cannot set topic → 403', async () => {
    const privCh = seedChannel(testDb, adminId, 'topic-deny-slash', 'private');
    const res = await inject('PUT', `/api/v1/channels/${privCh}/topic`, memberBId, { topic: 'nope' });
    expect(res.statusCode).toBe(403);
  });
});
