import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedAdmin, seedMember, seedAgent, authCookie } from './setup.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

const mockGetConnection = vi.fn();
const mockRequest = vi.fn();

vi.mock('../plugin-manager.js', () => ({
  pluginManager: {
    getConnection: (...args: unknown[]) => mockGetConnection(...args),
    request: (...args: unknown[]) => mockRequest(...args),
  },
}));

vi.mock('../ws.js', () => ({
  broadcastToChannel: vi.fn(),
  broadcastToUser: vi.fn(),
  broadcastToAll: vi.fn(),
  getOnlineUserIds: vi.fn(() => []),
  unsubscribeUserFromChannel: vi.fn(),
}));

import Fastify, { type FastifyInstance } from 'fastify';
import { registerAgentRoutes } from '../routes/agents.js';
import { authMiddleware } from '../auth.js';

let app: FastifyInstance;

function inject(method: string, url: string, userId?: string) {
  return app.inject({
    method: method as 'GET',
    url,
    headers: userId ? { cookie: authCookie(userId) } : {},
  });
}

describe('GET /api/v1/agents/:id/files', () => {
  let adminId: string;
  let memberId: string;
  let agentId: string;

  beforeAll(async () => {
    testDb = createTestDb();
    app = Fastify({ logger: false });
    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/v1/auth/')) return;
      await authMiddleware(request, reply);
    });
    registerAgentRoutes(app);
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    testDb.exec('DELETE FROM user_permissions');
    testDb.exec('DELETE FROM users');
    adminId = seedAdmin(testDb, 'Admin');
    memberId = seedMember(testDb, 'Member');
    agentId = seedAgent(testDb, memberId, 'Bot');
    mockGetConnection.mockReset();
    mockRequest.mockReset();
  });

  it('returns 401 without auth', async () => {
    const res = await inject('GET', `/api/v1/agents/${agentId}/files?path=/test.ts`);
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 without path param', async () => {
    const res = await inject('GET', `/api/v1/agents/${agentId}/files`, memberId);
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for non-agent user', async () => {
    const res = await inject('GET', `/api/v1/agents/${memberId}/files?path=/test.ts`, memberId);
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 for non-owner', async () => {
    const res = await inject('GET', `/api/v1/agents/${agentId}/files?path=/test.ts`, adminId);
    expect(res.statusCode).toBe(403);
  });

  it('returns 503 when plugin offline', async () => {
    mockGetConnection.mockReturnValue(undefined);
    const res = await inject('GET', `/api/v1/agents/${agentId}/files?path=/test.ts`, memberId);
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('agent_offline');
  });

  it('returns file content on success', async () => {
    mockGetConnection.mockReturnValue({ ws: { readyState: 1 }, agentId });
    mockRequest.mockResolvedValue({ content: 'hello', size: 5, mime_type: 'text/plain' });

    const res = await inject('GET', `/api/v1/agents/${agentId}/files?path=/workspace/test.ts`, memberId);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ content: 'hello', size: 5, mime_type: 'text/plain' });
  });

  it('returns 403 for path_not_allowed', async () => {
    mockGetConnection.mockReturnValue({ ws: { readyState: 1 }, agentId });
    mockRequest.mockResolvedValue({ error: 'path_not_allowed' });

    const res = await inject('GET', `/api/v1/agents/${agentId}/files?path=/etc/passwd`, memberId);
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('path_not_allowed');
  });

  it('returns 404 for file_not_found', async () => {
    mockGetConnection.mockReturnValue({ ws: { readyState: 1 }, agentId });
    mockRequest.mockResolvedValue({ error: 'file_not_found' });

    const res = await inject('GET', `/api/v1/agents/${agentId}/files?path=/workspace/nope.ts`, memberId);
    expect(res.statusCode).toBe(404);
  });

  it('returns 413 for file_too_large', async () => {
    mockGetConnection.mockReturnValue({ ws: { readyState: 1 }, agentId });
    mockRequest.mockResolvedValue({ error: 'file_too_large' });

    const res = await inject('GET', `/api/v1/agents/${agentId}/files?path=/workspace/big.bin`, memberId);
    expect(res.statusCode).toBe(413);
  });

  it('returns 504 on timeout', async () => {
    mockGetConnection.mockReturnValue({ ws: { readyState: 1 }, agentId });
    mockRequest.mockRejectedValue(new Error('Request req_xxx timed out after 10000ms'));

    const res = await inject('GET', `/api/v1/agents/${agentId}/files?path=/workspace/slow.ts`, memberId);
    expect(res.statusCode).toBe(504);
    expect(res.json().error).toBe('timeout');
  });
});
