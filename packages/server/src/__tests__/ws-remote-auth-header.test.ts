import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedAdmin } from './setup.js';
import { v4 as uuidv4 } from 'uuid';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { registerWsRemoteRoutes } from '../routes/ws-remote.js';
import { WebSocket } from 'ws';

let app: FastifyInstance;
let port: number;
let adminId: string;
let nodeToken: string;

function seedRemoteNode(db: Database.Database, userId: string): string {
  const id = uuidv4();
  const token = `rn_${uuidv4()}`;
  db.prepare('INSERT INTO remote_nodes (id, user_id, machine_name, connection_token) VALUES (?, ?, ?, ?)').run(id, userId, 'test-machine', token);
  nodeToken = token;
  return id;
}

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

describe('BUG-008: ws-remote token from Authorization header', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    app = Fastify({ logger: false });
    await app.register(fastifyWebsocket);
    registerWsRemoteRoutes(app);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (typeof addr === 'string' || !addr) throw new Error('unexpected address');
    port = addr.port;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM remote_nodes');
    testDb.exec('DELETE FROM users');
    adminId = seedAdmin(testDb, 'Admin');
    seedRemoteNode(testDb, adminId);
  });

  it('authenticates via Authorization header', async () => {
    const ws = await connectWsWithHeaders('/ws/remote', { Authorization: `Bearer ${nodeToken}` });
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('authenticates via query string token (backward compat)', async () => {
    const ws = await connectWsWithHeaders(`/ws/remote?token=${encodeURIComponent(nodeToken)}`);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('rejects with no token', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/remote`);
    const { code } = await waitForClose(ws);
    expect(code).toBe(4001);
  });

  it('rejects with invalid Authorization header', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/remote`, {
      headers: { Authorization: 'Bearer invalid-token' },
    });
    const { code } = await waitForClose(ws);
    expect(code).toBe(4001);
  });

  it('prefers Authorization header over query string', async () => {
    const ws = await connectWsWithHeaders(`/ws/remote?token=bad-token`, { Authorization: `Bearer ${nodeToken}` });
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });
});
