import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedChannel,
  addChannelMember, seedMessage, seedInviteCode, authCookie,
} from './setup.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

import { buildFullApp } from './setup.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let port: number;

describe('Concurrency (integration)', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (typeof addr === 'string' || !addr) throw new Error('unexpected address');
    port = addr.port;
  });

  afterAll(async () => {
    await app.close();
    testDb.close();
  });

  it('invite code concurrent consumption → only 1 succeeds', async () => {
    const adminId = seedAdmin(testDb, 'ConcAdmin');
    seedInviteCode(testDb, adminId, 'CONCURRENT5');

    const attempts = Array.from({ length: 5 }, (_, i) =>
      fetch(`http://127.0.0.1:${port}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          invite_code: 'CONCURRENT5',
          email: `conc${i}@test.com`,
          password: 'password123',
          display_name: `ConcUser${i}`,
        }),
      }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })),
    );

    const results = await Promise.all(attempts);
    const successes = results.filter((r) => r.status === 201);
    const failures = results.filter((r) => r.status !== 201);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(4);
    failures.forEach((r) => {
      expect([404, 409]).toContain(r.status);
    });
  });

  it('same message concurrent edit → no data loss', async () => {
    const adminId = seedAdmin(testDb, 'EditAdmin');
    const channelId = seedChannel(testDb, adminId, 'edit-ch');
    addChannelMember(testDb, channelId, adminId);
    const msgId = seedMessage(testDb, channelId, adminId, 'original');

    const edits = Array.from({ length: 5 }, (_, i) =>
      fetch(`http://127.0.0.1:${port}/api/v1/messages/${msgId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', cookie: authCookie(adminId) },
        body: JSON.stringify({ content: `edit-${i}` }),
      }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })),
    );

    const results = await Promise.all(edits);
    const successes = results.filter((r) => r.status === 200);
    expect(successes.length).toBeGreaterThanOrEqual(1);

    const row = testDb.prepare('SELECT content, edited_at FROM messages WHERE id = ?').get(msgId) as any;
    expect(row.content).toMatch(/^edit-\d$/);
    expect(row.edited_at).toBeDefined();
  });
});
