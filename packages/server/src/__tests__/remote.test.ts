import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedAdmin, seedMember, seedChannel, authCookie } from './setup.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

vi.mock('../ws.js', () => ({
  broadcastToChannel: vi.fn(),
  broadcastToUser: vi.fn(),
  getOnlineUserIds: vi.fn(() => []),
  unsubscribeUserFromChannel: vi.fn(),
}));

vi.mock('../remote-node-manager.js', () => ({
  remoteNodeManager: {
    isOnline: vi.fn(() => false),
    request: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn(),
    markAlive: vi.fn(),
    resolveResponse: vi.fn(),
  },
}));

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { registerRemoteRoutes } from '../routes/remote.js';
import { registerWsRemoteRoutes } from '../routes/ws-remote.js';
import { authMiddleware } from '../auth.js';
import { remoteNodeManager } from '../remote-node-manager.js';
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';

const mockRemoteNodeManager = remoteNodeManager as unknown as {
  isOnline: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
  register: ReturnType<typeof vi.fn>;
  unregister: ReturnType<typeof vi.fn>;
  markAlive: ReturnType<typeof vi.fn>;
  resolveResponse: ReturnType<typeof vi.fn>;
};

let app: FastifyInstance;
let baseUrl: string;

function addRemoteTables(db: Database.Database) {
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
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(node_id, channel_id, path)
    );
  `);
}

function inject(method: string, url: string, userId?: string, payload?: unknown) {
  return app.inject({
    method: method as any,
    url,
    payload: payload as any,
    headers: userId ? { cookie: authCookie(userId) } : {},
  });
}

function seedNode(db: Database.Database, userId: string, name = 'my-laptop'): { id: string; token: string } {
  const id = uuidv4();
  const token = uuidv4();
  db.prepare('INSERT INTO remote_nodes (id, user_id, machine_name, connection_token) VALUES (?, ?, ?, ?)').run(id, userId, name, token);
  return { id, token };
}

function seedBinding(db: Database.Database, nodeId: string, channelId: string, path = '/home/user'): string {
  const id = uuidv4();
  db.prepare('INSERT INTO remote_bindings (id, node_id, channel_id, path) VALUES (?, ?, ?, ?)').run(id, nodeId, channelId, path);
  return id;
}

function cleanTables() {
  testDb.exec('DELETE FROM remote_bindings');
  testDb.exec('DELETE FROM remote_nodes');
  testDb.exec('DELETE FROM channels');
  testDb.exec('DELETE FROM users');
}

// ─── REST routes ─────────────────────────────────────

describe('Remote REST API', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    addRemoteTables(testDb);
    app = Fastify({ logger: false });
    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/v1/auth/')) return;
      await authMiddleware(request, reply);
    });
    registerRemoteRoutes(app);
    await app.ready();
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => {
    cleanTables();
    vi.clearAllMocks();
  });

  // ─── Node CRUD ───

  describe('Node CRUD', () => {
    it('requires auth for all node endpoints', async () => {
      const r1 = await inject('GET', '/api/v1/remote/nodes');
      const r2 = await inject('POST', '/api/v1/remote/nodes', undefined, { machine_name: 'x' });
      const r3 = await inject('DELETE', '/api/v1/remote/nodes/fake');
      expect(r1.statusCode).toBe(401);
      expect(r2.statusCode).toBe(401);
      expect(r3.statusCode).toBe(401);
    });

    it('creates and lists nodes', async () => {
      const uid = seedAdmin(testDb);
      const create = await inject('POST', '/api/v1/remote/nodes', uid, { machine_name: 'my-laptop' });
      expect(create.statusCode).toBe(201);
      const node = JSON.parse(create.body).node;
      expect(node.machine_name).toBe('my-laptop');
      expect(node.connection_token).toBeTruthy();

      const list = await inject('GET', '/api/v1/remote/nodes', uid);
      expect(JSON.parse(list.body).nodes).toHaveLength(1);
    });

    it('rejects empty machine_name', async () => {
      const uid = seedAdmin(testDb);
      const r1 = await inject('POST', '/api/v1/remote/nodes', uid, { machine_name: '' });
      expect(r1.statusCode).toBe(400);
      const r2 = await inject('POST', '/api/v1/remote/nodes', uid, { machine_name: '   ' });
      expect(r2.statusCode).toBe(400);
    });

    it('deletes own node', async () => {
      const uid = seedAdmin(testDb);
      const { id } = seedNode(testDb, uid);
      const del = await inject('DELETE', `/api/v1/remote/nodes/${id}`, uid);
      expect(del.statusCode).toBe(200);
      expect(JSON.parse(del.body).ok).toBe(true);
    });

    it('returns 404 for missing node', async () => {
      const uid = seedAdmin(testDb);
      const del = await inject('DELETE', '/api/v1/remote/nodes/nonexistent', uid);
      expect(del.statusCode).toBe(404);
    });

    it('returns 403 when deleting another user node', async () => {
      const owner = seedAdmin(testDb);
      const other = seedMember(testDb, 'Other');
      const { id } = seedNode(testDb, owner);
      const del = await inject('DELETE', `/api/v1/remote/nodes/${id}`, other);
      expect(del.statusCode).toBe(403);
    });
  });

  // ─── Binding CRUD ───

  describe('Binding CRUD', () => {
    it('creates and lists bindings', async () => {
      const uid = seedAdmin(testDb);
      const { id: nodeId } = seedNode(testDb, uid);
      const channelId = seedChannel(testDb, uid);

      const create = await inject('POST', `/api/v1/remote/nodes/${nodeId}/bindings`, uid, {
        channel_id: channelId, path: '/home/user/project', label: 'my proj',
      });
      expect(create.statusCode).toBe(201);
      expect(JSON.parse(create.body).binding.path).toBe('/home/user/project');

      const list = await inject('GET', `/api/v1/remote/nodes/${nodeId}/bindings`, uid);
      expect(JSON.parse(list.body).bindings).toHaveLength(1);
    });

    it('rejects binding with missing fields', async () => {
      const uid = seedAdmin(testDb);
      const { id: nodeId } = seedNode(testDb, uid);
      const res = await inject('POST', `/api/v1/remote/nodes/${nodeId}/bindings`, uid, { channel_id: '', path: '' });
      expect(res.statusCode).toBe(400);
    });

    it('rejects binding to nonexistent channel', async () => {
      const uid = seedAdmin(testDb);
      const { id: nodeId } = seedNode(testDb, uid);
      const res = await inject('POST', `/api/v1/remote/nodes/${nodeId}/bindings`, uid, {
        channel_id: 'no-such-channel', path: '/tmp',
      });
      expect(res.statusCode).toBe(404);
    });

    it('deletes a binding', async () => {
      const uid = seedAdmin(testDb);
      const { id: nodeId } = seedNode(testDb, uid);
      const channelId = seedChannel(testDb, uid);
      const bindingId = seedBinding(testDb, nodeId, channelId);

      const del = await inject('DELETE', `/api/v1/remote/nodes/${nodeId}/bindings/${bindingId}`, uid);
      expect(del.statusCode).toBe(200);
    });

    it('returns 404 for nonexistent binding', async () => {
      const uid = seedAdmin(testDb);
      const { id: nodeId } = seedNode(testDb, uid);
      const del = await inject('DELETE', `/api/v1/remote/nodes/${nodeId}/bindings/fake`, uid);
      expect(del.statusCode).toBe(404);
    });

    it('forbids binding ops on other user node', async () => {
      const owner = seedAdmin(testDb);
      const other = seedMember(testDb, 'Other');
      const { id: nodeId } = seedNode(testDb, owner);
      const list = await inject('GET', `/api/v1/remote/nodes/${nodeId}/bindings`, other);
      expect(list.statusCode).toBe(403);
    });
  });

  // ─── Channel-scoped bindings ───

  describe('Channel-scoped bindings', () => {
    it('lists bindings for a channel', async () => {
      const uid = seedAdmin(testDb);
      const { id: nodeId } = seedNode(testDb, uid);
      const channelId = seedChannel(testDb, uid);
      seedBinding(testDb, nodeId, channelId);

      const res = await inject('GET', `/api/v1/channels/${channelId}/remote-bindings`, uid);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).bindings).toHaveLength(1);
    });
  });

  // ─── File proxy ───

  describe('File proxy', () => {
    it('returns 503 when node is offline', async () => {
      const uid = seedAdmin(testDb);
      const { id: nodeId } = seedNode(testDb, uid);
      mockRemoteNodeManager.isOnline.mockReturnValue(false);

      const res = await inject('GET', `/api/v1/remote/nodes/${nodeId}/ls?path=/tmp`, uid);
      expect(res.statusCode).toBe(503);
    });

    it('returns 400 when path is missing', async () => {
      const uid = seedAdmin(testDb);
      const { id: nodeId } = seedNode(testDb, uid);
      mockRemoteNodeManager.isOnline.mockReturnValue(true);

      const res = await inject('GET', `/api/v1/remote/nodes/${nodeId}/ls`, uid);
      expect(res.statusCode).toBe(400);
    });

    it('proxies ls request to node', async () => {
      const uid = seedAdmin(testDb);
      const { id: nodeId } = seedNode(testDb, uid);
      mockRemoteNodeManager.isOnline.mockReturnValue(true);
      mockRemoteNodeManager.request.mockResolvedValue({ entries: [{ name: 'file.txt', type: 'file' }] });

      const res = await inject('GET', `/api/v1/remote/nodes/${nodeId}/ls?path=/home`, uid);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).entries).toHaveLength(1);
    });

    it('proxies read request to node', async () => {
      const uid = seedAdmin(testDb);
      const { id: nodeId } = seedNode(testDb, uid);
      mockRemoteNodeManager.isOnline.mockReturnValue(true);
      mockRemoteNodeManager.request.mockResolvedValue({ content: 'hello world' });

      const res = await inject('GET', `/api/v1/remote/nodes/${nodeId}/read?path=/home/file.txt`, uid);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).content).toBe('hello world');
    });

    it('returns 504 on timeout', async () => {
      const uid = seedAdmin(testDb);
      const { id: nodeId } = seedNode(testDb, uid);
      mockRemoteNodeManager.isOnline.mockReturnValue(true);
      mockRemoteNodeManager.request.mockRejectedValue(new Error('timed out'));

      const res = await inject('GET', `/api/v1/remote/nodes/${nodeId}/ls?path=/tmp`, uid);
      expect(res.statusCode).toBe(504);
    });

    it('returns 403 on path_not_allowed from ls', async () => {
      const uid = seedAdmin(testDb);
      const { id: nodeId } = seedNode(testDb, uid);
      mockRemoteNodeManager.isOnline.mockReturnValue(true);
      mockRemoteNodeManager.request.mockResolvedValue({ error: 'path_not_allowed' });

      const res = await inject('GET', `/api/v1/remote/nodes/${nodeId}/ls?path=/root`, uid);
      expect(res.statusCode).toBe(403);
    });

    it('returns 404 on file_not_found from read', async () => {
      const uid = seedAdmin(testDb);
      const { id: nodeId } = seedNode(testDb, uid);
      mockRemoteNodeManager.isOnline.mockReturnValue(true);
      mockRemoteNodeManager.request.mockResolvedValue({ error: 'file_not_found' });

      const res = await inject('GET', `/api/v1/remote/nodes/${nodeId}/read?path=/nope`, uid);
      expect(res.statusCode).toBe(404);
    });

    it('returns 413 on file_too_large from read', async () => {
      const uid = seedAdmin(testDb);
      const { id: nodeId } = seedNode(testDb, uid);
      mockRemoteNodeManager.isOnline.mockReturnValue(true);
      mockRemoteNodeManager.request.mockResolvedValue({ error: 'file_too_large' });

      const res = await inject('GET', `/api/v1/remote/nodes/${nodeId}/read?path=/big`, uid);
      expect(res.statusCode).toBe(413);
    });

    it('returns node online status', async () => {
      const uid = seedAdmin(testDb);
      const { id: nodeId } = seedNode(testDb, uid);
      mockRemoteNodeManager.isOnline.mockReturnValue(true);

      const res = await inject('GET', `/api/v1/remote/nodes/${nodeId}/status`, uid);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).online).toBe(true);
    });
  });
});

// ─── WebSocket routes ────────────────────────────────

describe('WS Remote endpoint', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    addRemoteTables(testDb);
    app = Fastify({ logger: false });
    await app.register(fastifyWebsocket);
    registerWsRemoteRoutes(app);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => {
    cleanTables();
    vi.clearAllMocks();
  });

  function connectWs(query: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws/remote?${query}`);
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

  it('closes connection when token is missing', async () => {
    const ws = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws/remote`);
    const { code } = await waitForClose(ws);
    expect(code).toBe(4001);
  });

  it('closes connection when token is invalid', async () => {
    const ws = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws/remote?token=bad-token`);
    const { code } = await waitForClose(ws);
    expect(code).toBe(4001);
  });

  it('registers node on valid token and handles ping', async () => {
    const uid = seedAdmin(testDb);
    const { token } = seedNode(testDb, uid);

    const ws = await connectWs(`token=${token}`);
    expect(mockRemoteNodeManager.register).toHaveBeenCalled();

    ws.send(JSON.stringify({ type: 'ping' }));
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe('pong');

    ws.close();
  });

  it('handles pong messages', async () => {
    const uid = seedAdmin(testDb);
    const { token } = seedNode(testDb, uid);

    const ws = await connectWs(`token=${token}`);
    ws.send(JSON.stringify({ type: 'pong' }));
    // Give it a tick to process
    await new Promise(r => setTimeout(r, 50));
    expect(mockRemoteNodeManager.markAlive).toHaveBeenCalled();
    ws.close();
  });

  it('handles response messages', async () => {
    const uid = seedAdmin(testDb);
    const { token } = seedNode(testDb, uid);

    const ws = await connectWs(`token=${token}`);
    ws.send(JSON.stringify({ type: 'response', id: 'req_abc', data: { ok: true } }));
    await new Promise(r => setTimeout(r, 50));
    expect(mockRemoteNodeManager.resolveResponse).toHaveBeenCalledWith('req_abc', { ok: true }, undefined);
    ws.close();
  });

  it('returns error for invalid JSON', async () => {
    const uid = seedAdmin(testDb);
    const { token } = seedNode(testDb, uid);

    const ws = await connectWs(`token=${token}`);
    ws.send('not json');
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe('error');
    expect(msg.error).toBe('Invalid JSON');
    ws.close();
  });

  it('returns error for unknown message type', async () => {
    const uid = seedAdmin(testDb);
    const { token } = seedNode(testDb, uid);

    const ws = await connectWs(`token=${token}`);
    ws.send(JSON.stringify({ type: 'unknown_thing' }));
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe('error');
    expect((msg.error as string)).toContain('Unknown message type');
    ws.close();
  });

  it('calls unregister on close', async () => {
    const uid = seedAdmin(testDb);
    const { id: nodeId, token } = seedNode(testDb, uid);

    const ws = await connectWs(`token=${token}`);
    ws.close();
    await new Promise(r => setTimeout(r, 100));
    expect(mockRemoteNodeManager.unregister).toHaveBeenCalledWith(nodeId);
  });

  it('ignores response message without id', async () => {
    const uid = seedAdmin(testDb);
    const { token } = seedNode(testDb, uid);

    const ws = await connectWs(`token=${token}`);
    ws.send(JSON.stringify({ type: 'response', data: { ok: true } }));
    await new Promise(r => setTimeout(r, 50));
    expect(mockRemoteNodeManager.resolveResponse).not.toHaveBeenCalled();
    ws.close();
  });

  it('forwards error field from response messages', async () => {
    const uid = seedAdmin(testDb);
    const { token } = seedNode(testDb, uid);

    const ws = await connectWs(`token=${token}`);
    ws.send(JSON.stringify({ type: 'response', id: 'req_err', data: null, error: 'something broke' }));
    await new Promise(r => setTimeout(r, 50));
    expect(mockRemoteNodeManager.resolveResponse).toHaveBeenCalledWith('req_err', null, 'something broke');
    ws.close();
  });

  it('calls unregister when socket errors and closes', async () => {
    const uid = seedAdmin(testDb);
    const { id: nodeId, token } = seedNode(testDb, uid);

    const ws = await connectWs(`token=${token}`);
    ws.terminate();
    await new Promise(r => setTimeout(r, 150));
    expect(mockRemoteNodeManager.unregister).toHaveBeenCalledWith(nodeId);
  });
});

// ─── Additional REST edge cases ─────────────────────

describe('Remote REST API – extra edge cases', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    addRemoteTables(testDb);
    app = Fastify({ logger: false });
    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/v1/auth/')) return;
      await authMiddleware(request, reply);
    });
    registerRemoteRoutes(app);
    await app.ready();
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => {
    cleanTables();
    vi.clearAllMocks();
  });

  it('returns 503 on disconnected error from ls', async () => {
    const uid = seedAdmin(testDb);
    const { id: nodeId } = seedNode(testDb, uid);
    mockRemoteNodeManager.isOnline.mockReturnValue(true);
    mockRemoteNodeManager.request.mockRejectedValue(new Error('not connected'));

    const res = await inject('GET', `/api/v1/remote/nodes/${nodeId}/ls?path=/tmp`, uid);
    expect(res.statusCode).toBe(503);
  });

  it('returns 500 on unknown error from ls', async () => {
    const uid = seedAdmin(testDb);
    const { id: nodeId } = seedNode(testDb, uid);
    mockRemoteNodeManager.isOnline.mockReturnValue(true);
    mockRemoteNodeManager.request.mockRejectedValue(new Error('unexpected'));

    const res = await inject('GET', `/api/v1/remote/nodes/${nodeId}/ls?path=/tmp`, uid);
    expect(res.statusCode).toBe(500);
  });

  it('returns 400 when read path is missing', async () => {
    const uid = seedAdmin(testDb);
    const { id: nodeId } = seedNode(testDb, uid);
    mockRemoteNodeManager.isOnline.mockReturnValue(true);

    const res = await inject('GET', `/api/v1/remote/nodes/${nodeId}/read`, uid);
    expect(res.statusCode).toBe(400);
  });

  it('returns 503 on disconnected error from read', async () => {
    const uid = seedAdmin(testDb);
    const { id: nodeId } = seedNode(testDb, uid);
    mockRemoteNodeManager.isOnline.mockReturnValue(true);
    mockRemoteNodeManager.request.mockRejectedValue(new Error('disconnected'));

    const res = await inject('GET', `/api/v1/remote/nodes/${nodeId}/read?path=/tmp`, uid);
    expect(res.statusCode).toBe(503);
  });

  it('returns 504 on timeout from read', async () => {
    const uid = seedAdmin(testDb);
    const { id: nodeId } = seedNode(testDb, uid);
    mockRemoteNodeManager.isOnline.mockReturnValue(true);
    mockRemoteNodeManager.request.mockRejectedValue(new Error('timed out'));

    const res = await inject('GET', `/api/v1/remote/nodes/${nodeId}/read?path=/tmp`, uid);
    expect(res.statusCode).toBe(504);
  });

  it('returns 500 on unknown error from read', async () => {
    const uid = seedAdmin(testDb);
    const { id: nodeId } = seedNode(testDb, uid);
    mockRemoteNodeManager.isOnline.mockReturnValue(true);
    mockRemoteNodeManager.request.mockRejectedValue(new Error('unexpected'));

    const res = await inject('GET', `/api/v1/remote/nodes/${nodeId}/read?path=/tmp`, uid);
    expect(res.statusCode).toBe(500);
  });

  it('returns 400 on generic error field from read', async () => {
    const uid = seedAdmin(testDb);
    const { id: nodeId } = seedNode(testDb, uid);
    mockRemoteNodeManager.isOnline.mockReturnValue(true);
    mockRemoteNodeManager.request.mockResolvedValue({ error: 'some_other_error' });

    const res = await inject('GET', `/api/v1/remote/nodes/${nodeId}/read?path=/tmp`, uid);
    expect(res.statusCode).toBe(400);
  });
});
