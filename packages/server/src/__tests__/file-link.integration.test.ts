import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedAgent, seedChannel,
  addChannelMember, grantPermission, authCookie,
} from './setup.js';
import { connectWS, waitForMessage, closeWsAndWait } from './ws-helpers.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

import { buildFullApp } from './setup.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let port: number;
let ownerId: string;
let nonOwnerId: string;
let agentId: string;
let agentApiKey: string;
let channelId: string;

function get(path: string, userId: string) {
  return fetch(`http://127.0.0.1:${port}${path}`, {
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

      const res = await get(`/api/v1/agents/${agentId}/files?path=/workspace/test.ts`, ownerId);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.content).toBe('file-content-here');
    } finally {
      await closeWsAndWait(agentWs);
    }
  });

  it('non-owner gets 403', async () => {
    const agentWs = await connectWS(port, '/ws/plugin', { apiKey: agentApiKey });
    try {
      const res = await get(`/api/v1/agents/${agentId}/files?path=/workspace/test.ts`, nonOwnerId);
      expect(res.status).toBe(403);
    } finally {
      await closeWsAndWait(agentWs);
    }
  });

  it('agent offline returns 503', async () => {
    const res = await get(`/api/v1/agents/${agentId}/files?path=/workspace/test.ts`, ownerId);
    expect(res.status).toBe(503);
    const body = await res.json() as any;
    expect(body.error).toBe('agent_offline');
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

      const res = await get(`/api/v1/agents/${agentId}/files?path=/etc/passwd`, ownerId);
      expect(res.status).toBe(403);
      const body = await res.json() as any;
      expect(body.error).toBe('path_not_allowed');
    } finally {
      await closeWsAndWait(agentWs);
    }
  });

  it('missing path returns 400', async () => {
    const res = await get(`/api/v1/agents/${agentId}/files`, ownerId);
    expect(res.status).toBe(400);
  });
});
