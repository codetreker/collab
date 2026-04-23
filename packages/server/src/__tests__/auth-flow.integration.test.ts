import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedAdmin, seedInviteCode, seedChannel, seedAgent, authCookie } from './setup.js';

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

import Fastify, { type FastifyInstance } from 'fastify';
import { registerAuthRoutes, authMiddleware } from '../auth.js';
import { registerChannelRoutes } from '../routes/channels.js';

let app: FastifyInstance;

describe('Auth flow (integration)', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    app = Fastify({ logger: false });
    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/v1/auth/')) return;
      await authMiddleware(request, reply);
    });
    registerAuthRoutes(app);
    registerChannelRoutes(app);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    testDb.close();
  });

  it('register → valid invite code → 201 + user info + JWT cookie', async () => {
    const adminId = seedAdmin(testDb, 'FlowAdmin');
    seedInviteCode(testDb, adminId, 'FLOW001');
    seedChannel(testDb, adminId, 'general');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { invite_code: 'FLOW001', email: 'flow@test.com', password: 'password123', display_name: 'FlowUser' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().user.display_name).toBe('FlowUser');
    expect(res.headers['set-cookie']).toContain('collab_token=');
  });

  it('register → invalid invite code → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { invite_code: 'BADCODE', email: 'x@test.com', password: 'password123', display_name: 'X' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('register → already used invite code → 404', async () => {
    const adminId = testDb.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get() as { id: string };
    seedInviteCode(testDb, adminId.id, 'USED001');
    const memberId = testDb.prepare("SELECT id FROM users WHERE display_name='FlowUser'").get() as { id: string };
    testDb.prepare('UPDATE invite_codes SET used_by = ?, used_at = ? WHERE code = ?').run(memberId.id, Date.now(), 'USED001');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { invite_code: 'USED001', email: 'y@test.com', password: 'password123', display_name: 'Y' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('login → correct password → 200 + JWT cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'flow@test.com', password: 'password123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['set-cookie']).toContain('collab_token=');
  });

  it('login → wrong password → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'flow@test.com', password: 'wrongpass' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('API Key auth → agent uses Bearer token → 200', async () => {
    const adminId = testDb.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get() as { id: string };
    const agentId = seedAgent(testDb, adminId.id, 'AuthBot');
    const row = testDb.prepare('SELECT api_key FROM users WHERE id = ?').get(agentId) as { api_key: string };

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/channels',
      headers: { authorization: `Bearer ${row.api_key}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('expired/invalid token → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/channels',
      headers: { cookie: 'collab_token=invalid.jwt.token' },
    });
    expect(res.statusCode).toBe(401);
  });
});
