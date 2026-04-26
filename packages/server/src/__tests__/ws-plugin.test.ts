import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedAdmin, seedAgent } from './setup.js';
import { pluginManager } from '../plugin-manager.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { registerWsPluginRoutes } from '../routes/ws-plugin.js';
import { WebSocket } from 'ws';

let app: FastifyInstance;
let baseUrl: string;
let adminId: string;
let agentId: string;
let agentApiKey: string;

async function connectWs(query: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws/plugin?${query}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    const timeout = setTimeout(() => reject(new Error('WS connect timeout')), 3000);
    ws.on('open', () => clearTimeout(timeout));
  });
}

function waitForMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WS message timeout')), 3000);
    ws.once('message', (raw) => {
      clearTimeout(timeout);
      resolve(JSON.parse(raw.toString()));
    });
  });
}

function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WS close timeout')), 3000);
    ws.on('close', (code, reason) => {
      clearTimeout(timeout);
      resolve({ code, reason: reason.toString() });
    });
  });
}

describe('WS Plugin endpoint', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    app = Fastify({ logger: false });
    await app.register(fastifyWebsocket);
    app.get('/api/v1/test-endpoint', async () => ({ hello: 'world' }));
    registerWsPluginRoutes(app);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (typeof addr === 'string' || !addr) throw new Error('unexpected address');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM users');
    adminId = seedAdmin(testDb, 'Admin');
    agentId = seedAgent(testDb, adminId, 'TestBot');
    const row = testDb.prepare('SELECT api_key FROM users WHERE id = ?').get(agentId) as { api_key: string };
    agentApiKey = row.api_key;
  });

  describe('authentication', () => {
    it('rejects connection without apiKey', async () => {
      const ws = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws/plugin`);
      const { code, reason } = await waitForClose(ws);
      expect(code).toBe(4001);
      expect(reason).toContain('Missing');
    });

    it('rejects connection with invalid apiKey', async () => {
      const ws = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws/plugin?apiKey=bad`);
      const { code, reason } = await waitForClose(ws);
      expect(code).toBe(4001);
      expect(reason).toContain('Invalid');
    });

    it('rejects disabled user', async () => {
      testDb.prepare('UPDATE users SET disabled = 1 WHERE id = ?').run(agentId);
      const ws = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws/plugin?apiKey=${agentApiKey}`);
      const { code } = await waitForClose(ws);
      expect(code).toBe(4001);
    });

    it('accepts valid apiKey', async () => {
      const ws = await connectWs(`apiKey=${agentApiKey}`);
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });
  });

  describe('ping/pong', () => {
    it('responds with pong', async () => {
      const ws = await connectWs(`apiKey=${agentApiKey}`);
      ws.send(JSON.stringify({ type: 'ping' }));
      const msg = await waitForMessage(ws);
      expect(msg.type).toBe('pong');
      ws.close();
    });
  });

  describe('invalid JSON', () => {
    it('returns error for non-JSON', async () => {
      const ws = await connectWs(`apiKey=${agentApiKey}`);
      ws.send('not json');
      const msg = await waitForMessage(ws);
      expect(msg.type).toBe('error');
      expect(msg.error).toContain('Invalid JSON');
      ws.close();
    });
  });

  describe('unknown message type', () => {
    it('returns error', async () => {
      const ws = await connectWs(`apiKey=${agentApiKey}`);
      ws.send(JSON.stringify({ type: 'foobar' }));
      const msg = await waitForMessage(ws);
      expect(msg.type).toBe('error');
      expect(msg.error).toContain('Unknown message type');
      ws.close();
    });
  });

  describe('event push', () => {
    it('receives pushed events', async () => {
      const ws = await connectWs(`apiKey=${agentApiKey}`);
      await new Promise((r) => setTimeout(r, 50));
      pluginManager.pushEvent(agentId, 'message.new', { text: 'hello' });
      const msg = await waitForMessage(ws);
      expect(msg).toEqual({ type: 'event', event: 'message.new', data: { text: 'hello' } });
      ws.close();
    });

    it('receives broadcast events', async () => {
      const ws = await connectWs(`apiKey=${agentApiKey}`);
      await new Promise((r) => setTimeout(r, 50));
      pluginManager.broadcastEvent('system.update', { v: 2 });
      const msg = await waitForMessage(ws);
      expect(msg).toEqual({ type: 'event', event: 'system.update', data: { v: 2 } });
      ws.close();
    });
  });

  describe('request/response channel', () => {
    it('client responds to server request', async () => {
      const ws = await connectWs(`apiKey=${agentApiKey}`);
      await new Promise((r) => setTimeout(r, 50));

      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'request') {
          ws.send(JSON.stringify({ type: 'response', id: msg.id, data: { ok: true } }));
        }
      });

      const result = await pluginManager.request(agentId, { action: 'test' });
      expect(result).toEqual({ ok: true });
      ws.close();
    });
  });

  describe('disconnect cleanup', () => {
    it('unregisters agent on close', async () => {
      const ws = await connectWs(`apiKey=${agentApiKey}`);
      await new Promise((r) => setTimeout(r, 50));
      expect(pluginManager.getConnection(agentId)).toBeDefined();
      ws.close();
      await new Promise((r) => setTimeout(r, 100));
      expect(pluginManager.getConnection(agentId)).toBeUndefined();
    });
  });

  describe('api_request', () => {
    it('proxies API request through inject and returns response', async () => {
      const ws = await connectWs(`apiKey=${agentApiKey}`);
      ws.send(JSON.stringify({
        type: 'api_request',
        id: 'req-1',
        data: { method: 'GET', path: '/api/v1/test-endpoint' },
      }));
      const msg = await waitForMessage(ws);
      expect(msg.type).toBe('api_response');
      expect(msg.id).toBe('req-1');
      expect((msg.data as Record<string, unknown>).status).toBe(200);
      ws.close();
    });

    it('returns 400 when method/path missing', async () => {
      const ws = await connectWs(`apiKey=${agentApiKey}`);
      ws.send(JSON.stringify({ type: 'api_request', id: 'req-2', data: {} }));
      const msg = await waitForMessage(ws);
      expect(msg.type).toBe('api_response');
      expect((msg.data as Record<string, unknown>).status).toBe(400);
      ws.close();
    });
  });
});
