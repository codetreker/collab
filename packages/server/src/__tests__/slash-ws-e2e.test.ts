import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedChannel,
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

describe('Scenario 9: Topic update + WS broadcast (e2e)', () => {
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

    adminId = seedAdmin(testDb, 'SlashAdmin');
    memberAId = seedMember(testDb, 'SlashMemberA');
    grantPermission(testDb, adminId, 'channel.manage_members');
    adminToken = authCookie(adminId);
    memberAToken = authCookie(memberAId);
    channelId = seedChannel(testDb, adminId, 'slash-ch');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, memberAId);
  });

  afterAll(async () => {
    for (const ws of wsConnections) await closeWsAndWait(ws);
    await app.close();
    testDb.close();
  });

  it('set topic → all members WS receive channel_updated', async () => {
    const ws = await connectAuthWS(port, memberAToken);
    await subscribeToChannel(ws, channelId);
    wsConnections.push(ws);

    const eventPromise = waitForMessage(ws, (m) => m.type === 'channel_updated');
    await httpJson(port, 'PUT', `/api/v1/channels/${channelId}/topic`, adminToken, { topic: 'New Topic' });
    const event = await eventPromise;
    expect(event.topic).toBe('New Topic');
    expect(event.channel_id).toBe(channelId);
  });

  it('invite member → new member can subscribe and receive WS events', async () => {
    const newMemberId = seedMember(testDb, 'SlashNewGuy');
    grantPermission(testDb, newMemberId, 'message.send');
    const newMemberToken = authCookie(newMemberId);

    const { status } = await httpJson(port, 'POST', `/api/v1/channels/${channelId}/members`, adminToken, { user_id: newMemberId });
    expect(status).toBe(201);

    const ws = await connectAuthWS(port, newMemberToken);
    await subscribeToChannel(ws, channelId);
    wsConnections.push(ws);

    const msgPromise = waitForMessage(ws, (m) => m.type === 'new_message' && m.message?.content === 'welcome new guy');
    await httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, adminToken, { content: 'welcome new guy' });
    const event = await msgPromise;
    expect(event.message.content).toBe('welcome new guy');
  });
});
