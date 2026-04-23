import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedAgent, seedChannel,
  addChannelMember, grantPermission, authCookie,
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
let ownerId: string;
let nonOwnerId: string;
let agentId: string;
let agentApiKey: string;
let channelId: string;

function inject(method: string, url: string, userId: string) {
  return app.inject({
    method: method as any,
    url,
    headers: { cookie: authCookie(userId) },
  });
}

describe('File link via agent (integration)', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (typeof addr === 'string' || !addr) throw new Error('unexpected address');
    port = addr.port;

    ownerId = seedMember(testDb, 'Owner');
    nonOwnerId = seedMember(testDb, 'NonOwner');
    agentId = seedAgent(testDb, ownerId, 'FileBot');
    const row = testDb.prepare('SELECT api_key FROM users WHERE id = ?').get(agentId) as { api_key: string };
    agentApiKey = row.api_key;
    grantPermission(testDb, agentId, 'message.send');
    channelId = seedChannel(testDb, ownerId, 'file-ch');
    addChannelMember(testDb, channelId, ownerId);
    addChannelMember(testDb, channelId, agentId);
  });

  afterAll(async () => {
    await app.close();
    testDb.close();
  });

  it('owner can read agent file when agent is online', async () => {
    const agentWs = await connectWS(port, '/ws/plugin', { apiKey: agentApiKey });
    try {
      agentWs.on('message', (raw: Buffer | string) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'request') {
          agentWs.send(JSON.stringify({
            type: 'response',
            id: msg.id,
            data: { content: 'file-content-here', size: 17, mime_type: 'text/plain' },
          }));
        }
      });

      const res = await inject('GET', `/api/v1/agents/${agentId}/files?path=/workspace/test.ts`, ownerId);
      expect(res.statusCode).toBe(200);
      expect(res.json().content).toBe('file-content-here');
    } finally {
      await closeWsAndWait(agentWs);
    }
  });

  it('non-owner gets 403', async () => {
    const agentWs = await connectWS(port, '/ws/plugin', { apiKey: agentApiKey });
    try {
      const res = await inject('GET', `/api/v1/agents/${agentId}/files?path=/workspace/test.ts`, nonOwnerId);
      expect(res.statusCode).toBe(403);
    } finally {
      await closeWsAndWait(agentWs);
    }
  });

  it('agent offline returns 503', async () => {
    const res = await inject('GET', `/api/v1/agents/${agentId}/files?path=/workspace/test.ts`, ownerId);
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('agent_offline');
  });

  it('path_not_allowed returns 403', async () => {
    const agentWs = await connectWS(port, '/ws/plugin', { apiKey: agentApiKey });
    try {
      agentWs.on('message', (raw: Buffer | string) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'request') {
          agentWs.send(JSON.stringify({
            type: 'response',
            id: msg.id,
            data: { error: 'path_not_allowed' },
          }));
        }
      });

      const res = await inject('GET', `/api/v1/agents/${agentId}/files?path=/etc/passwd`, ownerId);
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe('path_not_allowed');
    } finally {
      await closeWsAndWait(agentWs);
    }
  });

  it('missing path returns 400', async () => {
    const res = await inject('GET', `/api/v1/agents/${agentId}/files`, ownerId);
    expect(res.statusCode).toBe(400);
  });
});
