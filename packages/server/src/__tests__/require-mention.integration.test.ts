import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import http from 'node:http';
import {
  createTestDb, seedAdmin, seedAgent, seedChannel, seedMessage,
  addChannelMember, grantPermission, authCookie, TestContext,
  buildFullApp,
} from './setup.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

const wsMock = vi.hoisted(() => ({
  broadcastToChannel: vi.fn(),
  broadcastToUser: vi.fn(),
  getOnlineUserIds: vi.fn(() => []),
  unsubscribeUserFromChannel: vi.fn(),
}));

vi.mock('../ws.js', () => wsMock);

import { registerAdminRoutes } from '../routes/admin.js';
import { registerMessageRoutes } from '../routes/messages.js';
import type { FastifyInstance } from 'fastify';

let ctx: TestContext;

describe('requireMention flag (integration)', () => {
  beforeAll(async () => {
    ctx = await TestContext.create({
      routes: [registerAdminRoutes, registerMessageRoutes],
    });
    testDb = ctx.db;
    grantPermission(ctx.db, ctx.admin.id, 'message.send');
    addChannelMember(ctx.db, ctx.channel.id, ctx.agent.id);
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

  it('WS broadcast fires for non-mentioned messages regardless of requireMention', async () => {
    wsMock.broadcastToChannel.mockClear();
    const res = await ctx.inject('POST', `/api/v1/channels/${ctx.channel.id}/messages`, ctx.admin.token, {
      content: 'broadcast test without mention',
    });
    expect(res.statusCode).toBe(201);
    expect(wsMock.broadcastToChannel).toHaveBeenCalledWith(
      ctx.channel.id,
      expect.objectContaining({ type: 'new_message' }),
    );
  });
});

describe('requireMention – message delivery via SSE and Poll', () => {
  let app: FastifyInstance;
  let port: number;
  let adminId: string;
  let agentId: string;
  let agentApiKey: string;
  let channelId: string;
  let adminToken: string;

  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (typeof addr === 'string' || !addr) throw new Error('unexpected address');
    port = addr.port;

    adminId = seedAdmin(testDb, 'MentionDeliveryAdmin');
    agentId = seedAgent(testDb, adminId, 'MentionDeliveryBot');
    const row = testDb.prepare('SELECT api_key FROM users WHERE id = ?').get(agentId) as { api_key: string };
    agentApiKey = row.api_key;
    grantPermission(testDb, adminId, 'message.send');
    channelId = seedChannel(testDb, adminId, 'mention-delivery-ch');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, agentId);
    adminToken = authCookie(adminId);

    const rm = testDb.prepare('SELECT require_mention FROM users WHERE id = ?').get(agentId) as any;
    expect(rm.require_mention).toBe(1);
  });

  afterAll(async () => {
    await app.close();
    testDb.close();
  });

  it('Poll delivers message events to agent despite requireMention=true and no @mention', async () => {
    const beforeCursor = (testDb.prepare('SELECT MAX(cursor) as c FROM events').get() as any)?.c ?? 0;

    const sendRes = await app.inject({
      method: 'POST',
      url: `/api/v1/channels/${channelId}/messages`,
      payload: { content: 'poll-delivery-no-mention' },
      headers: { cookie: adminToken },
    });
    expect(sendRes.statusCode).toBe(201);

    await new Promise(r => setTimeout(r, 100));

    const pollRes = await app.inject({
      method: 'POST',
      url: '/api/v1/poll',
      payload: { api_key: agentApiKey, cursor: beforeCursor, timeout_ms: 2000 },
      headers: { authorization: `Bearer ${agentApiKey}` },
    });
    expect(pollRes.statusCode).toBe(200);
    const body = pollRes.json();
    const msgEvents = body.events.filter((e: any) => e.kind === 'message');
    expect(msgEvents.length).toBeGreaterThanOrEqual(1);
    const found = msgEvents.some((e: any) => {
      const p = JSON.parse(e.payload);
      return p.content === 'poll-delivery-no-mention';
    });
    expect(found).toBe(true);
  });

  it('Poll delivers mention events only for @-mentioned messages', async () => {
    const beforeCursor = (testDb.prepare('SELECT MAX(cursor) as c FROM events').get() as any)?.c ?? 0;

    await app.inject({
      method: 'POST',
      url: `/api/v1/channels/${channelId}/messages`,
      payload: { content: 'poll-no-mention-event' },
      headers: { cookie: adminToken },
    });

    await app.inject({
      method: 'POST',
      url: `/api/v1/channels/${channelId}/messages`,
      payload: { content: `poll-mention <@${agentId}>`, mentions: [agentId] },
      headers: { cookie: adminToken },
    });

    await new Promise(r => setTimeout(r, 100));

    const pollRes = await app.inject({
      method: 'POST',
      url: '/api/v1/poll',
      payload: { api_key: agentApiKey, cursor: beforeCursor, timeout_ms: 2000 },
      headers: { authorization: `Bearer ${agentApiKey}` },
    });
    expect(pollRes.statusCode).toBe(200);
    const body = pollRes.json();

    const msgEvents = body.events.filter((e: any) => e.kind === 'message');
    expect(msgEvents.length).toBeGreaterThanOrEqual(2);

    const mentionEvents = body.events.filter((e: any) => e.kind === 'mention');
    expect(mentionEvents.length).toBe(1);
    const mentionPayload = JSON.parse(mentionEvents[0].payload);
    expect(mentionPayload.mentioned_user_id).toBe(agentId);
  });

  it('SSE delivers message events to agent despite requireMention=true and no @mention', async () => {
    const sseData = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        req.destroy();
        reject(new Error('SSE timeout'));
      }, 8000);

      const req = http.get(
        `http://127.0.0.1:${port}/api/v1/stream`,
        { headers: { authorization: `Bearer ${agentApiKey}` } },
        (res) => {
          expect(res.statusCode).toBe(200);
          let buf = '';
          let messageSent = false;
          res.on('data', (chunk: Buffer) => {
            buf += chunk.toString();
            if (buf.includes(':connected') && !messageSent) {
              messageSent = true;
              app.inject({
                method: 'POST',
                url: `/api/v1/channels/${channelId}/messages`,
                payload: { content: 'sse-delivery-no-mention' },
                headers: { cookie: adminToken },
              });
            }
            if (buf.includes('sse-delivery-no-mention')) {
              clearTimeout(timeout);
              res.destroy();
              resolve(buf);
            }
          });
        },
      );
      req.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    expect(sseData).toContain('sse-delivery-no-mention');
  });

  it('SSE delivers mention event only when agent is @-mentioned', async () => {
    const sseData = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        req.destroy();
        reject(new Error('SSE timeout'));
      }, 8000);

      const req = http.get(
        `http://127.0.0.1:${port}/api/v1/stream`,
        { headers: { authorization: `Bearer ${agentApiKey}` } },
        (res) => {
          expect(res.statusCode).toBe(200);
          let buf = '';
          let phase = 0;
          res.on('data', (chunk: Buffer) => {
            buf += chunk.toString();
            if (buf.includes(':connected') && phase === 0) {
              phase = 1;
              app.inject({
                method: 'POST',
                url: `/api/v1/channels/${channelId}/messages`,
                payload: { content: 'sse-no-mention-event' },
                headers: { cookie: adminToken },
              }).then(() => {
                return app.inject({
                  method: 'POST',
                  url: `/api/v1/channels/${channelId}/messages`,
                  payload: { content: `sse-mention <@${agentId}>`, mentions: [agentId] },
                  headers: { cookie: adminToken },
                });
              });
            }
            if (buf.includes('sse-mention') && buf.includes('event: mention')) {
              clearTimeout(timeout);
              res.destroy();
              resolve(buf);
            }
          });
        },
      );
      req.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    expect(sseData).toContain('sse-no-mention-event');
    expect(sseData).toContain('sse-mention');

    const mentionLines = sseData.split('\n').filter(l => l.startsWith('event: mention'));
    expect(mentionLines.length).toBe(1);
  });
});
