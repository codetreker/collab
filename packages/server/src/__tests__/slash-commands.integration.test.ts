import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedChannel,
  addChannelMember, authCookie, grantPermission, TestContext,
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

import { registerChannelRoutes } from '../routes/channels.js';
import { registerDmRoutes } from '../routes/dm.js';

let ctx: TestContext;

describe('Slash commands (integration)', () => {
  beforeAll(async () => {
    ctx = await TestContext.create({
      routes: [registerChannelRoutes, registerDmRoutes],
    });
    testDb = ctx.db;
  });

  afterAll(() => ctx.close());

  it('/topic → updates channel topic', async () => {
    const res = await ctx.inject('PUT', `/api/v1/channels/${ctx.channel.id}/topic`, ctx.memberA.token, { topic: 'New Topic Here' });
    expect(res.statusCode).toBe(200);
    const ch = ctx.db.prepare('SELECT topic FROM channels WHERE id = ?').get(ctx.channel.id) as any;
    expect(ch.topic).toBe('New Topic Here');
  });

  it('/invite → admin adds member to channel', async () => {
    const invCh = seedChannel(ctx.db, ctx.admin.id, 'invite-slash');
    addChannelMember(ctx.db, invCh, ctx.admin.id);
    const res = await ctx.inject('POST', `/api/v1/channels/${invCh}/members`, ctx.admin.token, { user_id: ctx.memberB.id });
    expect(res.statusCode).toBe(201);
    const member = ctx.db.prepare('SELECT * FROM channel_members WHERE channel_id = ? AND user_id = ?').get(invCh, ctx.memberB.id);
    expect(member).toBeDefined();
  });

  it('/leave → member leaves channel', async () => {
    const leaveCh = seedChannel(ctx.db, ctx.admin.id, 'leave-slash');
    addChannelMember(ctx.db, leaveCh, ctx.memberA.id);
    const res = await ctx.inject('POST', `/api/v1/channels/${leaveCh}/leave`, ctx.memberA.token);
    expect(res.statusCode).toBe(200);
    const member = ctx.db.prepare('SELECT * FROM channel_members WHERE channel_id = ? AND user_id = ?').get(leaveCh, ctx.memberA.id);
    expect(member).toBeUndefined();
  });

  it('/dm → creates DM channel between two users', async () => {
    const res = await ctx.inject('POST', `/api/v1/dm/${ctx.memberB.id}`, ctx.memberA.token);
    expect(res.statusCode).toBe(200);
    expect(res.json().channel).toBeDefined();
    expect(res.json().peer.id).toBe(ctx.memberB.id);
  });

  it('/join → member joins public channel', async () => {
    const joinCh = seedChannel(ctx.db, ctx.admin.id, 'join-slash');
    const res = await ctx.inject('POST', `/api/v1/channels/${joinCh}/join`, ctx.memberA.token);
    expect(res.statusCode).toBe(200);
  });

  it('non-member cannot set topic → 403', async () => {
    const privCh = seedChannel(ctx.db, ctx.admin.id, 'topic-deny-slash', 'private');
    const res = await ctx.inject('PUT', `/api/v1/channels/${privCh}/topic`, ctx.memberB.token, { topic: 'nope' });
    expect(res.statusCode).toBe(403);
  });
});
