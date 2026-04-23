import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedChannel,
  addChannelMember, authCookie, grantPermission, httpJson,
} from './setup.js';
import { connectAuthWS, subscribeToChannel, waitForMessage, collectMessages, closeWsAndWait, sleep } from './ws-helpers.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

import { buildFullApp } from './setup.js';
import type { FastifyInstance } from 'fastify';

describe('Scenario 3: Permission isolation + WS (e2e)', () => {
  let app: FastifyInstance;
  let port: number;
  let adminId: string, adminToken: string;
  let memberAId: string, memberAToken: string;
  let outsiderId: string, outsiderToken: string;
  let channelId: string;
  const wsConnections: import('ws').WebSocket[] = [];

  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    port = (app.server.address() as any).port;

    adminId = seedAdmin(testDb, 'PermAdmin');
    memberAId = seedMember(testDb, 'PermMemberA');
    outsiderId = seedMember(testDb, 'PermOutsider');

    grantPermission(testDb, adminId, 'channel.manage_members');
    grantPermission(testDb, memberAId, 'message.send');

    adminToken = authCookie(adminId);
    memberAToken = authCookie(memberAId);
    outsiderToken = authCookie(outsiderId);

    channelId = seedChannel(testDb, adminId, 'perm-priv-ch', 'private');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, memberAId);
  });

  afterAll(async () => {
    for (const ws of wsConnections) await closeWsAndWait(ws);
    await app.close();
    testDb.close();
  });

  it('Non-member WS subscribe gets error, no broadcasts received', async () => {
    const outsiderWs = await connectAuthWS(port, outsiderToken);
    wsConnections.push(outsiderWs);

    outsiderWs.send(JSON.stringify({ type: 'subscribe', channel_id: channelId }));
    const errMsg = await waitForMessage(outsiderWs, (m) => m.type === 'error');
    expect(errMsg.message).toMatch(/not a member/i);

    await httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, memberAToken, { content: 'secret msg' });
    const msgs = await collectMessages(outsiderWs, 500);
    expect(msgs.filter(m => m.type === 'new_message')).toHaveLength(0);
  });

  it('After invite → member WS receives broadcasts', async () => {
    const outsiderWs = await connectAuthWS(port, outsiderToken);
    wsConnections.push(outsiderWs);

    // Admin invites outsider
    const { status } = await httpJson(port, 'POST', `/api/v1/channels/${channelId}/members`, adminToken, { user_id: outsiderId });
    expect(status).toBe(201);

    // Now outsider can subscribe
    await subscribeToChannel(outsiderWs, channelId);

    const msgPromise = waitForMessage(outsiderWs, (m) => m.type === 'new_message' && m.message?.content === 'after invite');
    await httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, memberAToken, { content: 'after invite' });
    const event = await msgPromise;
    expect(event.message.sender_id).toBe(memberAId);
  });

  it('After kick → member WS no longer receives broadcasts', async () => {
    const outsiderWs = await connectAuthWS(port, outsiderToken);
    wsConnections.push(outsiderWs);
    await subscribeToChannel(outsiderWs, channelId);

    // Verify outsider currently receives messages
    const verifyPromise = waitForMessage(outsiderWs, (m) => m.type === 'new_message' && m.message?.content === 'before kick');
    await httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, memberAToken, { content: 'before kick' });
    await verifyPromise;

    // Admin kicks outsider
    await httpJson(port, 'DELETE', `/api/v1/channels/${channelId}/members/${outsiderId}`, adminToken);
    await sleep(100);

    // Messages after kick should not reach the kicked user
    await httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, memberAToken, { content: 'after kick' });
    const msgs = await collectMessages(outsiderWs, 500);
    expect(msgs.filter(m => m.type === 'new_message' && m.message?.content === 'after kick')).toHaveLength(0);
  });
});
