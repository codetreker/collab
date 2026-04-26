import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedAdmin } from './setup.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

import Fastify, { type FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth.js';

describe('Dev auth bypass requires DEV_AUTH_BYPASS=true (BUG-010)', () => {
  let app: FastifyInstance;
  let adminId: string;
  const origEnv = { ...process.env };

  beforeAll(async () => {
    testDb = createTestDb();
    app = Fastify({ logger: false });
    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/v1/auth/')) return;
      await authMiddleware(request, reply);
    });
    app.get('/api/v1/test-protected', async (request, reply) => {
      if (!request.currentUser) return reply.status(401).send({ error: 'Authentication required' });
      return { user_id: request.currentUser.id };
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    process.env.NODE_ENV = origEnv.NODE_ENV;
    delete process.env.DEV_AUTH_BYPASS;
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM users');
    adminId = seedAdmin(testDb, 'DevAdmin');
    process.env.NODE_ENV = origEnv.NODE_ENV;
    delete process.env.DEV_AUTH_BYPASS;
  });

  it('rejects unauthenticated request in development mode without DEV_AUTH_BYPASS', async () => {
    process.env.NODE_ENV = 'development';
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/test-protected',
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects x-dev-user-id header in development mode without DEV_AUTH_BYPASS', async () => {
    process.env.NODE_ENV = 'development';
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/test-protected',
      headers: { 'x-dev-user-id': adminId },
    });
    expect(res.statusCode).toBe(401);
  });

  it('allows dev bypass when DEV_AUTH_BYPASS=true in development mode', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DEV_AUTH_BYPASS = 'true';
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/test-protected',
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user_id).toBe(adminId);
  });

  it('allows dev bypass with x-dev-user-id when DEV_AUTH_BYPASS=true', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DEV_AUTH_BYPASS = 'true';
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/test-protected',
      headers: { 'x-dev-user-id': adminId },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user_id).toBe(adminId);
  });

  it('rejects dev bypass in production even with DEV_AUTH_BYPASS=true', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DEV_AUTH_BYPASS = 'true';
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/test-protected',
    });
    expect(res.statusCode).toBe(401);
  });
});
