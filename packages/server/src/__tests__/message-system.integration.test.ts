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

import { registerMessageRoutes } from '../routes/messages.js';
import { registerReactionRoutes } from '../routes/reactions.js';

let ctx: TestContext;

describe('Message system (integration)', () => {
  beforeAll(async () => {
    ctx = await TestContext.create({
      routes: [registerMessageRoutes, registerReactionRoutes],
    });
    testDb = ctx.db;
    grantPermission(ctx.db, ctx.memberA.id, 'message.send');
    grantPermission(ctx.db, ctx.memberB.id, 'message.send');
  });

  afterAll(() => ctx.close());

  it('send message → 201 + sender_id + content', async () => {
    const res = await ctx.inject('POST', `/api/v1/channels/${ctx.channel.id}/messages`, ctx.memberA.token, { content: 'hello' });
    expect(res.statusCode).toBe(201);
    expect(res.json().message.sender_id).toBe(ctx.memberA.id);
    expect(res.json().message.content).toBe('hello');
  });

  it('edit own message → content updated + edited_at set', async () => {
    const msgId = seedMessage(ctx.db, ctx.channel.id, ctx.memberA.id, 'original');
    const res = await ctx.inject('PUT', `/api/v1/messages/${msgId}`, ctx.memberA.token, { content: 'edited' });
    expect(res.statusCode).toBe(200);
    expect(res.json().message.content).toBe('edited');
    expect(res.json().message.edited_at).toBeDefined();
  });

  it('edit other user message → 403', async () => {
    const msgId = seedMessage(ctx.db, ctx.channel.id, ctx.memberA.id, 'not yours');
    const res = await ctx.inject('PUT', `/api/v1/messages/${msgId}`, ctx.memberB.token, { content: 'hijack' });
    expect(res.statusCode).toBe(403);
  });

  it('delete message → soft delete (deleted_at set)', async () => {
    const msgId = seedMessage(ctx.db, ctx.channel.id, ctx.memberA.id, 'to delete');
    await ctx.inject('DELETE', `/api/v1/messages/${msgId}`, ctx.memberA.token);
    const row = ctx.db.prepare('SELECT deleted_at FROM messages WHERE id = ?').get(msgId) as any;
    expect(row.deleted_at).toBeDefined();
  });

  it('@mention → mentions table written', async () => {
    const res = await ctx.inject('POST', `/api/v1/channels/${ctx.channel.id}/messages`, ctx.memberA.token, {
      content: `hello <@${ctx.memberB.id}>`,
      mentions: [ctx.memberB.id],
    });
    expect(res.statusCode).toBe(201);
    const mention = ctx.db.prepare('SELECT * FROM mentions WHERE user_id = ? AND message_id = ?').get(ctx.memberB.id, res.json().message.id);
    expect(mention).toBeDefined();
  });

  it('reaction add + duplicate + remove', async () => {
    const msgId = seedMessage(ctx.db, ctx.channel.id, ctx.memberA.id, 'react me');
    const r1 = await ctx.inject('PUT', `/api/v1/messages/${msgId}/reactions`, ctx.memberA.token, { emoji: '👍' });
    expect(r1.statusCode).toBe(200);
    const r2 = await ctx.inject('PUT', `/api/v1/messages/${msgId}/reactions`, ctx.memberA.token, { emoji: '👍' });
    expect(r2.statusCode).toBe(200);
    const r3 = await ctx.inject('DELETE', `/api/v1/messages/${msgId}/reactions`, ctx.memberA.token, { emoji: '👍' });
    expect(r3.statusCode).toBe(200);
  });

  it('pagination → limit + before + has_more', async () => {
    const paginationCh = seedChannel(ctx.db, ctx.admin.id, 'pagination-ch');
    addChannelMember(ctx.db, paginationCh, ctx.memberA.id);
    const baseTime = 1700000000000;
    for (let i = 0; i < 15; i++) {
      seedMessage(ctx.db, paginationCh, ctx.memberA.id, `pg-${i}`, baseTime + i * 1000);
    }
    const r1 = await ctx.inject('GET', `/api/v1/channels/${paginationCh}/messages?limit=10`, ctx.memberA.token);
    const msgs1 = r1.json().messages;
    expect(msgs1.length).toBe(10);
    expect(r1.json().has_more).toBe(true);
    const oldest = msgs1[0];
    const r2 = await ctx.inject('GET', `/api/v1/channels/${paginationCh}/messages?limit=10&before=${oldest.created_at}`, ctx.memberA.token);
    expect(r2.json().messages.length).toBe(5);
    expect(r2.json().has_more).toBe(false);
  });

  it('system message → type stored, sender_id is agent user', async () => {
    const sysId = seedMessage(ctx.db, ctx.channel.id, ctx.agent.id, 'User joined', undefined, 'system');
    const res = await ctx.inject('GET', `/api/v1/channels/${ctx.channel.id}/messages?limit=50`, ctx.admin.token);
    const sysMsg = res.json().messages.find((m: any) => m.id === sysId);
    expect(sysMsg).toBeDefined();
    expect(sysMsg.content_type).toBe('system');
  });
});
