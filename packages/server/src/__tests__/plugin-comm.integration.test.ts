import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import http from 'node:http';
import {
  createTestDb, seedAdmin, seedAgent, seedChannel,
  addChannelMember, seedMessage, grantPermission,
} from './setup.js';
import { connectWS, waitForMessage, waitForClose, sleep, closeWsAndWait } from './ws-helpers.js';
import { WebSocket } from 'ws';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

const wsMock = vi.hoisted(() => ({
  broadcastToChannel: vi.fn(),
  broadcastToUser: vi.fn(),
  getOnlineUserIds: vi.fn(() => []),
  unsubscribeUserFromChannel: vi.fn(),
}));

vi.mock('../ws.js', () => wsMock);

import { buildFullApp } from './setup.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let port: number;
let adminId: string;
let agentId: string;
let agentApiKey: string;
let channelId: string;

describe('Plugin communication (integration)', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildFullApp(testDb);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (typeof addr === 'string' || !addr) throw new Error('unexpected address');
    port = addr.port;

    adminId = seedAdmin(testDb, 'PluginAdmin');
    agentId = seedAgent(testDb, adminId, 'PluginBot');
    const row = testDb.prepare('SELECT api_key FROM users WHERE id = ?').get(agentId) as { api_key: string };
    agentApiKey = row.api_key;
    grantPermission(testDb, agentId, 'message.send');
    channelId = seedChannel(testDb, adminId, 'plugin-ch');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, agentId);
  });

  afterAll(async () => {
    await app.close();
    testDb.close();
  });

  it('WS connection → valid API key → connected', async () => {
    const ws = await connectWS(port, '/ws/plugin', { apiKey: agentApiKey });
    try {
      expect(ws.readyState).toBe(WebSocket.OPEN);
    } finally {
      await closeWsAndWait(ws);
    }
  });

  it('WS connection → invalid API key → close 4001', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/plugin?apiKey=invalid`);
    const code = await waitForClose(ws);
    expect(code).toBe(4001);
  });

  it('SSE stream → valid API key → receives connected comment', async () => {
    const data = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        req.destroy();
        reject(new Error('SSE connect timeout'));
      }, 3000);
      const req = http.get(
        `http://127.0.0.1:${port}/api/v1/stream`,
        { headers: { authorization: `Bearer ${agentApiKey}` } },
        (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers['content-type']).toContain('text/event-stream');
          let buf = '';
          res.on('data', (chunk: Buffer) => {
            buf += chunk.toString();
            if (buf.includes(':connected')) {
              clearTimeout(timeout);
              res.destroy();
              resolve(buf);
            }
          });
        },
      );
      req.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    expect(data).toContain(':connected');
  });

  it('WS api_request → send message → response with 201', async () => {
    const ws = await connectWS(port, '/ws/plugin', { apiKey: agentApiKey });
    try {
      ws.send(JSON.stringify({
        type: 'api_request',
        id: 'req-001',
        data: {
          method: 'POST',
          path: `/api/v1/channels/${channelId}/messages`,
          body: { content: 'from plugin' },
        },
      }));
      const response = await waitForMessage(ws, (m) => m.type === 'api_response' && m.id === 'req-001');
      expect(response.data.status).toBe(201);
      expect(response.data.body.message.content).toBe('from plugin');
    } finally {
      await closeWsAndWait(ws);
    }
  });

  it('WS api_request → add reaction → 200', async () => {
    const msgId = seedMessage(testDb, channelId, agentId, 'react me');
    const ws = await connectWS(port, '/ws/plugin', { apiKey: agentApiKey });
    try {
      ws.send(JSON.stringify({
        type: 'api_request',
        id: 'req-react',
        data: {
          method: 'PUT',
          path: `/api/v1/messages/${msgId}/reactions`,
          body: { emoji: '🔥' },
        },
      }));
      const res = await waitForMessage(ws, (m) => m.type === 'api_response' && m.id === 'req-react');
      expect(res.data.status).toBe(200);
    } finally {
      await closeWsAndWait(ws);
    }
  });

  it('message event pushed to connected plugin WS', async () => {
    // True WS fan-out cannot be tested here because broadcastToChannel is mocked
    // (real WS upgrade connections don't share the broadcast registry with inject).
    // Instead we verify the spy was called with correct channel and event shape.
    wsMock.broadcastToChannel.mockClear();
    const ws = await connectWS(port, '/ws/plugin', { apiKey: agentApiKey });
    try {
      ws.send(JSON.stringify({
        type: 'api_request',
        id: 'req-push',
        data: {
          method: 'POST',
          path: `/api/v1/channels/${channelId}/messages`,
          body: { content: 'trigger event' },
        },
      }));
      const response = await waitForMessage(ws, (m) => m.type === 'api_response' && m.id === 'req-push');
      expect(response.data.status).toBe(201);

      expect(wsMock.broadcastToChannel).toHaveBeenCalledWith(
        channelId,
        expect.objectContaining({ type: 'new_message' }),
      );
    } finally {
      await closeWsAndWait(ws);
    }
  });

  it('WS api_request → edit message → 200', async () => {
    const ws = await connectWS(port, '/ws/plugin', { apiKey: agentApiKey });
    try {
      ws.send(JSON.stringify({
        type: 'api_request',
        id: 'req-create-e',
        data: {
          method: 'POST',
          path: `/api/v1/channels/${channelId}/messages`,
          body: { content: 'to be edited' },
        },
      }));
      const created = await waitForMessage(ws, (m) => m.type === 'api_response' && m.id === 'req-create-e');
      const msgId = created.data.body.message.id;

      ws.send(JSON.stringify({
        type: 'api_request',
        id: 'req-edit',
        data: {
          method: 'PUT',
          path: `/api/v1/messages/${msgId}`,
          body: { content: 'edited via ws' },
        },
      }));
      const editRes = await waitForMessage(ws, (m) => m.type === 'api_response' && m.id === 'req-edit');
      expect(editRes.data.status).toBe(200);
      expect(editRes.data.body.message.content).toBe('edited via ws');
    } finally {
      await closeWsAndWait(ws);
    }
  });

  it('WS api_request → delete message → soft-deletes', async () => {
    const ws = await connectWS(port, '/ws/plugin', { apiKey: agentApiKey });
    try {
      ws.send(JSON.stringify({
        type: 'api_request',
        id: 'req-create-d',
        data: {
          method: 'POST',
          path: `/api/v1/channels/${channelId}/messages`,
          body: { content: 'to be deleted' },
        },
      }));
      const created = await waitForMessage(ws, (m) => m.type === 'api_response' && m.id === 'req-create-d');
      const msgId = created.data.body.message.id;

      ws.send(JSON.stringify({
        type: 'api_request',
        id: 'req-del',
        data: {
          method: 'DELETE',
          path: `/api/v1/messages/${msgId}`,
          body: {},
        },
      }));
      const delRes = await waitForMessage(ws, (m) => m.type === 'api_response' && m.id === 'req-del');
      expect(delRes.data.status).toBe(204);
    } finally {
      await closeWsAndWait(ws);
    }
  });

  it('disconnect and reconnect → can still use WS', async () => {
    const ws1 = await connectWS(port, '/ws/plugin', { apiKey: agentApiKey });
    await closeWsAndWait(ws1);
    const ws2 = await connectWS(port, '/ws/plugin', { apiKey: agentApiKey });
    try {
      expect(ws2.readyState).toBe(WebSocket.OPEN);
      ws2.send(JSON.stringify({ type: 'ping' }));
      const pong = await waitForMessage(ws2, (m) => m.type === 'pong');
      expect(pong.type).toBe('pong');
    } finally {
      await closeWsAndWait(ws2);
    }
  });
});
