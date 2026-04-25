import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
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
import { registerChannelGroupRoutes } from '../routes/channel-groups.js';
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

function seedGroup(name: string, createdBy: string, position = '0|aaaaaa'): string {
  const id = uuidv4();
  testDb.prepare('INSERT INTO channel_groups (id, name, position, created_by, created_at) VALUES (?, ?, ?, ?, ?)').run(id, name, position, createdBy, Date.now());
  return id;
}

describe('Channel Groups API', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    app = Fastify({ logger: false });
    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/v1/auth/')) return;
      await authMiddleware(request, reply);
    });
    registerChannelRoutes(app);
    registerChannelGroupRoutes(app);
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    testDb.exec('DELETE FROM remote_bindings');
    testDb.exec('DELETE FROM remote_nodes');
    testDb.exec('DELETE FROM message_reactions');
    testDb.exec('DELETE FROM mentions');
    testDb.exec('DELETE FROM invite_codes');
    testDb.exec('DELETE FROM user_permissions');
    testDb.exec('DELETE FROM channel_members');
    testDb.exec('DELETE FROM messages');
    testDb.exec('DELETE FROM events');
    testDb.exec('DELETE FROM channels');
    testDb.exec('DELETE FROM channel_groups');
    testDb.exec('DELETE FROM users');
    broadcastToAll.mockClear();
  });

  // --- Group CRUD ---

  it('creates a group successfully', async () => {
    const adminId = seedAdmin(testDb);
    const res = await inject('POST', '/api/v1/channel-groups', adminId, { name: 'Engineering' });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.group.name).toBe('Engineering');
    expect(body.group.id).toBeDefined();
    expect(body.group.position).toBeDefined();
  });

  it('returns 400 for empty group name', async () => {
    const adminId = seedAdmin(testDb);
    const res = await inject('POST', '/api/v1/channel-groups', adminId, { name: '' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for group name > 50 chars', async () => {
    const adminId = seedAdmin(testDb);
    const res = await inject('POST', '/api/v1/channel-groups', adminId, { name: 'x'.repeat(51) });
    expect(res.statusCode).toBe(400);
  });

  it('lists groups sorted by position', async () => {
    const adminId = seedAdmin(testDb);
    seedGroup('Second', adminId, '0|mmmmmm');
    seedGroup('First', adminId, '0|aaaaaa');
    seedGroup('Third', adminId, '0|zzzzzz');

    const res = await inject('GET', '/api/v1/channel-groups', adminId);
    expect(res.statusCode).toBe(200);
    const { groups } = JSON.parse(res.body);
    expect(groups.map((g: any) => g.name)).toEqual(['First', 'Second', 'Third']);
  });

  it('renames a group successfully', async () => {
    const adminId = seedAdmin(testDb);
    const groupId = seedGroup('Old Name', adminId);

    const res = await inject('PUT', `/api/v1/channel-groups/${groupId}`, adminId, { name: 'New Name' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).group.name).toBe('New Name');
  });

  it('rename by non-creator returns 403', async () => {
    const adminId = seedAdmin(testDb);
    const memberId = seedMember(testDb, 'Other');
    const groupId = seedGroup('Mine', adminId);

    const res = await inject('PUT', `/api/v1/channel-groups/${groupId}`, memberId, { name: 'Stolen' });
    expect(res.statusCode).toBe(403);
  });

  it('rename nonexistent group returns 404', async () => {
    const adminId = seedAdmin(testDb);
    const res = await inject('PUT', '/api/v1/channel-groups/nonexistent', adminId, { name: 'Nope' });
    expect(res.statusCode).toBe(404);
  });

  it('deletes a group successfully', async () => {
    const adminId = seedAdmin(testDb);
    const groupId = seedGroup('ToDelete', adminId);

    const res = await inject('DELETE', `/api/v1/channel-groups/${groupId}`, adminId);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });

  it('delete group sets channels group_id to null', async () => {
    const adminId = seedAdmin(testDb);
    const groupId = seedGroup('Doomed', adminId);
    const chId = seedChannel(testDb, adminId, 'grouped-ch');
    testDb.prepare('UPDATE channels SET group_id = ? WHERE id = ?').run(groupId, chId);

    await inject('DELETE', `/api/v1/channel-groups/${groupId}`, adminId);

    const row = testDb.prepare('SELECT group_id FROM channels WHERE id = ?').get(chId) as any;
    expect(row.group_id).toBeNull();
  });

  it('delete group by non-creator returns 403', async () => {
    const adminId = seedAdmin(testDb);
    const memberId = seedMember(testDb, 'Outsider');
    const groupId = seedGroup('Protected', adminId);

    const res = await inject('DELETE', `/api/v1/channel-groups/${groupId}`, memberId);
    expect(res.statusCode).toBe(403);
  });

  // --- Group reorder ---

  it('reorders a group successfully', async () => {
    const adminId = seedAdmin(testDb);
    const g1 = seedGroup('G1', adminId, '0|aaaaaa');
    const g2 = seedGroup('G2', adminId, '0|zzzzzz');

    const res = await inject('PUT', '/api/v1/channel-groups/reorder', adminId, {
      group_id: g1,
      after_id: g2,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.group.position > '0|zzzzzz').toBe(true);
  });

  it('reorder group by non-creator returns 403', async () => {
    const adminId = seedAdmin(testDb);
    const memberId = seedMember(testDb, 'Rando');
    const groupId = seedGroup('NoTouch', adminId);

    const res = await inject('PUT', '/api/v1/channel-groups/reorder', memberId, {
      group_id: groupId,
      after_id: null,
    });
    expect(res.statusCode).toBe(403);
  });

  // --- Cross-group channel drag ---

  it('moves channel from ungrouped to a group', async () => {
    const adminId = seedAdmin(testDb);
    const groupId = seedGroup('Target', adminId);
    const chId = seedChannel(testDb, adminId, 'ungrouped-ch');

    const res = await inject('PUT', '/api/v1/channels/reorder', adminId, {
      channel_id: chId,
      after_id: null,
      group_id: groupId,
    });
    expect(res.statusCode).toBe(200);

    const row = testDb.prepare('SELECT group_id FROM channels WHERE id = ?').get(chId) as any;
    expect(row.group_id).toBe(groupId);
  });

  it('moves channel from group A to group B', async () => {
    const adminId = seedAdmin(testDb);
    const groupA = seedGroup('GroupA', adminId, '0|aaaaaa');
    const groupB = seedGroup('GroupB', adminId, '0|mmmmmm');
    const chId = seedChannel(testDb, adminId, 'moving-ch');
    testDb.prepare('UPDATE channels SET group_id = ? WHERE id = ?').run(groupA, chId);

    const res = await inject('PUT', '/api/v1/channels/reorder', adminId, {
      channel_id: chId,
      after_id: null,
      group_id: groupB,
    });
    expect(res.statusCode).toBe(200);

    const row = testDb.prepare('SELECT group_id FROM channels WHERE id = ?').get(chId) as any;
    expect(row.group_id).toBe(groupB);
  });

  it('channel reorder with nonexistent group_id returns 404', async () => {
    const adminId = seedAdmin(testDb);
    const chId = seedChannel(testDb, adminId, 'lost-ch');

    const res = await inject('PUT', '/api/v1/channels/reorder', adminId, {
      channel_id: chId,
      after_id: null,
      group_id: 'nonexistent-group',
    });
    expect(res.statusCode).toBe(404);
  });

  // --- GET /api/v1/channels returns real groups ---

  it('GET /api/v1/channels includes groups from channel_groups table', async () => {
    const adminId = seedAdmin(testDb);
    seedGroup('Visible', adminId);
    seedChannel(testDb, adminId, 'some-ch');

    const res = await inject('GET', '/api/v1/channels', adminId);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].name).toBe('Visible');
  });
});
