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
import { registerWebSocket } from '../ws.js';
import { WebSocket } from 'ws';

let app: FastifyInstance;
let port: number;
let adminId: string;
let agentId: string;
let agentApiKey: string;

function connectWsWithHeaders(path: string, headers?: Record<string, string>): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers });
    const timeout = setTimeout(() => { ws.terminate(); reject(new Error('timeout')); }, 3000);
    ws.on('open', () => { clearTimeout(timeout); resolve(ws); });
    ws.on('error', (err) => { clearTimeout(timeout); reject(err); });
  });
}

function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('close timeout')), 3000);
    ws.on('close', (code, reason) => { clearTimeout(timeout); resolve({ code, reason: reason.toString() }); });
  });
}

describe('BUG-007: ws token from Authorization header', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    app = Fastify({ logger: false });
    await app.register(fastifyWebsocket);
    registerWebSocket(app);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (typeof addr === 'string' || !addr) throw new Error('unexpected address');
    port = addr.port;
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

  it('authenticates via Authorization header', async () => {
    const ws = await connectWsWithHeaders('/ws', { Authorization: `Bearer ${agentApiKey}` });
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('authenticates via query string token (backward compat)', async () => {
    const ws = await connectWsWithHeaders(`/ws?token=${encodeURIComponent(agentApiKey)}`);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('rejects with no credentials', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const { code } = await waitForClose(ws);
    expect(code).toBe(4001);
  });

  it('rejects with invalid Authorization header', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { Authorization: 'Bearer invalid-key' },
    });
    const { code } = await waitForClose(ws);
    expect(code).toBe(4001);
  });

  it('prefers Authorization header over query string', async () => {
    const ws = await connectWsWithHeaders(`/ws?token=bad-key`, { Authorization: `Bearer ${agentApiKey}` });
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });
});
