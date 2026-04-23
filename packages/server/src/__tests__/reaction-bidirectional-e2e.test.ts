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

describe('Scenario 20: Reaction bidirectional + WS (e2e)', () => {
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

    adminId = seedAdmin(testDb, 'ReactAdmin');
    memberAId = seedMember(testDb, 'ReactA');
    memberBId = seedMember(testDb, 'ReactB');
    grantPermission(testDb, memberAId, 'message.send');
    grantPermission(testDb, memberBId, 'message.send');
    adminToken = authCookie(adminId);
    memberAToken = authCookie(memberAId);
    memberBToken = authCookie(memberBId);

    channelId = seedChannel(testDb, adminId, 'react-bi-ch');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, memberAId);
    addChannelMember(testDb, channelId, memberBId);
  });

  afterAll(async () => {
    for (const ws of wsConnections) await closeWsAndWait(ws);
    await app.close();
    testDb.close();
  });

  it('A adds reaction → B WS receives reaction_update', async () => {
    const msgId = seedMessage(testDb, channelId, adminId, 'react-target-1');
    const wsB = await connectAuthWS(port, memberBToken);
    await subscribeToChannel(wsB, channelId);
    wsConnections.push(wsB);

    const eventPromise = waitForMessage(wsB, (m) => m.type === 'reaction_update' && m.message_id === msgId);
    await httpJson(port, 'PUT', `/api/v1/messages/${msgId}/reactions`, memberAToken, { emoji: '👍' });
    const event = await eventPromise;
    expect(event.reactions).toBeDefined();
    expect(event.reactions.some((r: any) => r.emoji === '👍')).toBe(true);
  });

  it('A removes reaction → B WS receives reaction_update with empty reactions', async () => {
    const msgId = seedMessage(testDb, channelId, adminId, 'react-target-2');

    // Add first
    await httpJson(port, 'PUT', `/api/v1/messages/${msgId}/reactions`, memberAToken, { emoji: '👍' });

    const wsB = await connectAuthWS(port, memberBToken);
    await subscribeToChannel(wsB, channelId);
    wsConnections.push(wsB);

    const eventPromise = waitForMessage(wsB, (m) => m.type === 'reaction_update' && m.message_id === msgId);
    await httpJson(port, 'DELETE', `/api/v1/messages/${msgId}/reactions`, memberAToken, { emoji: '👍' });
    const event = await eventPromise;
    expect(event.reactions).toBeDefined();
    expect(event.reactions.some((r: any) => r.emoji === '👍')).toBe(false);
  });

  it('multiple users add different reactions → independent WS events', async () => {
    const msgId = seedMessage(testDb, channelId, adminId, 'react-target-3');
    const wsAdmin = await connectAuthWS(port, adminToken);
    await subscribeToChannel(wsAdmin, channelId);
    wsConnections.push(wsAdmin);

    const collected: any[] = [];
    const handler = (raw: Buffer | string) => {
      collected.push(JSON.parse(raw.toString()));
    };
    wsAdmin.on('message', handler);

    await httpJson(port, 'PUT', `/api/v1/messages/${msgId}/reactions`, memberAToken, { emoji: '🔥' });
    await httpJson(port, 'PUT', `/api/v1/messages/${msgId}/reactions`, memberBToken, { emoji: '❤️' });

    const { sleep } = await import('./ws-helpers.js');
    await sleep(2000);
    wsAdmin.removeListener('message', handler);

    const updates = collected.filter(m => m.type === 'reaction_update' && m.message_id === msgId);
    expect(updates.length).toBeGreaterThanOrEqual(2);
    const lastUpdate = updates[updates.length - 1];
    expect(lastUpdate.reactions.some((r: any) => r.emoji === '🔥')).toBe(true);
    expect(lastUpdate.reactions.some((r: any) => r.emoji === '❤️')).toBe(true);
  });

  it('GET message reactions returns current state', async () => {
    const msgId = seedMessage(testDb, channelId, adminId, 'react-target-4');
    await httpJson(port, 'PUT', `/api/v1/messages/${msgId}/reactions`, memberAToken, { emoji: '🎉' });

    const { json, status } = await httpJson(port, 'GET', `/api/v1/messages/${msgId}/reactions`, adminToken);
    expect(status).toBe(200);
    const reactions = json.reactions || json;
    expect(Array.isArray(reactions)).toBe(true);
    expect(reactions.some((r: any) => r.emoji === '🎉')).toBe(true);
  });
});
