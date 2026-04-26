import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedChannel,
  addChannelMember, authCookie, grantPermission, httpJson,
} from './setup.js';
import { connectAuthWS, subscribeToChannel, waitForMessage, collectMessages, closeWsAndWait } from './ws-helpers.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

import { buildFullApp } from './setup.js';
import type { FastifyInstance } from 'fastify';

describe('Scenario 11: Multi-device same user (e2e)', () => {
  let app: FastifyInstance;
  let port: number;
  let adminId: string, adminToken: string;
  let memberAId: string, memberAToken: string;
  let channelId: string;
  let channel2Id: string;
  const wsConnections: import('ws').WebSocket[] = [];

  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    port = (app.server.address() as any).port;

    adminId = seedAdmin(testDb, 'MultiAdmin');
    memberAId = seedMember(testDb, 'MultiMemberA');
    grantPermission(testDb, adminId, 'message.send');
    grantPermission(testDb, memberAId, 'message.send');
    adminToken = authCookie(adminId);
    memberAToken = authCookie(memberAId);
    channelId = seedChannel(testDb, adminId, 'multi-ch1');
    channel2Id = seedChannel(testDb, adminId, 'multi-ch2');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, memberAId);
    addChannelMember(testDb, channel2Id, adminId);
    addChannelMember(testDb, channel2Id, memberAId);
  });

  afterAll(async () => {
    for (const ws of wsConnections) await closeWsAndWait(ws);
    await app.close();
    testDb.close();
  });

  it('two WS connections both receive new_message', async () => {
    const ws1 = await connectAuthWS(port, memberAToken);
    const ws2 = await connectAuthWS(port, memberAToken);
    await subscribeToChannel(ws1, channelId);
    await subscribeToChannel(ws2, channelId);
    wsConnections.push(ws1, ws2);

    const [ev1, ev2] = await Promise.all([
      waitForMessage(ws1, (m) => m.type === 'new_message' && m.message?.content === 'multi-device'),
      waitForMessage(ws2, (m) => m.type === 'new_message' && m.message?.content === 'multi-device'),
      httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, adminToken, { content: 'multi-device' }),
    ]);
    expect(ev1.message.id).toBe(ev2.message.id);
  });

  it('disconnect one connection → other still works', async () => {
    const ws1 = await connectAuthWS(port, memberAToken);
    const ws2 = await connectAuthWS(port, memberAToken);
    await subscribeToChannel(ws1, channelId);
    await subscribeToChannel(ws2, channelId);
    wsConnections.push(ws1, ws2);

    await closeWsAndWait(ws1);

    const msgPromise = waitForMessage(ws2, (m) => m.type === 'new_message' && m.message?.content === 'after-disconnect');
    await httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, adminToken, { content: 'after-disconnect' });
    const event = await msgPromise;
    expect(event).toBeDefined();
  });

  it('two connections subscribe to different channels → no cross-leak', async () => {
    const ws1 = await connectAuthWS(port, memberAToken);
    const ws2 = await connectAuthWS(port, memberAToken);
    await subscribeToChannel(ws1, channelId);
    await subscribeToChannel(ws2, channel2Id);
    wsConnections.push(ws1, ws2);

    await httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, adminToken, { content: 'ch1-only' });
    await httpJson(port, 'POST', `/api/v1/channels/${channel2Id}/messages`, adminToken, { content: 'ch2-only' });

    const ws1Msgs = await collectMessages(ws1, 1000);
    const ws2Msgs = await collectMessages(ws2, 1000);

    expect(ws1Msgs.some(m => m.type === 'new_message' && m.message?.content === 'ch2-only')).toBe(false);
    expect(ws2Msgs.some(m => m.type === 'new_message' && m.message?.content === 'ch1-only')).toBe(false);
  });
});
