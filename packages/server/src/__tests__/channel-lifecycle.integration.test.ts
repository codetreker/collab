import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedChannel, seedMessage,
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
import { registerMessageRoutes } from '../routes/messages.js';
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

describe('Channel lifecycle (integration)', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    app = Fastify({ logger: false });
    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/v1/auth/')) return;
      await authMiddleware(request, reply);
    });
    registerChannelRoutes(app);
    registerMessageRoutes(app);
    registerDmRoutes(app);
    await app.ready();

    adminId = seedAdmin(testDb, 'LifeAdmin');
    memberAId = seedMember(testDb, 'LifeMemberA');
    memberBId = seedMember(testDb, 'LifeMemberB');
    grantPermission(testDb, memberAId, 'message.send');
    grantPermission(testDb, memberBId, 'message.send');
    channelId = seedChannel(testDb, adminId, 'life-ch');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, memberAId);
    addChannelMember(testDb, channelId, memberBId);
  });

  afterAll(async () => {
    await app.close();
    testDb.close();
  });

  it('admin creates public channel → 201', async () => {
    const res = await inject('POST', '/api/v1/channels', adminId, { name: 'pub-life', visibility: 'public' });
    expect(res.statusCode).toBe(201);
    expect(res.json().channel.visibility).toBe('public');
  });

  it('admin creates private channel → 201', async () => {
    const res = await inject('POST', '/api/v1/channels', adminId, { name: 'priv-life', visibility: 'private' });
    expect(res.statusCode).toBe(201);
    expect(res.json().channel.visibility).toBe('private');
  });

  it('member joins public channel → 200', async () => {
    const chId = seedChannel(testDb, adminId, 'join-life');
    const res = await inject('POST', `/api/v1/channels/${chId}/join`, memberAId);
    expect(res.statusCode).toBe(200);
  });

  it('member sends message in channel → 201', async () => {
    const res = await inject('POST', `/api/v1/channels/${channelId}/messages`, memberAId, { content: 'hello world' });
    expect(res.statusCode).toBe(201);
    expect(res.json().message.content).toBe('hello world');
  });

  it('soft delete channel → member 403, admin 200', async () => {
    const chId = seedChannel(testDb, adminId, 'del-life');
    addChannelMember(testDb, chId, adminId);
    addChannelMember(testDb, chId, memberAId);
    const res1 = await inject('DELETE', `/api/v1/channels/${chId}`, memberAId);
    expect(res1.statusCode).toBe(403);
    const res2 = await inject('DELETE', `/api/v1/channels/${chId}`, adminId);
    expect(res2.statusCode).toBe(200);
  });

  it('public channel preview → recent messages only', async () => {
    const chId = seedChannel(testDb, adminId, 'preview-life');
    const now = Date.now();
    seedMessage(testDb, chId, adminId, 'recent', now - 3600_000);
    seedMessage(testDb, chId, adminId, 'old', now - 25 * 3600_000);
    const res = await inject('GET', `/api/v1/channels/${chId}/preview`, memberBId);
    expect(res.statusCode).toBe(200);
    const msgs = res.json().messages;
    expect(msgs.some((m: any) => m.content === 'recent')).toBe(true);
    expect(msgs.some((m: any) => m.content === 'old')).toBe(false);
  });

  it('multi-channel isolation → messages do not leak', async () => {
    const chA = seedChannel(testDb, adminId, 'iso-a');
    const chB = seedChannel(testDb, adminId, 'iso-b');
    addChannelMember(testDb, chA, adminId);
    addChannelMember(testDb, chB, adminId);
    seedMessage(testDb, chA, adminId, 'msg-in-A');
    const res = await inject('GET', `/api/v1/channels/${chB}/messages`, adminId);
    const msgs = res.json().messages || [];
    expect(msgs.find((m: any) => m.content === 'msg-in-A')).toBeUndefined();
  });

  it('DM creation → only participants can see', async () => {
    const res = await inject('POST', `/api/v1/dm/${memberBId}`, memberAId);
    expect(res.statusCode).toBe(200);
    const dmChannelId = res.json().channel.id;
    const res2 = await inject('GET', `/api/v1/channels/${dmChannelId}`, memberBId);
    expect(res2.statusCode).toBe(200);
  });

  it('kick member → removed user cannot access channel', async () => {
    const chId = seedChannel(testDb, adminId, 'kick-life');
    addChannelMember(testDb, chId, adminId);
    addChannelMember(testDb, chId, memberAId);
    const res1 = await inject('DELETE', `/api/v1/channels/${chId}/members/${memberAId}`, adminId);
    expect(res1.statusCode).toBe(200);
    const member = testDb.prepare('SELECT * FROM channel_members WHERE channel_id = ? AND user_id = ?').get(chId, memberAId);
    expect(member).toBeUndefined();
  });
});
