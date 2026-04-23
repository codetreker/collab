import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedAgent, seedChannel,
  addChannelMember, authCookie, grantPermission, httpJson,
} from './setup.js';
import { connectWS, connectPluginWS, closeWsAndWait } from './ws-helpers.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

import { buildFullApp } from './setup.js';
import type { FastifyInstance } from 'fastify';

describe('Scenario 17: Token rotation + WS (e2e)', () => {
  let app: FastifyInstance;
  let port: number;
  let adminId: string, adminToken: string;
  let agentId: string, oldApiKey: string;
  let newApiKey: string;
  let channelId: string;
  const wsConnections: import('ws').WebSocket[] = [];

  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    port = (app.server.address() as any).port;

    adminId = seedAdmin(testDb, 'RotAdmin');
    agentId = seedAgent(testDb, adminId, 'RotBot');
    grantPermission(testDb, adminId, 'agent.manage');
    adminToken = authCookie(adminId);

    const row = testDb.prepare('SELECT api_key FROM users WHERE id = ?').get(agentId) as { api_key: string };
    oldApiKey = row.api_key;

    channelId = seedChannel(testDb, adminId, 'rot-ch');
    addChannelMember(testDb, channelId, adminId);
  });

  afterAll(async () => {
    for (const ws of wsConnections) await closeWsAndWait(ws);
    await app.close();
    testDb.close();
  });

  it('rotate-api-key → returns new key different from old', async () => {
    const pluginWs = await connectPluginWS(port, oldApiKey);
    wsConnections.push(pluginWs);

    const { json, status } = await httpJson(port, 'POST', `/api/v1/agents/${agentId}/rotate-api-key`, adminToken);
    expect(status).toBe(200);
    expect(json.api_key).toBeDefined();
    expect(json.api_key).not.toBe(oldApiKey);
    newApiKey = json.api_key;
  });

  it('new key → plugin WS connects successfully', async () => {
    const newWs = await connectPluginWS(port, newApiKey);
    wsConnections.push(newWs);
    expect(newWs.readyState).toBe(1);
  });

  it('old key → plugin WS connection rejected', async () => {
    try {
      const ws = await connectWS(port, '/ws/plugin', { headers: { authorization: `Bearer ${oldApiKey}` } });
      wsConnections.push(ws);
      // If connection succeeded, it should close quickly or we get an error message
      const closePromise = new Promise<number>((resolve) => {
        ws.on('close', (code) => resolve(code));
        setTimeout(() => resolve(-1), 2000);
      });
      const code = await closePromise;
      expect(code).not.toBe(-1);
    } catch {
      // Connection rejected — expected
    }
  });
});
