import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedAgent, seedChannel, seedMessage,
  grantPermission, addChannelMember, authCookie, TestContext,
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
import { registerAgentRoutes } from '../routes/agents.js';

let ctx: TestContext;

describe('Permissions (integration)', () => {
  beforeAll(async () => {
    ctx = await TestContext.create({
      routes: [registerChannelRoutes, registerMessageRoutes, registerAgentRoutes],
    });
    testDb = ctx.db;
    grantPermission(ctx.db, ctx.memberA.id, 'channel.create');
    grantPermission(ctx.db, ctx.memberA.id, 'message.send');
    grantPermission(ctx.db, ctx.memberA.id, 'agent.manage');
    grantPermission(ctx.db, ctx.memberB.id, 'message.send');
  });

  afterAll(() => ctx.close());

  it('admin creates channel → 201', async () => {
    const res = await ctx.inject('POST', '/api/v1/channels', ctx.admin.token, { name: 'admin-perm-ch' });
    expect(res.statusCode).toBe(201);
  });

  it('member without channel.create permission → 403', async () => {
    const res = await ctx.inject('POST', '/api/v1/channels', ctx.memberB.token, { name: 'no-perm' });
    expect(res.statusCode).toBe(403);
  });

  it('member deletes own message → 204', async () => {
    const msgId = seedMessage(ctx.db, ctx.channel.id, ctx.memberA.id, 'my msg');
    const res = await ctx.inject('DELETE', `/api/v1/messages/${msgId}`, ctx.memberA.token);
    expect(res.statusCode).toBe(204);
  });

  it('member deletes other user message → 403', async () => {
    const msgId = seedMessage(ctx.db, ctx.channel.id, ctx.memberB.id, 'not mine');
    const res = await ctx.inject('DELETE', `/api/v1/messages/${msgId}`, ctx.memberA.token);
    expect(res.statusCode).toBe(403);
  });

  it('admin deletes any message → 204', async () => {
    const msgId = seedMessage(ctx.db, ctx.channel.id, ctx.memberA.id, 'admin can delete');
    const res = await ctx.inject('DELETE', `/api/v1/messages/${msgId}`, ctx.admin.token);
    expect(res.statusCode).toBe(204);
  });

  it('agent owner can delete agent, non-owner gets 403', async () => {
    const res1 = await ctx.inject('DELETE', `/api/v1/agents/${ctx.agent.id}`, ctx.memberA.token);
    expect(res1.statusCode).toBe(403);

    const res2 = await ctx.inject('DELETE', `/api/v1/agents/${ctx.agent.id}`, ctx.admin.token);
    expect(res2.statusCode).toBe(200);
  });

  it('private channel messages hidden from non-member', async () => {
    const privCh = seedChannel(ctx.db, ctx.admin.id, 'priv-vis-test', 'private');
    addChannelMember(ctx.db, privCh, ctx.memberA.id);
    seedMessage(ctx.db, privCh, ctx.memberA.id, 'secret msg');
    const res = await ctx.inject('GET', `/api/v1/channels/${privCh}/messages`, ctx.memberB.token);
    expect(res.statusCode).toBe(404);
  });
});
