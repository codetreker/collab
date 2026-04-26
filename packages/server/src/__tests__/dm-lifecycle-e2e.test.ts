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

describe('Scenario 8: DM full lifecycle (e2e)', () => {
  let app: FastifyInstance;
  let port: number;
  let adminId: string, adminToken: string;
  let memberAId: string, memberAToken: string;
  let memberBId: string, memberBToken: string;
  let dmChannelId: string;
  const wsConnections: import('ws').WebSocket[] = [];

  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    port = (app.server.address() as any).port;

    adminId = seedAdmin(testDb, 'DmAdmin');
    memberAId = seedMember(testDb, 'DmMemberA');
    memberBId = seedMember(testDb, 'DmMemberB');
    grantPermission(testDb, memberAId, 'message.send');
    grantPermission(testDb, memberBId, 'message.send');
    adminToken = authCookie(adminId);
    memberAToken = authCookie(memberAId);
    memberBToken = authCookie(memberBId);
  });

  afterAll(async () => {
    for (const ws of wsConnections) await closeWsAndWait(ws);
    await app.close();
    testDb.close();
  });

  it('create DM → returns channel with type dm', async () => {
    const { json, status } = await httpJson(port, 'POST', `/api/v1/dm/${memberBId}`, memberAToken);
    expect(status).toBe(200);
    dmChannelId = json.channel.id;
    expect(json.channel.type).toBe('dm');
    expect(json.peer.id).toBe(memberBId);
  });

  it('DM message → recipient WS receives new_message', async () => {
    const wsB = await connectAuthWS(port, memberBToken);
    await subscribeToChannel(wsB, dmChannelId);
    wsConnections.push(wsB);

    const msgPromise = waitForMessage(wsB, (m) => m.type === 'new_message' && m.message?.content === 'private hi');
    await httpJson(port, 'POST', `/api/v1/channels/${dmChannelId}/messages`, memberAToken, { content: 'private hi' });
    const event = await msgPromise;
    expect(event.message.sender_id).toBe(memberAId);
  });

  it('third party DM list does not include this DM', async () => {
    const { json } = await httpJson(port, 'GET', '/api/v1/dm', adminToken);
    const dmIds = (json.channels ?? []).map((c: any) => c.id);
    expect(dmIds).not.toContain(dmChannelId);
  });
});
