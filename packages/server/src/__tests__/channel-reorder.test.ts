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

const broadcastToAll = vi.fn();
vi.mock('../ws.js', () => ({
  broadcastToChannel: vi.fn(),
  broadcastToUser: vi.fn(),
  broadcastToAll: (...args: unknown[]) => broadcastToAll(...args),
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

describe('Channel Reorder API', () => {
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
    broadcastToAll.mockClear();
  });

  it('owner can reorder a channel', async () => {
    const adminId = seedAdmin(testDb);
    const ch1 = seedChannel(testDb, adminId, 'first');
    const ch2 = seedChannel(testDb, adminId, 'second');
    testDb.prepare('UPDATE channels SET position = ? WHERE id = ?').run('0|aaaaaa', ch1);
    testDb.prepare('UPDATE channels SET position = ? WHERE id = ?').run('0|zzzzzz', ch2);

    // Move ch1 to after ch2 (end)
    const res = await inject('PUT', '/api/v1/channels/reorder', adminId, {
      channel_id: ch1,
      after_id: ch2,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.channel.id).toBe(ch1);
    // New position should be after ch2
    expect(body.channel.position > '0|zzzzzz').toBe(true);
  });

  it('non-owner member gets 403', async () => {
    const adminId = seedAdmin(testDb);
    const memberId = seedMember(testDb, 'NoReorder');
    const ch1 = seedChannel(testDb, adminId, 'owned-ch');
    addChannelMember(testDb, ch1, memberId);

    const res = await inject('PUT', '/api/v1/channels/reorder', memberId, {
      channel_id: ch1,
      after_id: null,
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when channel_id does not exist', async () => {
    const adminId = seedAdmin(testDb);

    const res = await inject('PUT', '/api/v1/channels/reorder', adminId, {
      channel_id: 'nonexistent-id',
      after_id: null,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when after_id does not exist', async () => {
    const adminId = seedAdmin(testDb);
    const ch = seedChannel(testDb, adminId, 'real-ch');

    const res = await inject('PUT', '/api/v1/channels/reorder', adminId, {
      channel_id: ch,
      after_id: 'nonexistent-after',
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/v1/channels reflects new order after reorder', async () => {
    const adminId = seedAdmin(testDb);
    const ch1 = seedChannel(testDb, adminId, 'alpha');
    const ch2 = seedChannel(testDb, adminId, 'beta');
    testDb.prepare('UPDATE channels SET position = ? WHERE id = ?').run('0|aaaaaa', ch1);
    testDb.prepare('UPDATE channels SET position = ? WHERE id = ?').run('0|zzzzzz', ch2);

    // Move ch2 to top (after_id: null)
    await inject('PUT', '/api/v1/channels/reorder', adminId, {
      channel_id: ch2,
      after_id: null,
    });

    const listRes = await inject('GET', '/api/v1/channels', adminId);
    expect(listRes.statusCode).toBe(200);
    const { channels } = JSON.parse(listRes.body);
    const names = channels.map((c: any) => c.name);
    expect(names.indexOf('beta')).toBeLessThan(names.indexOf('alpha'));
  });

  it('broadcasts channels_reordered event', async () => {
    const adminId = seedAdmin(testDb);
    const ch = seedChannel(testDb, adminId, 'broadcast-ch');

    await inject('PUT', '/api/v1/channels/reorder', adminId, {
      channel_id: ch,
      after_id: null,
    });

    expect(broadcastToAll).toHaveBeenCalledTimes(1);
    const payload = broadcastToAll.mock.calls[0][0];
    expect(payload.type).toBe('channels_reordered');
    expect(payload.channel_id).toBe(ch);
    expect(payload.position).toBeDefined();
  });

  it('returns 400 when channel_id is missing', async () => {
    const adminId = seedAdmin(testDb);
    const res = await inject('PUT', '/api/v1/channels/reorder', adminId, {
      after_id: null,
    });
    expect(res.statusCode).toBe(400);
  });

  it('after_id null moves channel to top', async () => {
    const adminId = seedAdmin(testDb);
    const ch1 = seedChannel(testDb, adminId, 'top-a');
    const ch2 = seedChannel(testDb, adminId, 'top-b');
    const ch3 = seedChannel(testDb, adminId, 'top-c');
    testDb.prepare('UPDATE channels SET position = ? WHERE id = ?').run('0|dddaaa', ch1);
    testDb.prepare('UPDATE channels SET position = ? WHERE id = ?').run('0|mmmmmm', ch2);
    testDb.prepare('UPDATE channels SET position = ? WHERE id = ?').run('0|zzzzzz', ch3);

    // Move ch3 to the very top
    const res = await inject('PUT', '/api/v1/channels/reorder', adminId, {
      channel_id: ch3,
      after_id: null,
    });
    expect(res.statusCode).toBe(200);
    const newPos = JSON.parse(res.body).channel.position;
    // New position should be before ch1
    expect(newPos < '0|dddaaa').toBe(true);
  });
});
