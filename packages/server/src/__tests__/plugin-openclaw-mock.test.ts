import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import {
  createTestDb, seedAdmin, seedAgent, seedChannel,
  addChannelMember, seedMessage, grantPermission, authCookie,
  buildFullApp,
} from './setup.js';
import { connectWS, waitForMessage, waitForClose, closeWsAndWait, sleep } from './ws-helpers.js';
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

import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let port: number;
let adminId: string;
let agentId: string;
let agentApiKey: string;
let channelId: string;
let adminToken: string;

describe('Plugin ↔ OpenClaw mock integration', () => {
  it.todo('Plugin startup → connects via WS');
  it.todo('outbound sendMessage → message appears in channel');
  it.todo('requireMention filter → only @-mentioned messages forwarded');
});

describe('Plugin SDK unit stubs', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (typeof addr === 'string' || !addr) throw new Error('unexpected address');
    port = addr.port;

    adminId = seedAdmin(testDb, 'PluginSdkAdmin');
    agentId = seedAgent(testDb, adminId, 'PluginSdkBot');
    const row = testDb.prepare('SELECT api_key FROM users WHERE id = ?').get(agentId) as { api_key: string };
    agentApiKey = row.api_key;
    grantPermission(testDb, agentId, 'message.send');
    channelId = seedChannel(testDb, adminId, 'sdk-test-ch');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, agentId);
    adminToken = authCookie(adminId);
  });

  afterAll(async () => {
    await app.close();
    testDb.close();
  });

  describe('outbound', () => {
    it.todo('sendMessage serializes correctly');
    it.todo('sendReaction serializes correctly');
    it.todo('editMessage serializes correctly');
  });

  describe('ws-client', () => {
    it('connects with apiKey', async () => {
      const ws = await connectWS(port, '/ws/plugin', { apiKey: agentApiKey });
      try {
        expect(ws.readyState).toBe(WebSocket.OPEN);
      } finally {
        await closeWsAndWait(ws);
      }
    });

    it('reconnects on disconnect', async () => {
      const ws1 = await connectWS(port, '/ws/plugin', { apiKey: agentApiKey });
      await closeWsAndWait(ws1);
      expect(ws1.readyState).toBe(WebSocket.CLOSED);

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

    it('apiCall sends request and receives response', async () => {
      const ws = await connectWS(port, '/ws/plugin', { apiKey: agentApiKey });
      try {
        ws.send(JSON.stringify({
          type: 'api_request',
          id: 'sdk-req-001',
          data: {
            method: 'POST',
            path: `/api/v1/channels/${channelId}/messages`,
            body: { content: 'ws-client apiCall test' },
          },
        }));
        const response = await waitForMessage(ws, (m) => m.type === 'api_response' && m.id === 'sdk-req-001');
        expect(response.data.status).toBe(201);
        expect(response.data.body.message.content).toBe('ws-client apiCall test');
      } finally {
        await closeWsAndWait(ws);
      }
    });

    it.todo('apiCall times out after threshold');
  });

  describe('sse-client', () => {
    it('parses SSE events', async () => {
      const sseData = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          req.destroy();
          reject(new Error('SSE timeout'));
        }, 8000);

        const req = http.get(
          `http://127.0.0.1:${port}/api/v1/stream`,
          { headers: { authorization: `Bearer ${agentApiKey}` } },
          (res) => {
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toContain('text/event-stream');
            let buf = '';
            let messageSent = false;
            res.on('data', (chunk: Buffer) => {
              buf += chunk.toString();
              if (buf.includes(':connected') && !messageSent) {
                messageSent = true;
                app.inject({
                  method: 'POST',
                  url: `/api/v1/channels/${channelId}/messages`,
                  payload: { content: 'sse-parse-test' },
                  headers: { cookie: adminToken },
                });
              }
              if (buf.includes('sse-parse-test')) {
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

      expect(sseData).toContain(':connected');
      expect(sseData).toContain('event: message');
      expect(sseData).toContain('sse-parse-test');

      const idLines = sseData.split('\n').filter(l => l.startsWith('id:'));
      expect(idLines.length).toBeGreaterThan(0);
      const cursorStr = idLines[idLines.length - 1]!.slice(3).trim();
      expect(Number.isFinite(parseInt(cursorStr, 10))).toBe(true);
    });

    it('resumes from cursor on reconnect', async () => {
      const sendRes = await app.inject({
        method: 'POST',
        url: `/api/v1/channels/${channelId}/messages`,
        payload: { content: 'sse-resume-marker' },
        headers: { cookie: adminToken },
      });
      expect(sendRes.statusCode).toBe(201);

      await sleep(100);

      const eventRow = testDb.prepare(
        "SELECT cursor FROM events WHERE kind = 'message' AND json_extract(payload, '$.content') = ? LIMIT 1",
      ).get('sse-resume-marker') as { cursor: number } | undefined;
      expect(eventRow).toBeDefined();
      const markerCursor = eventRow!.cursor;

      const beforeCursor = markerCursor - 1;

      const sseData = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          req.destroy();
          reject(new Error('SSE resume timeout'));
        }, 5000);

        const req = http.get(
          `http://127.0.0.1:${port}/api/v1/stream`,
          {
            headers: {
              authorization: `Bearer ${agentApiKey}`,
              'last-event-id': String(beforeCursor),
            },
          },
          (res) => {
            expect(res.statusCode).toBe(200);
            let buf = '';
            res.on('data', (chunk: Buffer) => {
              buf += chunk.toString();
              if (buf.includes('sse-resume-marker')) {
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

      expect(sseData).toContain('sse-resume-marker');
    });
  });

  describe('file-access', () => {
    function isPathAllowed(target: string, allowed: string[]): boolean {
      const normalized = target.endsWith('/') ? target : target + '/';
      return allowed.some((prefix) => {
        const p = prefix.endsWith('/') ? prefix : prefix + '/';
        return normalized.startsWith(p) || target === prefix;
      });
    }

    it('allows whitelisted paths', () => {
      const allowed = ['/home/user/projects', '/tmp/shared'];
      expect(isPathAllowed('/home/user/projects/file.txt', allowed)).toBe(true);
      expect(isPathAllowed('/home/user/projects', allowed)).toBe(true);
      expect(isPathAllowed('/tmp/shared/nested/deep.json', allowed)).toBe(true);
    });

    it('rejects non-whitelisted paths', () => {
      const allowed = ['/home/user/projects', '/tmp/shared'];
      expect(isPathAllowed('/etc/passwd', allowed)).toBe(false);
      expect(isPathAllowed('/home/user/other/file.txt', allowed)).toBe(false);
      expect(isPathAllowed('/home/user/project', allowed)).toBe(false);
      expect(isPathAllowed('/tmp/share', allowed)).toBe(false);
    });
  });

  describe('accounts', () => {
    it.todo('parses config from environment');
    it.todo('applies default values for missing fields');
  });
});
