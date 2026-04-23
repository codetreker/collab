import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedAgent, seedChannel, seedMessage,
  addChannelMember, grantPermission, authCookie, TestContext,
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

import { registerAdminRoutes } from '../routes/admin.js';
import { registerMessageRoutes } from '../routes/messages.js';

let ctx: TestContext;

describe('requireMention flag (integration)', () => {
  beforeAll(async () => {
    ctx = await TestContext.create({
      routes: [registerAdminRoutes, registerMessageRoutes],
    });
    testDb = ctx.db;
    grantPermission(ctx.db, ctx.admin.id, 'message.send');
  });

  afterAll(() => ctx.close());

  it('agent defaults to require_mention=1', () => {
    const row = ctx.db.prepare('SELECT require_mention FROM users WHERE id = ?').get(ctx.agent.id) as any;
    expect(row.require_mention).toBe(1);
  });

  it('admin can update require_mention via PATCH /api/v1/admin/users/:id', async () => {
    const res = await ctx.inject('PATCH', `/api/v1/admin/users/${ctx.agent.id}`, ctx.admin.token, { require_mention: false });
    expect(res.statusCode).toBe(200);
    const row = ctx.db.prepare('SELECT require_mention FROM users WHERE id = ?').get(ctx.agent.id) as any;
    expect(row.require_mention).toBe(0);
  });

  it('admin can set require_mention back to true', async () => {
    const res = await ctx.inject('PATCH', `/api/v1/admin/users/${ctx.agent.id}`, ctx.admin.token, { require_mention: true });
    expect(res.statusCode).toBe(200);
    const row = ctx.db.prepare('SELECT require_mention FROM users WHERE id = ?').get(ctx.agent.id) as any;
    expect(row.require_mention).toBe(1);
  });

  it('require_mention is visible in admin user list', async () => {
    const res = await ctx.inject('GET', '/api/v1/admin/users', ctx.admin.token);
    expect(res.statusCode).toBe(200);
    const agent = res.json().users.find((u: any) => u.id === ctx.agent.id);
    expect(agent).toBeDefined();
    expect(agent.require_mention).toBeDefined();
  });

  it('message without @mention does not create mention entry for agent', async () => {
    const res = await ctx.inject('POST', `/api/v1/channels/${ctx.channel.id}/messages`, ctx.admin.token, {
      content: 'hello everyone',
    });
    expect(res.statusCode).toBe(201);
    const msgId = res.json().message.id;
    const mention = ctx.db.prepare('SELECT * FROM mentions WHERE message_id = ? AND user_id = ?').get(msgId, ctx.agent.id);
    expect(mention).toBeUndefined();
  });

  it('message with @mention creates mention entry for agent', async () => {
    const res = await ctx.inject('POST', `/api/v1/channels/${ctx.channel.id}/messages`, ctx.admin.token, {
      content: `hey <@${ctx.agent.id}> check this`,
      mentions: [ctx.agent.id],
    });
    expect(res.statusCode).toBe(201);
    const msgId = res.json().message.id;
    const mention = ctx.db.prepare('SELECT * FROM mentions WHERE message_id = ? AND user_id = ?').get(msgId, ctx.agent.id);
    expect(mention).toBeDefined();
  });

  it('mention event is written to events table only for mentioned messages', async () => {
    const beforeCursor = (ctx.db.prepare('SELECT MAX(cursor) as c FROM events').get() as any)?.c ?? 0;

    await ctx.inject('POST', `/api/v1/channels/${ctx.channel.id}/messages`, ctx.admin.token, {
      content: 'no mention here',
    });

    const noMentionEvents = ctx.db.prepare(
      "SELECT * FROM events WHERE cursor > ? AND kind = 'mention' AND json_extract(payload, '$.mentioned_user_id') = ?",
    ).all(beforeCursor, ctx.agent.id);
    expect(noMentionEvents).toHaveLength(0);

    await ctx.inject('POST', `/api/v1/channels/${ctx.channel.id}/messages`, ctx.admin.token, {
      content: `ping <@${ctx.agent.id}>`,
      mentions: [ctx.agent.id],
    });

    const mentionEvents = ctx.db.prepare(
      "SELECT * FROM events WHERE cursor > ? AND kind = 'mention' AND json_extract(payload, '$.mentioned_user_id') = ?",
    ).all(beforeCursor, ctx.agent.id);
    expect(mentionEvents).toHaveLength(1);
  });
});
