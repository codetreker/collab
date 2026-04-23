import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedChannel,
  addChannelMember, seedMessage, seedInviteCode, authCookie,
} from './setup.js';

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

describe('Concurrency (integration)', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildFullApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    testDb.close();
  });

  it('invite code concurrent consumption → only 1 succeeds', async () => {
    const adminId = seedAdmin(testDb, 'ConcAdmin');
    seedInviteCode(testDb, adminId, 'CONCURRENT5');

    const attempts = Array.from({ length: 5 }, (_, i) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          invite_code: 'CONCURRENT5',
          email: `conc${i}@test.com`,
          password: 'password123',
          display_name: `ConcUser${i}`,
        },
      }),
    );

    const results = await Promise.all(attempts);
    const successes = results.filter((r) => r.statusCode === 201);
    const failures = results.filter((r) => r.statusCode !== 201);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(4);
    failures.forEach((r) => {
      expect([404, 409]).toContain(r.statusCode);
    });
  });

  it('same message concurrent edit → no data loss', async () => {
    const adminId = seedAdmin(testDb, 'EditAdmin');
    const channelId = seedChannel(testDb, adminId, 'edit-ch');
    addChannelMember(testDb, channelId, adminId);
    const msgId = seedMessage(testDb, channelId, adminId, 'original');

    const edits = Array.from({ length: 5 }, (_, i) =>
      app.inject({
        method: 'PUT',
        url: `/api/v1/messages/${msgId}`,
        headers: { cookie: authCookie(adminId) },
        payload: { content: `edit-${i}` },
      }),
    );

    const results = await Promise.all(edits);
    const successes = results.filter((r) => r.statusCode === 200);
    expect(successes.length).toBeGreaterThanOrEqual(1);

    const row = testDb.prepare('SELECT content, edited_at FROM messages WHERE id = ?').get(msgId) as any;
    expect(row.content).toMatch(/^edit-\d$/);
    expect(row.edited_at).toBeDefined();
  });
});
