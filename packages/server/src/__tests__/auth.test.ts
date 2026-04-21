import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import { createTestDb, seedAdmin, seedMember, seedInviteCode } from './setup.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

import Fastify, { type FastifyInstance } from 'fastify';
import { registerAuthRoutes, authMiddleware } from '../auth.js';

let app: FastifyInstance;

describe('Auth API', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    app = Fastify({ logger: false });
    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/v1/auth/')) return;
      await authMiddleware(request, reply);
    });
    registerAuthRoutes(app);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM invite_codes');
    testDb.exec('DELETE FROM user_permissions');
    testDb.exec('DELETE FROM channel_members');
    testDb.exec('DELETE FROM messages');
    testDb.exec('DELETE FROM channels');
    testDb.exec('DELETE FROM users');
  });

  describe('POST /api/v1/auth/register', () => {
    it('registers a new user with valid invite code', async () => {
      const adminId = seedAdmin(testDb, 'RegAdmin');
      const code = seedInviteCode(testDb, adminId, 'REG001');
      testDb.prepare("INSERT INTO channels (id, name, topic, visibility, created_at, created_by) VALUES (?, ?, '', 'public', ?, ?)").run('ch-gen', 'general', Date.now(), adminId);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          invite_code: code,
          email: 'newuser@test.com',
          password: 'password123',
          display_name: 'New User',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.user.email).toBe('newuser@test.com');
      expect(body.user.display_name).toBe('New User');
      expect(body.user.password_hash).toBeUndefined();
      expect(body.user.api_key).toBeUndefined();
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('rejects registration with missing fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email: 'test@test.com' },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe('All fields are required');
    });

    it('rejects invalid email format', async () => {
      const adminId = seedAdmin(testDb, 'EmailAdmin');
      const code = seedInviteCode(testDb, adminId, 'EMAIL01');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          invite_code: code,
          email: 'not-an-email',
          password: 'password123',
          display_name: 'Test',
        },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe('Invalid email format');
    });

    it('rejects short password', async () => {
      const adminId = seedAdmin(testDb, 'PwAdmin');
      const code = seedInviteCode(testDb, adminId, 'PW001');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          invite_code: code,
          email: 'short@test.com',
          password: 'short',
          display_name: 'Test',
        },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/at least 8/);
    });

    it('rejects password over 72 bytes', async () => {
      const adminId = seedAdmin(testDb, 'LongPwAdmin');
      const code = seedInviteCode(testDb, adminId, 'LONGPW01');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          invite_code: code,
          email: 'longpw@test.com',
          password: 'a'.repeat(73),
          display_name: 'Test',
        },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/72/);
    });

    it('rejects invalid invite code', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          invite_code: 'NONEXISTENT',
          email: 'test@test.com',
          password: 'password123',
          display_name: 'Test',
        },
      });
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).error).toMatch(/invite/i);
    });

    it('rejects already-used invite code', async () => {
      const adminId = seedAdmin(testDb, 'UsedAdmin');
      const code = seedInviteCode(testDb, adminId, 'USED001');
      const memberId = seedMember(testDb, 'UsedBy');
      testDb.prepare('UPDATE invite_codes SET used_by = ?, used_at = ? WHERE code = ?').run(memberId, Date.now(), code);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          invite_code: code,
          email: 'another@test.com',
          password: 'password123',
          display_name: 'Another',
        },
      });
      expect(res.statusCode).toBe(404);
    });

    it('rejects expired invite code', async () => {
      const adminId = seedAdmin(testDb, 'ExpAdmin');
      testDb.prepare('INSERT INTO invite_codes (code, created_by, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
        'EXPIRED01', adminId, Date.now(), Date.now() - 1000,
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          invite_code: 'EXPIRED01',
          email: 'expired@test.com',
          password: 'password123',
          display_name: 'Expired',
        },
      });
      expect(res.statusCode).toBe(404);
    });

    it('rejects duplicate email', async () => {
      const adminId = seedAdmin(testDb, 'DupeAdmin');
      seedInviteCode(testDb, adminId, 'DUPE001');
      testDb.prepare('INSERT INTO invite_codes (code, created_by, created_at) VALUES (?, ?, ?)').run('DUPE002', adminId, Date.now());
      testDb.prepare("INSERT INTO channels (id, name, topic, visibility, created_at, created_by) VALUES (?, ?, '', 'public', ?, ?)").run('ch-gen2', 'general', Date.now(), adminId);

      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          invite_code: 'DUPE001',
          email: 'dupe@test.com',
          password: 'password123',
          display_name: 'First',
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          invite_code: 'DUPE002',
          email: 'dupe@test.com',
          password: 'password123',
          display_name: 'Second',
        },
      });
      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body).error).toMatch(/already/i);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    const testEmail = 'login@test.com';
    const testPassword = 'loginpass123';

    beforeEach(() => {
      const hash = bcrypt.hashSync(testPassword, 10);
      testDb.prepare('INSERT INTO users (id, display_name, role, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        `login-user-${Date.now()}`, 'LoginUser', 'member', testEmail, hash, Date.now(),
      );
    });

    it('logs in with correct credentials', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: testEmail, password: testPassword },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.user.email).toBe(testEmail);
      expect(body.user.password_hash).toBeUndefined();
      expect(res.headers['set-cookie']).toContain('collab_token=');
    });

    it('rejects wrong password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: testEmail, password: 'wrongpass' },
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error).toMatch(/invalid/i);
    });

    it('rejects unknown email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'nobody@test.com', password: 'whatever' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects missing fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: testEmail },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects deleted user login', async () => {
      testDb.prepare("UPDATE users SET deleted_at = ? WHERE email = ?").run(Date.now(), testEmail);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: testEmail, password: testPassword },
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error).toBe('account_deleted');
    });

    it('rejects disabled user login', async () => {
      testDb.prepare("UPDATE users SET disabled = 1 WHERE email = ?").run(testEmail);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: testEmail, password: testPassword },
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error).toBe('account_disabled');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('clears the cookie', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['set-cookie']).toContain('Max-Age=0');
    });
  });
});
