import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedAdmin, seedAgent } from './setup.js';
import http from 'node:http';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

import Fastify, { type FastifyInstance } from 'fastify';
import { registerStreamRoutes } from '../routes/stream.js';

let app: FastifyInstance;
let port: number;
let adminId: string;
let agentId: string;
let agentApiKey: string;

function streamRequest(path: string, headers?: Record<string, string>): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}${path}`, { headers }, (res) => {
      resolve({ status: res.statusCode ?? 0 });
      res.destroy();
      req.destroy();
    });
    req.on('error', reject);
    setTimeout(() => { req.destroy(); reject(new Error('timeout')); }, 3000);
  });
}

describe('BUG-009: stream api_key from Authorization header', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    app = Fastify({ logger: false });
    registerStreamRoutes(app);
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
    testDb.exec('DELETE FROM events');
    adminId = seedAdmin(testDb, 'Admin');
    agentId = seedAgent(testDb, adminId, 'TestBot');
    const row = testDb.prepare('SELECT api_key FROM users WHERE id = ?').get(agentId) as { api_key: string };
    agentApiKey = row.api_key;
  });

  it('authenticates via Authorization header', async () => {
    const { status } = await streamRequest('/api/v1/stream', { authorization: `Bearer ${agentApiKey}` });
    expect(status).toBe(200);
  });

  it('authenticates via query string api_key (backward compat)', async () => {
    const { status } = await streamRequest(`/api/v1/stream?api_key=${encodeURIComponent(agentApiKey)}`);
    expect(status).toBe(200);
  });

  it('rejects with no credentials', async () => {
    const { status } = await streamRequest('/api/v1/stream');
    expect(status).toBe(401);
  });

  it('rejects with invalid Authorization header', async () => {
    const { status } = await streamRequest('/api/v1/stream', { authorization: 'Bearer invalid-key' });
    expect(status).toBe(401);
  });

  it('prefers Authorization header over query string', async () => {
    const { status } = await streamRequest(`/api/v1/stream?api_key=bad-key`, { authorization: `Bearer ${agentApiKey}` });
    expect(status).toBe(200);
  });
});
