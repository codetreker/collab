import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedAgent, seedChannel,
  addChannelMember, authCookie,
} from './setup.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

vi.mock('../ws.js', () => ({
  broadcastToChannel: vi.fn(),
  broadcastToUser: vi.fn(),
  broadcastToAll: vi.fn(),
  getOnlineUserIds: vi.fn(() => []),
  unsubscribeUserFromChannel: vi.fn(),
}));

import Fastify, { type FastifyInstance } from 'fastify';
import { registerCommandRoutes } from '../routes/commands.js';
import { authMiddleware } from '../auth.js';
import { commandStore } from '../command-store.js';

let app: FastifyInstance;

function inject(method: string, url: string, userId?: string) {
  return app.inject({
    method: method as any,
    url,
    headers: userId ? { cookie: authCookie(userId) } : {},
  });
}

describe('Commands API', () => {
  let adminId: string;
  let agentId: string;

  beforeAll(async () => {
    testDb = createTestDb();
    app = Fastify({ logger: false });
    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/v1/auth/')) return;
      await authMiddleware(request, reply);
    });
    registerCommandRoutes(app);
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    testDb.exec('DELETE FROM channel_members');
    testDb.exec('DELETE FROM channels');
    testDb.exec('DELETE FROM users');
    // Clear command store
    for (const connId of ['conn-api-a', 'conn-api-b']) {
      commandStore.unregisterByConnection(connId);
    }
  });

  it('GET /api/v1/commands returns builtin + agent structure', () => {
    adminId = seedAdmin(testDb);
    agentId = seedAgent(testDb, adminId, 'TestBot');

    commandStore.register(agentId, 'conn-api-a', [
      { name: 'deploy', description: 'Deploy', usage: '/deploy', params: [] },
    ], new Set(['help', 'leave', 'topic', 'invite', 'dm', 'status', 'clear', 'nick']));

    return inject('GET', '/api/v1/commands', adminId).then((res) => {
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.builtin).toBeDefined();
      expect(body.builtin.length).toBeGreaterThan(0);
      expect(body.agent).toBeDefined();
      expect(body.agent).toHaveLength(1);
      expect(body.agent[0].agent_id).toBe(agentId);
      expect(body.agent[0].commands[0].name).toBe('deploy');
    });
  });

  it('no agent commands → agent is empty array', () => {
    adminId = seedAdmin(testDb);
    return inject('GET', '/api/v1/commands', adminId).then((res) => {
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.agent).toEqual([]);
    });
  });

  it('requires auth (401 when unauthenticated)', () => {
    return inject('GET', '/api/v1/commands').then((res) => {
      expect(res.statusCode).toBe(401);
    });
  });
});
