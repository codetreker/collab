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

describe('Scenario 10: Public channel preview + join (e2e)', () => {
  let app: FastifyInstance;
  let port: number;
  let adminId: string, adminToken: string;
  let outsiderId: string, outsiderToken: string;
  let publicChannelId: string;
  const wsConnections: import('ws').WebSocket[] = [];

  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    port = (app.server.address() as any).port;

    adminId = seedAdmin(testDb, 'PrevAdmin');
    outsiderId = seedMember(testDb, 'PrevOutsider');
    grantPermission(testDb, adminId, 'message.send');
    grantPermission(testDb, outsiderId, 'message.send');
    adminToken = authCookie(adminId);
    outsiderToken = authCookie(outsiderId);
    publicChannelId = seedChannel(testDb, adminId, 'pub-preview-ch', 'public');
    addChannelMember(testDb, publicChannelId, adminId);

    // Seed a recent message (within 24h) and an old message (>24h)
    seedMessage(testDb, publicChannelId, adminId, 'recent-msg', Date.now() - 3600_000);
    seedMessage(testDb, publicChannelId, adminId, 'old-msg', Date.now() - 25 * 3600_000);
  });

  afterAll(async () => {
    for (const ws of wsConnections) await closeWsAndWait(ws);
    await app.close();
    testDb.close();
  });

  it('non-member sees 24h preview (recent but not old messages)', async () => {
    const { json, status } = await httpJson(port, 'GET', `/api/v1/channels/${publicChannelId}/preview`, outsiderToken);
    expect(status).toBe(200);
    expect(json.messages.some((m: any) => m.content === 'recent-msg')).toBe(true);
    expect(json.messages.some((m: any) => m.content === 'old-msg')).toBe(false);
  });

  it('self-join → starts receiving WS broadcasts', async () => {
    const { status } = await httpJson(port, 'POST', `/api/v1/channels/${publicChannelId}/join`, outsiderToken);
    expect(status).toBe(200);

    const ws = await connectAuthWS(port, outsiderToken);
    await subscribeToChannel(ws, publicChannelId);
    wsConnections.push(ws);

    const msgPromise = waitForMessage(ws, (m) => m.type === 'new_message' && m.message?.content === 'post-join');
    await httpJson(port, 'POST', `/api/v1/channels/${publicChannelId}/messages`, adminToken, { content: 'post-join' });
    const event = await msgPromise;
    expect(event.message.content).toBe('post-join');
  });

  it('after join, full message history visible via pagination', async () => {
    const { json } = await httpJson(port, 'GET', `/api/v1/channels/${publicChannelId}/messages`, outsiderToken);
    expect(json.messages.length).toBeGreaterThan(0);
    // Should see the old message too now (not just 24h preview)
    expect(json.messages.some((m: any) => m.content === 'old-msg')).toBe(true);
  });
});
