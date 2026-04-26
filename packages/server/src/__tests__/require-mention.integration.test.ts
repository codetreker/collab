import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import http from 'node:http';
import {
  createTestDb, seedAdmin, seedAgent, seedChannel,
  addChannelMember, grantPermission, authCookie, httpJson,
  buildFullApp,
} from './setup.js';
import { connectAuthWS, subscribeToChannel, collectMessages, closeWsAndWait } from './ws-helpers.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

import type { FastifyInstance } from 'fastify';

describe('requireMention – message delivery (SSE, Poll, WS)', () => {
  let app: FastifyInstance;
  let port: number;
  let adminId: string;
  let agentId: string;
  let agentApiKey: string;
  let channelId: string;
  let adminCookie: string;

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
    adminCookie = authCookie(adminId);

    const rm = testDb.prepare('SELECT require_mention FROM users WHERE id = ?').get(agentId) as any;
    expect(rm.require_mention).toBe(1);
  });

  afterAll(async () => {
    await app.close();
    testDb.close();
  });

  it('Poll delivers message events to agent despite requireMention=true and no @mention', async () => {
    const beforeCursor = (testDb.prepare('SELECT MAX(cursor) as c FROM events').get() as any)?.c ?? 0;

    const sendRes = await httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, adminCookie, { content: 'poll-delivery-no-mention' });
    expect(sendRes.status).toBe(201);

    await new Promise(r => setTimeout(r, 100));

    const pollRes = await fetch(`http://127.0.0.1:${port}/api/v1/poll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${agentApiKey}` },
      body: JSON.stringify({ api_key: agentApiKey, cursor: beforeCursor, timeout_ms: 2000 }),
    });
    expect(pollRes.status).toBe(200);
    const body = await pollRes.json() as any;
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

    await httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, adminCookie, { content: 'poll-no-mention-event' });
    await httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, adminCookie, {
      content: `poll-mention <@${agentId}>`, mentions: [agentId],
    });

    await new Promise(r => setTimeout(r, 100));

    const pollRes = await fetch(`http://127.0.0.1:${port}/api/v1/poll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${agentApiKey}` },
      body: JSON.stringify({ api_key: agentApiKey, cursor: beforeCursor, timeout_ms: 2000 }),
    });
    expect(pollRes.status).toBe(200);
    const body = await pollRes.json() as any;

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
              httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, adminCookie, {
                content: 'sse-delivery-no-mention',
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
              httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, adminCookie, {
                content: 'sse-no-mention-event',
              }).then(() =>
                httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, adminCookie, {
                  content: `sse-mention <@${agentId}>`, mentions: [agentId],
                }),
              );
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

  it('WS broadcast fires for non-mentioned messages (real broadcast to subscribed client)', async () => {
    const ws = await connectAuthWS(port, adminCookie);
    try {
      await subscribeToChannel(ws, channelId);
      const collected = collectMessages(ws, 2000);

      await httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, adminCookie, {
        content: 'broadcast test without mention',
      });

      const msgs = await collected;
      const broadcast = msgs.find((m: any) => m.type === 'new_message' && m.message?.content === 'broadcast test without mention');
      expect(broadcast).toBeDefined();
    } finally {
      await closeWsAndWait(ws);
    }
  });
});
