import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedAgent, seedChannel,
  addChannelMember, authCookie, grantPermission, httpJson,
} from './setup.js';
import { connectAuthWS, subscribeToChannel, waitForMessage, collectSSEEvents, closeWsAndWait, sleep } from './ws-helpers.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

import { buildFullApp } from './setup.js';
import type { FastifyInstance } from 'fastify';

async function pollJson(port: number, apiKey: string, body: Record<string, unknown>): Promise<{ status: number; json: any }> {
  const res = await fetch(`http://127.0.0.1:${port}/api/v1/poll`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: res.status, json };
}

describe('Scenario 4: WS/SSE/Poll three-channel consistency (e2e)', () => {
  let app: FastifyInstance;
  let port: number;
  let adminId: string, adminToken: string;
  let memberAId: string, memberAToken: string;
  let agentId: string, agentApiKey: string;
  let channelId: string;
  const wsConnections: import('ws').WebSocket[] = [];

  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    port = (app.server.address() as any).port;

    adminId = seedAdmin(testDb, 'ConsistAdmin');
    memberAId = seedMember(testDb, 'ConsistMemberA');
    agentId = seedAgent(testDb, adminId, 'ConsistBot');
    const row = testDb.prepare('SELECT api_key FROM users WHERE id = ?').get(agentId) as { api_key: string };
    agentApiKey = row.api_key;

    grantPermission(testDb, memberAId, 'message.send');

    adminToken = authCookie(adminId);
    memberAToken = authCookie(memberAId);

    channelId = seedChannel(testDb, adminId, 'consist-ch');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, memberAId);
    addChannelMember(testDb, channelId, agentId);
  });

  afterAll(async () => {
    for (const ws of wsConnections) await closeWsAndWait(ws);
    await app.close();
    testDb.close();
  });

  it('Same message arrives on WS, SSE, and Poll with consistent core fields', async () => {
    // 1. Set up WS client (admin)
    const adminWs = await connectAuthWS(port, adminToken);
    await subscribeToChannel(adminWs, channelId);
    wsConnections.push(adminWs);

    // 2. Get current event cursor
    const baselineRes = await pollJson(port, agentApiKey, {
      cursor: 0,
      timeout_ms: 1000,
      channel_ids: [channelId],
    });
    expect(baselineRes.status).toBe(200);
    const allEvents = baselineRes.json?.events ?? [];
    const baseCursor = allEvents.length > 0
      ? allEvents[allEvents.length - 1].cursor
      : (baselineRes.json?.cursor ?? 0);

    // 3. Set up SSE client (agent via api_key)
    const ssePromise = collectSSEEvents(port, agentApiKey, {
      timeoutMs: 5000,
      filter: (ev) => ev.event === 'message' && ev.parsed?.content === 'tri-channel test',
      count: 1,
    });
    await sleep(300);

    // 4. Start long-poll BEFORE sending message so it's waiting
    const pollPromise = pollJson(port, agentApiKey, {
      cursor: baseCursor,
      timeout_ms: 5000,
      channel_ids: [channelId],
    });

    // 5. WS promise
    const wsPromise = waitForMessage(adminWs, (m) => m.type === 'new_message' && m.message?.content === 'tri-channel test');

    // Small delay to ensure poll is registered as waiter
    await sleep(100);

    // 6. Send the message
    const { json: sendJson, status } = await httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, memberAToken, { content: 'tri-channel test' });
    expect(status).toBe(201);
    const sentMessageId = sendJson.message.id;

    // 7. Collect from all three channels
    const [wsEvent, sseEvents, pollResult] = await Promise.all([wsPromise, ssePromise, pollPromise]);

    // 8. Assert WS
    expect(wsEvent.message.id).toBe(sentMessageId);
    expect(wsEvent.message.content).toBe('tri-channel test');
    expect(wsEvent.message.sender_id).toBe(memberAId);

    // 9. Assert SSE
    expect(sseEvents.length).toBeGreaterThanOrEqual(1);
    const sseData = sseEvents[0]!.parsed;
    expect(sseData.id).toBe(sentMessageId);
    expect(sseData.content).toBe('tri-channel test');
    expect(sseData.sender_id).toBe(memberAId);

    // 10. Assert Poll
    expect(pollResult.status).toBe(200);
    const pollEvents = pollResult.json?.events ?? [];
    const msgEvent = pollEvents.find((e: any) => {
      const p = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload;
      return p.id === sentMessageId;
    });
    expect(msgEvent).toBeDefined();
    const pollPayload = typeof msgEvent.payload === 'string' ? JSON.parse(msgEvent.payload) : msgEvent.payload;
    expect(pollPayload.content).toBe('tri-channel test');
    expect(pollPayload.sender_id).toBe(memberAId);

    // 11. Core fields match across all three
    expect(wsEvent.message.id).toBe(sseData.id);
    expect(wsEvent.message.id).toBe(pollPayload.id);
    expect(wsEvent.message.content).toBe(sseData.content);
    expect(wsEvent.message.content).toBe(pollPayload.content);
    expect(wsEvent.message.sender_id).toBe(sseData.sender_id);
    expect(wsEvent.message.sender_id).toBe(pollPayload.sender_id);
  }, 15000);
});
