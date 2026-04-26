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

describe('Scenario 12: Channel type isolation (e2e)', () => {
  let app: FastifyInstance;
  let port: number;
  let adminId: string, adminToken: string;
  let memberAId: string, memberAToken: string;
  let memberBId: string, memberBToken: string;
  let publicChId: string;
  let privateChId: string;
  let dmABId: string;
  const wsConnections: import('ws').WebSocket[] = [];

  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    port = (app.server.address() as any).port;

    adminId = seedAdmin(testDb, 'IsoAdmin');
    memberAId = seedMember(testDb, 'IsoMemberA');
    memberBId = seedMember(testDb, 'IsoMemberB');
    grantPermission(testDb, adminId, 'message.send');
    grantPermission(testDb, memberAId, 'message.send');
    grantPermission(testDb, memberBId, 'message.send');
    adminToken = authCookie(adminId);
    memberAToken = authCookie(memberAId);
    memberBToken = authCookie(memberBId);

    // Public channel: all three members
    publicChId = seedChannel(testDb, adminId, 'iso-public');
    addChannelMember(testDb, publicChId, adminId);
    addChannelMember(testDb, publicChId, memberAId);
    addChannelMember(testDb, publicChId, memberBId);

    // Private channel: admin + memberA only
    privateChId = seedChannel(testDb, adminId, 'iso-private', 'private');
    addChannelMember(testDb, privateChId, adminId);
    addChannelMember(testDb, privateChId, memberAId);

    // DM: memberA <-> memberB
    const { json } = await httpJson(port, 'POST', `/api/v1/dm/${memberBId}`, memberAToken);
    dmABId = json.channel.id;
  });

  afterAll(async () => {
    for (const ws of wsConnections) await closeWsAndWait(ws);
    await app.close();
    testDb.close();
  });

  it('public channel message only goes to public channel subscribers', async () => {
    const wsA = await connectAuthWS(port, memberAToken);
    await subscribeToChannel(wsA, publicChId);
    wsConnections.push(wsA);

    const msgPromise = waitForMessage(wsA, (m) => m.type === 'new_message' && m.message?.content === 'public-msg');
    await httpJson(port, 'POST', `/api/v1/channels/${publicChId}/messages`, adminToken, { content: 'public-msg' });
    const event = await msgPromise;
    expect(event.message.channel_id).toBe(publicChId);
  });

  it('private channel message does not leak to non-member', async () => {
    const wsB = await connectAuthWS(port, memberBToken);
    wsConnections.push(wsB);

    await httpJson(port, 'POST', `/api/v1/channels/${privateChId}/messages`, adminToken, { content: 'private-secret' });
    const msgs = await collectMessages(wsB, 800);
    expect(msgs.filter(m => m.type === 'new_message' && m.message?.content === 'private-secret')).toHaveLength(0);
  });

  it('DM message only visible to the two participants', async () => {
    const wsAdmin = await connectAuthWS(port, adminToken);
    wsConnections.push(wsAdmin);
    const wsB = await connectAuthWS(port, memberBToken);
    await subscribeToChannel(wsB, dmABId);
    wsConnections.push(wsB);

    const dmPromise = waitForMessage(wsB, (m) => m.type === 'new_message' && m.message?.content === 'dm-only');
    await httpJson(port, 'POST', `/api/v1/channels/${dmABId}/messages`, memberAToken, { content: 'dm-only' });
    await dmPromise;

    const adminMsgs = await collectMessages(wsAdmin, 800);
    expect(adminMsgs.filter(m => m.type === 'new_message' && m.message?.content === 'dm-only')).toHaveLength(0);
  });

  it('three channel types simultaneously → each isolated', async () => {
    const wsA = await connectAuthWS(port, memberAToken);
    await subscribeToChannel(wsA, publicChId);
    await subscribeToChannel(wsA, privateChId);
    await subscribeToChannel(wsA, dmABId);
    wsConnections.push(wsA);

    // Start collecting before sending
    const collected: any[] = [];
    const handler = (raw: Buffer | string) => {
      collected.push(JSON.parse(raw.toString()));
    };
    wsA.on('message', handler);

    await Promise.all([
      httpJson(port, 'POST', `/api/v1/channels/${publicChId}/messages`, adminToken, { content: 'iso-pub' }),
      httpJson(port, 'POST', `/api/v1/channels/${privateChId}/messages`, adminToken, { content: 'iso-priv' }),
      httpJson(port, 'POST', `/api/v1/channels/${dmABId}/messages`, memberBToken, { content: 'iso-dm' }),
    ]);

    // Wait for messages to arrive
    const { sleep } = await import('./ws-helpers.js');
    await sleep(1500);
    wsA.removeListener('message', handler);

    const newMsgs = collected.filter(m => m.type === 'new_message');
    const channelIds = newMsgs.map(m => m.message.channel_id);
    expect(new Set(channelIds).size).toBe(3);
  });
});
