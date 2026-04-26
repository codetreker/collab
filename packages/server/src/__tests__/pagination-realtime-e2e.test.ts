import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedChannel, seedMessage,
  addChannelMember, authCookie, grantPermission, httpJson,
} from './setup.js';
import { connectAuthWS, subscribeToChannel, waitForMessage, closeWsAndWait } from './ws-helpers.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

import { buildFullApp } from './setup.js';
import type { FastifyInstance } from 'fastify';

describe('Scenario 7: Pagination + realtime coexistence (e2e)', () => {
  let app: FastifyInstance;
  let port: number;
  let adminId: string, adminToken: string;
  let memberAId: string, memberAToken: string;
  let channelId: string;
  const wsConnections: import('ws').WebSocket[] = [];

  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    port = (app.server.address() as any).port;

    adminId = seedAdmin(testDb, 'PageAdmin');
    memberAId = seedMember(testDb, 'PageMemberA');
    grantPermission(testDb, adminId, 'message.send');
    grantPermission(testDb, memberAId, 'message.send');
    adminToken = authCookie(adminId);
    memberAToken = authCookie(memberAId);
    channelId = seedChannel(testDb, adminId, 'page-ch');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, memberAId);

    // Seed 150 messages with increasing timestamps
    const baseTime = Date.now() - 200_000;
    for (let i = 0; i < 150; i++) {
      seedMessage(testDb, channelId, adminId, `msg-${String(i).padStart(3, '0')}`, baseTime + i);
    }
  });

  afterAll(async () => {
    for (const ws of wsConnections) await closeWsAndWait(ws);
    await app.close();
    testDb.close();
  });

  it('150 messages → paginate 100 + 50 with has_more', async () => {
    const { json: page1 } = await httpJson(port, 'GET', `/api/v1/channels/${channelId}/messages?limit=100`, adminToken);
    expect(page1.messages.length).toBe(100);
    expect(page1.has_more).toBe(true);

    // The messages are returned in ascending order (reversed from DESC query).
    // The first message in the response is the oldest of the 100 most recent.
    // To get older messages, use `before` with the created_at of the first message.
    const oldestTimestamp = page1.messages[0].created_at;
    const { json: page2 } = await httpJson(port, 'GET', `/api/v1/channels/${channelId}/messages?limit=100&before=${oldestTimestamp}`, adminToken);
    expect(page2.messages.length).toBe(50);
    expect(page2.has_more).toBe(false);
  });

  it('new message arrives via WS during pagination', async () => {
    const ws = await connectAuthWS(port, memberAToken);
    await subscribeToChannel(ws, channelId);
    wsConnections.push(ws);

    // Start pagination
    await httpJson(port, 'GET', `/api/v1/channels/${channelId}/messages?limit=100`, memberAToken);

    // Send new message while "paginating"
    const msgPromise = waitForMessage(ws, (m) => m.type === 'new_message' && m.message?.content === 'realtime-during-pagination');
    await httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, adminToken, { content: 'realtime-during-pagination' });
    const event = await msgPromise;
    expect(event).toBeDefined();
    expect(event.message.content).toBe('realtime-during-pagination');
  });
});
