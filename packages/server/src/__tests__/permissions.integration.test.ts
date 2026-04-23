import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedAgent, seedChannel, seedMessage,
  grantPermission, addChannelMember, authCookie,
} from './setup.js';

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
import { registerChannelRoutes } from '../routes/channels.js';
import { registerMessageRoutes } from '../routes/messages.js';
import { registerAgentRoutes } from '../routes/agents.js';
import { authMiddleware } from '../auth.js';

let app: FastifyInstance;
let adminId: string;
let memberAId: string;
let memberBId: string;
let agentId: string;
let channelId: string;

function inject(method: string, url: string, userId?: string, payload?: unknown) {
  return app.inject({
    method: method as any,
    url,
    payload: payload as any,
    headers: userId ? { cookie: authCookie(userId) } : {},
  });
}

describe('Permissions (integration)', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    app = Fastify({ logger: false });
    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/v1/auth/')) return;
      await authMiddleware(request, reply);
    });
    registerChannelRoutes(app);
    registerMessageRoutes(app);
    registerAgentRoutes(app);
    await app.ready();

    adminId = seedAdmin(testDb, 'PermAdmin');
    memberAId = seedMember(testDb, 'PermMemberA');
    memberBId = seedMember(testDb, 'PermMemberB');
    agentId = seedAgent(testDb, adminId, 'PermBot');
    grantPermission(testDb, memberAId, 'channel.create');
    grantPermission(testDb, memberAId, 'message.send');
    grantPermission(testDb, memberAId, 'agent.manage');
    grantPermission(testDb, memberBId, 'message.send');
    channelId = seedChannel(testDb, adminId, 'perm-ch');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, memberAId);
    addChannelMember(testDb, channelId, memberBId);
  });

  afterAll(async () => {
    await app.close();
    testDb.close();
  });

  it('admin creates channel → 201', async () => {
    const res = await inject('POST', '/api/v1/channels', adminId, { name: 'admin-perm-ch' });
    expect(res.statusCode).toBe(201);
  });

  it('member without channel.create permission → 403', async () => {
    const res = await inject('POST', '/api/v1/channels', memberBId, { name: 'no-perm' });
    expect(res.statusCode).toBe(403);
  });

  it('member deletes own message → 204', async () => {
    const msgId = seedMessage(testDb, channelId, memberAId, 'my msg');
    const res = await inject('DELETE', `/api/v1/messages/${msgId}`, memberAId);
    expect(res.statusCode).toBe(204);
  });

  it('member deletes other user message → 403', async () => {
    const msgId = seedMessage(testDb, channelId, memberBId, 'not mine');
    const res = await inject('DELETE', `/api/v1/messages/${msgId}`, memberAId);
    expect(res.statusCode).toBe(403);
  });

  it('admin deletes any message → 204', async () => {
    const msgId = seedMessage(testDb, channelId, memberAId, 'admin can delete');
    const res = await inject('DELETE', `/api/v1/messages/${msgId}`, adminId);
    expect(res.statusCode).toBe(204);
  });

  it('agent owner can delete agent, non-owner gets 403', async () => {
    const res1 = await inject('DELETE', `/api/v1/agents/${agentId}`, memberAId);
    expect(res1.statusCode).toBe(403);

    const res2 = await inject('DELETE', `/api/v1/agents/${agentId}`, adminId);
    expect(res2.statusCode).toBe(200);
  });

  it('private channel messages hidden from non-member', async () => {
    const privCh = seedChannel(testDb, adminId, 'priv-vis-test', 'private');
    addChannelMember(testDb, privCh, memberAId);
    seedMessage(testDb, privCh, memberAId, 'secret msg');
    const res = await inject('GET', `/api/v1/channels/${privCh}/messages`, memberBId);
    expect(res.statusCode).toBe(404);
  });
});
