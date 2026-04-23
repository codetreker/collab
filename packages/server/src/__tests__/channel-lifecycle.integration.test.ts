import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedChannel, seedMessage,
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
import { registerMessageRoutes } from '../routes/messages.js';
import { registerDmRoutes } from '../routes/dm.js';

let ctx: TestContext;

describe('Channel lifecycle (integration)', () => {
  beforeAll(async () => {
    ctx = await TestContext.create({
      routes: [registerChannelRoutes, registerMessageRoutes, registerDmRoutes],
    });
    testDb = ctx.db;
    grantPermission(ctx.db, ctx.memberA.id, 'message.send');
    grantPermission(ctx.db, ctx.memberB.id, 'message.send');
  });

  afterAll(() => ctx.close());

  it('admin creates public channel → 201', async () => {
    const res = await ctx.inject('POST', '/api/v1/channels', ctx.admin.token, { name: 'pub-life', visibility: 'public' });
    expect(res.statusCode).toBe(201);
    expect(res.json().channel.visibility).toBe('public');
  });

  it('admin creates private channel → 201', async () => {
    const res = await ctx.inject('POST', '/api/v1/channels', ctx.admin.token, { name: 'priv-life', visibility: 'private' });
    expect(res.statusCode).toBe(201);
    expect(res.json().channel.visibility).toBe('private');
  });

  it('member joins public channel → 200', async () => {
    const chId = seedChannel(ctx.db, ctx.admin.id, 'join-life');
    const res = await ctx.inject('POST', `/api/v1/channels/${chId}/join`, ctx.memberA.token);
    expect(res.statusCode).toBe(200);
  });

  it('member sends message in channel → 201', async () => {
    const res = await ctx.inject('POST', `/api/v1/channels/${ctx.channel.id}/messages`, ctx.memberA.token, { content: 'hello world' });
    expect(res.statusCode).toBe(201);
    expect(res.json().message.content).toBe('hello world');
  });

  it('soft delete channel → member 403, admin 200', async () => {
    const chId = seedChannel(ctx.db, ctx.admin.id, 'del-life');
    addChannelMember(ctx.db, chId, ctx.admin.id);
    addChannelMember(ctx.db, chId, ctx.memberA.id);
    const res1 = await ctx.inject('DELETE', `/api/v1/channels/${chId}`, ctx.memberA.token);
    expect(res1.statusCode).toBe(403);
    const res2 = await ctx.inject('DELETE', `/api/v1/channels/${chId}`, ctx.admin.token);
    expect(res2.statusCode).toBe(200);
  });

  it('public channel preview → recent messages only', async () => {
    const chId = seedChannel(ctx.db, ctx.admin.id, 'preview-life');
    const now = Date.now();
    seedMessage(ctx.db, chId, ctx.admin.id, 'recent', now - 3600_000);
    seedMessage(ctx.db, chId, ctx.admin.id, 'old', now - 25 * 3600_000);
    const res = await ctx.inject('GET', `/api/v1/channels/${chId}/preview`, ctx.memberB.token);
    expect(res.statusCode).toBe(200);
    const msgs = res.json().messages;
    expect(msgs.some((m: any) => m.content === 'recent')).toBe(true);
    expect(msgs.some((m: any) => m.content === 'old')).toBe(false);
  });

  it('multi-channel isolation → messages do not leak', async () => {
    const chA = seedChannel(ctx.db, ctx.admin.id, 'iso-a');
    const chB = seedChannel(ctx.db, ctx.admin.id, 'iso-b');
    addChannelMember(ctx.db, chA, ctx.admin.id);
    addChannelMember(ctx.db, chB, ctx.admin.id);
    seedMessage(ctx.db, chA, ctx.admin.id, 'msg-in-A');
    const res = await ctx.inject('GET', `/api/v1/channels/${chB}/messages`, ctx.admin.token);
    const msgs = res.json().messages || [];
    expect(msgs.find((m: any) => m.content === 'msg-in-A')).toBeUndefined();
  });

  it('DM creation → only participants can see', async () => {
    const res = await ctx.inject('POST', `/api/v1/dm/${ctx.memberB.id}`, ctx.memberA.token);
    expect(res.statusCode).toBe(200);
    const dmChannelId = res.json().channel.id;
    const res2 = await ctx.inject('GET', `/api/v1/channels/${dmChannelId}`, ctx.memberB.token);
    expect(res2.statusCode).toBe(200);
  });

  it('kick member → removed user cannot access channel', async () => {
    const chId = seedChannel(ctx.db, ctx.admin.id, 'kick-life');
    addChannelMember(ctx.db, chId, ctx.admin.id);
    addChannelMember(ctx.db, chId, ctx.memberA.id);
    const res1 = await ctx.inject('DELETE', `/api/v1/channels/${chId}/members/${ctx.memberA.id}`, ctx.admin.token);
    expect(res1.statusCode).toBe(200);
    const member = ctx.db.prepare('SELECT * FROM channel_members WHERE channel_id = ? AND user_id = ?').get(chId, ctx.memberA.id);
    expect(member).toBeUndefined();
  });
});
