import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedAdmin, authCookie, makeToken } from './setup.js';
import { connectAuthWS, closeWsAndWait } from './ws-helpers.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

import { buildFullApp } from './setup.js';
import type { FastifyInstance } from 'fastify';

describe('BUG-025: WS auth cookie rename compatibility', () => {
  let app: FastifyInstance;
  let port: number;
  let adminId: string;
  const wsConnections: import('ws').WebSocket[] = [];

  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    port = (app.server.address() as any).port;

    adminId = seedAdmin(testDb, 'WsCookieAdmin');
  });

  afterAll(async () => {
    for (const ws of wsConnections) await closeWsAndWait(ws);
    await app.close();
    testDb.close();
  });

  it('accepts legacy collab_token cookies for existing browser sessions', async () => {
    const ws = await connectAuthWS(port, `collab_token=${makeToken(adminId)}`);
    wsConnections.push(ws);

    expect(ws.readyState).toBe(1);
  });

  it('prefers borgee_token when both old and new cookies are sent', async () => {
    const ws = await connectAuthWS(port, `collab_token=invalid; ${authCookie(adminId)}`);
    wsConnections.push(ws);

    expect(ws.readyState).toBe(1);
  });
});
