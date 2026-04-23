import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedChannel, seedMessage,
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

describe('Scenario 1: Chat lifecycle + WS broadcast (e2e)', () => {
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

    adminId = seedAdmin(testDb, 'ChatAdmin');
    memberAId = seedMember(testDb, 'ChatA');
    memberBId = seedMember(testDb, 'ChatB');
    grantPermission(testDb, memberAId, 'message.send');
    grantPermission(testDb, memberBId, 'message.send');
    adminToken = authCookie(adminId);
    memberAToken = authCookie(memberAId);
    memberBToken = authCookie(memberBId);
    channelId = seedChannel(testDb, adminId, 'chat-life-ch');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, memberAId);
    addChannelMember(testDb, channelId, memberBId);
  });

  afterAll(async () => {
    for (const ws of wsConnections) await closeWsAndWait(ws);
    await app.close();
    testDb.close();
  });

  it('Member sends message → other members WS receive new_message', async () => {
    const adminWs = await connectAuthWS(port, adminToken);
    await subscribeToChannel(adminWs, channelId);
    wsConnections.push(adminWs);

    const msgPromise = waitForMessage(adminWs, (m) => m.type === 'new_message' && m.message?.content === 'hello team');
    const { json, status } = await httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, memberAToken, { content: 'hello team' });
    expect(status).toBe(201);
    expect(json.message.content).toBe('hello team');

    const event = await msgPromise;
    expect(event.message.sender_id).toBe(memberAId);
  });

  it('Edit message → WS receives message_edited', async () => {
    const msgId = seedMessage(testDb, channelId, memberAId, 'original');
    const adminWs = await connectAuthWS(port, adminToken);
    await subscribeToChannel(adminWs, channelId);
    wsConnections.push(adminWs);

    const msgPromise = waitForMessage(adminWs, (m) => m.type === 'message_edited');
    await httpJson(port, 'PUT', `/api/v1/messages/${msgId}`, memberAToken, { content: 'edited' });
    const event = await msgPromise;
    expect(event.message.content).toBe('edited');
  });

  it('Delete message → WS receives message_deleted', async () => {
    const msgId = seedMessage(testDb, channelId, memberAId, 'to-delete');
    const adminWs = await connectAuthWS(port, adminToken);
    await subscribeToChannel(adminWs, channelId);
    wsConnections.push(adminWs);

    const msgPromise = waitForMessage(adminWs, (m) => m.type === 'message_deleted');
    await httpJson(port, 'DELETE', `/api/v1/messages/${msgId}`, memberAToken);
    const event = await msgPromise;
    expect(event.message_id).toBe(msgId);
  });

  it('Reaction → WS receives reaction_update', async () => {
    const msgId = seedMessage(testDb, channelId, memberAId, 'react-me');
    const memberBWs = await connectAuthWS(port, memberBToken);
    await subscribeToChannel(memberBWs, channelId);
    wsConnections.push(memberBWs);

    const msgPromise = waitForMessage(memberBWs, (m) => m.type === 'reaction_update' && m.message_id === msgId);
    await httpJson(port, 'PUT', `/api/v1/messages/${msgId}/reactions`, memberAToken, { emoji: '🔥' });
    const event = await msgPromise;
    expect(event.reactions).toBeDefined();
  });

  it('Non-member does not receive channel broadcasts', async () => {
    const outsiderId = seedMember(testDb, 'Outsider');
    const outsiderWs = await connectAuthWS(port, authCookie(outsiderId));
    wsConnections.push(outsiderWs);

    await httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, memberAToken, { content: 'members only' });
    const msgs = await collectMessages(outsiderWs, 800);
    expect(msgs.filter(m => m.type === 'new_message' && m.message?.content === 'members only')).toHaveLength(0);
  });
});
