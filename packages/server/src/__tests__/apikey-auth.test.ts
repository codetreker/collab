import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedAdmin, seedAgent, seedChannel, addChannelMember } from './setup.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { registerWsPluginRoutes } from '../routes/ws-plugin.js';
import { registerPollRoutes } from '../routes/poll.js';
import { WebSocket } from 'ws';

let app: FastifyInstance;
let baseUrl: string;
let adminId: string;
let agentId: string;
let agentApiKey: string;

function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WS close timeout')), 3000);
    ws.on('close', (code, reason) => {
      clearTimeout(timeout);
      resolve({ code, reason: reason.toString() });
    });
  });
}

function connectWsWithHeaders(headers?: Record<string, string>): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws/plugin`, { headers });
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    const timeout = setTimeout(() => reject(new Error('WS connect timeout')), 3000);
    ws.on('open', () => clearTimeout(timeout));
  });
}

describe('BUG-006: apiKey from Authorization header', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    app = Fastify({ logger: false });
    await app.register(fastifyWebsocket);
    registerWsPluginRoutes(app);
    registerPollRoutes(app);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (typeof addr === 'string' || !addr) throw new Error('unexpected address');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM channel_members');
    testDb.exec('DELETE FROM channels');
    testDb.exec('DELETE FROM users');
    adminId = seedAdmin(testDb, 'Admin');
    agentId = seedAgent(testDb, adminId, 'TestBot');
    const row = testDb.prepare('SELECT api_key FROM users WHERE id = ?').get(agentId) as { api_key: string };
    agentApiKey = row.api_key;
  });

  describe('WS /ws/plugin', () => {
    it('authenticates via Authorization header', async () => {
      const ws = await connectWsWithHeaders({ Authorization: `Bearer ${agentApiKey}` });
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });

    it('authenticates via query string (backward compat)', async () => {
      const ws = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws/plugin?apiKey=${agentApiKey}`);
      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => resolve());
        ws.on('error', reject);
        setTimeout(() => reject(new Error('timeout')), 3000);
      });
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });

    it('rejects connection with no apiKey', async () => {
      const ws = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws/plugin`);
      const { code, reason } = await waitForClose(ws);
      expect(code).toBe(4001);
      expect(reason).toContain('Missing');
    });

    it('rejects connection with invalid Authorization header', async () => {
      const ws = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws/plugin`, {
        headers: { Authorization: 'Bearer invalid-key' },
      });
      const { code, reason } = await waitForClose(ws);
      expect(code).toBe(4001);
      expect(reason).toContain('Invalid');
    });

    it('prefers Authorization header over query string', async () => {
      const ws = new WebSocket(
        `${baseUrl.replace('http', 'ws')}/ws/plugin?apiKey=bad-key`,
        { headers: { Authorization: `Bearer ${agentApiKey}` } },
      );
      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => resolve());
        ws.on('error', reject);
        setTimeout(() => reject(new Error('timeout')), 3000);
      });
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });
  });

  describe('POST /api/v1/poll', () => {
    it('authenticates via Authorization header', async () => {
      const channelId = seedChannel(testDb, adminId);
      addChannelMember(testDb, channelId, agentId);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/poll',
        headers: { authorization: `Bearer ${agentApiKey}`, 'content-type': 'application/json' },
        payload: JSON.stringify({ cursor: 0, timeout_ms: 1000 }),
      });
      expect(res.statusCode).toBe(200);
    });

    it('authenticates via body api_key (backward compat)', async () => {
      const channelId = seedChannel(testDb, adminId);
      addChannelMember(testDb, channelId, agentId);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/poll',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ api_key: agentApiKey, cursor: 0, timeout_ms: 1000 }),
      });
      expect(res.statusCode).toBe(200);
    });

    it('rejects with no apiKey', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/poll',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ cursor: 0, timeout_ms: 1000 }),
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects with invalid Authorization header', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/poll',
        headers: { authorization: 'Bearer invalid-key', 'content-type': 'application/json' },
        payload: JSON.stringify({ cursor: 0, timeout_ms: 1000 }),
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
