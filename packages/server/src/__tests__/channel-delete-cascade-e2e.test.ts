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

describe('Scenario 13: Channel delete cascade (e2e)', () => {
  let app: FastifyInstance;
  let port: number;
  let adminId: string, adminToken: string;
  let memberAId: string, memberAToken: string;
  let memberBId: string, memberBToken: string;
  let channelId: string;
  const wsConnections: import('ws').WebSocket[] = [];

  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    port = (app.server.address() as any).port;

    adminId = seedAdmin(testDb, 'CascAdmin');
    memberAId = seedMember(testDb, 'CascA');
    memberBId = seedMember(testDb, 'CascB');
    grantPermission(testDb, adminId, 'channel.delete');
    grantPermission(testDb, adminId, 'message.send');
    grantPermission(testDb, memberAId, 'message.send');
    adminToken = authCookie(adminId);
    memberAToken = authCookie(memberAId);
    memberBToken = authCookie(memberBId);

    channelId = seedChannel(testDb, adminId, 'casc-del-ch');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, memberAId);
    addChannelMember(testDb, channelId, memberBId);

    seedMessage(testDb, channelId, adminId, 'msg-before-delete');
  });

  afterAll(async () => {
    for (const ws of wsConnections) await closeWsAndWait(ws);
    await app.close();
    testDb.close();
  });

  it('delete channel → all members WS receive channel_deleted', async () => {
    const wsA = await connectAuthWS(port, memberAToken);
    const wsB = await connectAuthWS(port, memberBToken);
    await subscribeToChannel(wsA, channelId);
    await subscribeToChannel(wsB, channelId);
    wsConnections.push(wsA, wsB);

    const [evA, evB] = await Promise.all([
      waitForMessage(wsA, (m) => m.type === 'channel_deleted'),
      waitForMessage(wsB, (m) => m.type === 'channel_deleted'),
      httpJson(port, 'DELETE', `/api/v1/channels/${channelId}`, adminToken),
    ]);
    expect(evA.channel_id).toBe(channelId);
    expect(evB.channel_id).toBe(channelId);
  });

  it('after delete → members API returns 404', async () => {
    const { status } = await httpJson(port, 'GET', `/api/v1/channels/${channelId}/members`, adminToken);
    expect(status).toBe(404);
  });

  it('after delete → messages API returns 404', async () => {
    const { status } = await httpJson(port, 'GET', `/api/v1/channels/${channelId}/messages`, adminToken);
    expect(status).toBe(404);
  });
});
