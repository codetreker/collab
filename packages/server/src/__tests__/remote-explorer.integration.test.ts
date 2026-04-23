import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import {
  createTestDb, seedAdmin, seedMember, seedChannel,
  addChannelMember, authCookie,
} from './setup.js';
import { connectWS, waitForMessage, waitForClose, closeWsAndWait } from './ws-helpers.js';
import { WebSocket } from 'ws';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

import { buildFullApp } from './setup.js';
import type { FastifyInstance } from 'fastify';

function addRemoteTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS remote_nodes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      machine_name TEXT NOT NULL,
      connection_token TEXT NOT NULL UNIQUE,
      last_seen_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_remote_nodes_user ON remote_nodes(user_id);

    CREATE TABLE IF NOT EXISTS remote_bindings (
      id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL REFERENCES remote_nodes(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL REFERENCES channels(id),
      path TEXT NOT NULL,
      label TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function seedNode(db: Database.Database, userId: string, name = 'my-laptop'): { id: string; token: string } {
  const id = uuidv4();
  const token = uuidv4();
  db.prepare('INSERT INTO remote_nodes (id, user_id, machine_name, connection_token) VALUES (?, ?, ?, ?)').run(id, userId, name, token);
  return { id, token };
}

let app: FastifyInstance;
let port: number;
let userAId: string;
let userBId: string;
let channelId: string;

function httpGet(path: string, userId: string) {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    headers: { cookie: authCookie(userId) },
  });
}

function httpPost(path: string, userId: string, body?: unknown) {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: authCookie(userId) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('Remote Explorer (integration)', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    addRemoteTables(testDb);
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (typeof addr === 'string' || !addr) throw new Error('unexpected address');
    port = addr.port;

    userAId = seedAdmin(testDb, 'UserA');
    userBId = seedMember(testDb, 'UserB');
    channelId = seedChannel(testDb, userAId, 'remote-ch');
    addChannelMember(testDb, channelId, userAId);
  });

  afterAll(async () => {
    await app.close();
    testDb.close();
  });

  it('register Node → 201', async () => {
    const res = await httpPost('/api/v1/remote/nodes', userAId, { machine_name: 'test-laptop' });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.node.machine_name).toBe('test-laptop');
    expect(body.node.connection_token).toBeDefined();
  });

  it('WS connect with valid token → open', async () => {
    const node = seedNode(testDb, userAId, 'ws-laptop');
    const ws = await connectWS(port, '/ws/remote', { token: node.token });
    try {
      expect(ws.readyState).toBe(WebSocket.OPEN);
    } finally {
      await closeWsAndWait(ws);
    }
  });

  it('WS connect with invalid token → close 4001', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/remote?token=invalid`);
    const code = await waitForClose(ws);
    expect(code).toBe(4001);
  });

  it('file proxy read → returns content via WS relay', async () => {
    const node = seedNode(testDb, userAId, 'proxy-laptop');
    const agentWs = await connectWS(port, '/ws/remote', { token: node.token });
    try {
      agentWs.on('message', (raw: Buffer | string) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'request') {
          agentWs.send(JSON.stringify({
            type: 'response',
            id: msg.id,
            data: { entries: [{ name: 'file.ts', type: 'file' }] },
          }));
        }
      });

      const res = await httpGet(`/api/v1/remote/nodes/${node.id}/ls?path=/home/user`, userAId);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.entries).toHaveLength(1);
    } finally {
      await closeWsAndWait(agentWs);
    }
  });

  it('node offline → 503', async () => {
    const node = seedNode(testDb, userAId, 'offline-laptop');
    const res = await httpGet(`/api/v1/remote/nodes/${node.id}/ls?path=/home`, userAId);
    expect(res.status).toBe(503);
    const body = await res.json() as any;
    expect(body.error).toBe('node_offline');
  });

  it('non-owner → 403', async () => {
    const node = seedNode(testDb, userAId, 'private-laptop');
    const res = await httpGet(`/api/v1/remote/nodes/${node.id}/ls?path=/home`, userBId);
    expect(res.status).toBe(403);
  });

  it('list nodes → returns only own nodes', async () => {
    const resA = await httpGet('/api/v1/remote/nodes', userAId);
    expect(resA.status).toBe(200);
    const nodesA = (await resA.json() as any).nodes;
    expect(nodesA.length).toBeGreaterThan(0);
    expect(nodesA.every((n: any) => n.user_id === userAId)).toBe(true);

    const resB = await httpGet('/api/v1/remote/nodes', userBId);
    expect(resB.status).toBe(200);
    expect((await resB.json() as any).nodes).toHaveLength(0);
  });

  it('node status endpoint → returns online state', async () => {
    const node = seedNode(testDb, userAId, 'status-laptop');
    const res = await httpGet(`/api/v1/remote/nodes/${node.id}/status`, userAId);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.online).toBe(false);
  });
});
