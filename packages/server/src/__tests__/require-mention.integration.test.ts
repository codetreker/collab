import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedAgent, seedChannel, seedMessage,
  addChannelMember, grantPermission, authCookie,
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
import { registerAdminRoutes } from '../routes/admin.js';
import { registerMessageRoutes } from '../routes/messages.js';
import { authMiddleware } from '../auth.js';

let app: FastifyInstance;
let adminId: string;
let agentId: string;
let agentApiKey: string;
let channelId: string;

function inject(method: string, url: string, userId?: string, payload?: unknown) {
  return app.inject({
    method: method as any,
    url,
    payload: payload as any,
    headers: userId ? { cookie: authCookie(userId) } : {},
  });
}

describe('requireMention flag (integration)', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    app = Fastify({ logger: false });
    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/v1/auth/')) return;
      await authMiddleware(request, reply);
    });
    registerAdminRoutes(app);
    registerMessageRoutes(app);
    await app.ready();

    adminId = seedAdmin(testDb, 'MentionAdmin');
    agentId = seedAgent(testDb, adminId, 'MentionBot');
    const row = testDb.prepare('SELECT api_key FROM users WHERE id = ?').get(agentId) as { api_key: string };
    agentApiKey = row.api_key;
    grantPermission(testDb, adminId, 'message.send');
    channelId = seedChannel(testDb, adminId, 'mention-ch');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, agentId);
  });

  afterAll(async () => {
    await app.close();
    testDb.close();
  });

  it('agent defaults to require_mention=1', () => {
    const row = testDb.prepare('SELECT require_mention FROM users WHERE id = ?').get(agentId) as any;
    expect(row.require_mention).toBe(1);
  });

  it('admin can update require_mention via PATCH /api/v1/admin/users/:id', async () => {
    const res = await inject('PATCH', `/api/v1/admin/users/${agentId}`, adminId, { require_mention: false });
    expect(res.statusCode).toBe(200);
    const row = testDb.prepare('SELECT require_mention FROM users WHERE id = ?').get(agentId) as any;
    expect(row.require_mention).toBe(0);
  });

  it('admin can set require_mention back to true', async () => {
    const res = await inject('PATCH', `/api/v1/admin/users/${agentId}`, adminId, { require_mention: true });
    expect(res.statusCode).toBe(200);
    const row = testDb.prepare('SELECT require_mention FROM users WHERE id = ?').get(agentId) as any;
    expect(row.require_mention).toBe(1);
  });

  it('require_mention is visible in admin user list', async () => {
    const res = await inject('GET', '/api/v1/admin/users', adminId);
    expect(res.statusCode).toBe(200);
    const agent = res.json().users.find((u: any) => u.id === agentId);
    expect(agent).toBeDefined();
    expect(agent.require_mention).toBeDefined();
  });

  it('message without @mention does not create mention entry for agent', async () => {
    const res = await inject('POST', `/api/v1/channels/${channelId}/messages`, adminId, {
      content: 'hello everyone',
    });
    expect(res.statusCode).toBe(201);
    const msgId = res.json().message.id;
    const mention = testDb.prepare('SELECT * FROM mentions WHERE message_id = ? AND user_id = ?').get(msgId, agentId);
    expect(mention).toBeUndefined();
  });

  it('message with @mention creates mention entry for agent', async () => {
    const res = await inject('POST', `/api/v1/channels/${channelId}/messages`, adminId, {
      content: `hey <@${agentId}> check this`,
      mentions: [agentId],
    });
    expect(res.statusCode).toBe(201);
    const msgId = res.json().message.id;
    const mention = testDb.prepare('SELECT * FROM mentions WHERE message_id = ? AND user_id = ?').get(msgId, agentId);
    expect(mention).toBeDefined();
  });

  it('mention event is written to events table only for mentioned messages', async () => {
    const beforeCursor = (testDb.prepare('SELECT MAX(cursor) as c FROM events').get() as any)?.c ?? 0;

    await inject('POST', `/api/v1/channels/${channelId}/messages`, adminId, {
      content: 'no mention here',
    });

    const noMentionEvents = testDb.prepare(
      "SELECT * FROM events WHERE cursor > ? AND kind = 'mention' AND json_extract(payload, '$.mentioned_user_id') = ?",
    ).all(beforeCursor, agentId);
    expect(noMentionEvents).toHaveLength(0);

    await inject('POST', `/api/v1/channels/${channelId}/messages`, adminId, {
      content: `ping <@${agentId}>`,
      mentions: [agentId],
    });

    const mentionEvents = testDb.prepare(
      "SELECT * FROM events WHERE cursor > ? AND kind = 'mention' AND json_extract(payload, '$.mentioned_user_id') = ?",
    ).all(beforeCursor, agentId);
    expect(mentionEvents).toHaveLength(1);
  });
});
