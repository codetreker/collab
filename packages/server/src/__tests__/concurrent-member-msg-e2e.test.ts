import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedChannel,
  addChannelMember, authCookie, grantPermission, httpJson,
} from './setup.js';
import { closeWsAndWait } from './ws-helpers.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

import { buildFullApp } from './setup.js';
import type { FastifyInstance } from 'fastify';

describe('Scenario 16: Concurrent kick + message (e2e)', () => {
  let app: FastifyInstance;
  let port: number;
  let adminId: string, adminToken: string;
  let memberAId: string, memberAToken: string;
  let channelId: string;
  const wsConnections: import('ws').WebSocket[] = [];

  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    port = (app.server.address() as any).port;

    adminId = seedAdmin(testDb, 'ConcAdmin');
    memberAId = seedMember(testDb, 'ConcA');
    grantPermission(testDb, adminId, 'channel.manage_members');
    grantPermission(testDb, memberAId, 'message.send');
    adminToken = authCookie(adminId);
    memberAToken = authCookie(memberAId);

    channelId = seedChannel(testDb, adminId, 'conc-ch');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, memberAId);
  });

  afterAll(async () => {
    for (const ws of wsConnections) await closeWsAndWait(ws);
    await app.close();
    testDb.close();
  });

  it('kick + message concurrently → no 500', async () => {
    const [kickRes, msgRes] = await Promise.all([
      httpJson(port, 'DELETE', `/api/v1/channels/${channelId}/members/${memberAId}`, adminToken),
      httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, memberAToken, { content: 'race-msg' }),
    ]);
    expect(kickRes.status).not.toBe(500);
    expect(msgRes.status).not.toBe(500);
    expect([200, 201, 403, 404]).toContain(msgRes.status);
  });

  it('after concurrent ops → member is removed from channel', async () => {
    const { json } = await httpJson(port, 'GET', `/api/v1/channels/${channelId}/members`, adminToken);
    const memberIds = (json.members || json).map((m: any) => m.user_id || m.id);
    expect(memberIds).not.toContain(memberAId);
  });
});
