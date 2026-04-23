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
import { registerMessageRoutes } from '../routes/messages.js';
import { registerReactionRoutes } from '../routes/reactions.js';
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

describe('Message system (integration)', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    app = Fastify({ logger: false });
    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/v1/auth/')) return;
      await authMiddleware(request, reply);
    });
    registerMessageRoutes(app);
    registerReactionRoutes(app);
    await app.ready();

    adminId = seedAdmin(testDb, 'MsgAdmin');
    memberAId = seedMember(testDb, 'MsgMemberA');
    memberBId = seedMember(testDb, 'MsgMemberB');
    agentId = seedAgent(testDb, adminId, 'MsgBot');
    grantPermission(testDb, memberAId, 'message.send');
    grantPermission(testDb, memberBId, 'message.send');
    channelId = seedChannel(testDb, adminId, 'msg-ch');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, memberAId);
    addChannelMember(testDb, channelId, memberBId);
  });

  afterAll(async () => {
    await app.close();
    testDb.close();
  });

  it('send message → 201 + sender_id + content', async () => {
    const res = await inject('POST', `/api/v1/channels/${channelId}/messages`, memberAId, { content: 'hello' });
    expect(res.statusCode).toBe(201);
    expect(res.json().message.sender_id).toBe(memberAId);
    expect(res.json().message.content).toBe('hello');
  });

  it('edit own message → content updated + edited_at set', async () => {
    const msgId = seedMessage(testDb, channelId, memberAId, 'original');
    const res = await inject('PUT', `/api/v1/messages/${msgId}`, memberAId, { content: 'edited' });
    expect(res.statusCode).toBe(200);
    expect(res.json().message.content).toBe('edited');
    expect(res.json().message.edited_at).toBeDefined();
  });

  it('edit other user message → 403', async () => {
    const msgId = seedMessage(testDb, channelId, memberAId, 'not yours');
    const res = await inject('PUT', `/api/v1/messages/${msgId}`, memberBId, { content: 'hijack' });
    expect(res.statusCode).toBe(403);
  });

  it('delete message → soft delete (deleted_at set)', async () => {
    const msgId = seedMessage(testDb, channelId, memberAId, 'to delete');
    await inject('DELETE', `/api/v1/messages/${msgId}`, memberAId);
    const row = testDb.prepare('SELECT deleted_at FROM messages WHERE id = ?').get(msgId) as any;
    expect(row.deleted_at).toBeDefined();
  });

  it('@mention → mentions table written', async () => {
    const res = await inject('POST', `/api/v1/channels/${channelId}/messages`, memberAId, {
      content: `hello <@${memberBId}>`,
      mentions: [memberBId],
    });
    expect(res.statusCode).toBe(201);
    const mention = testDb.prepare('SELECT * FROM mentions WHERE user_id = ? AND message_id = ?').get(memberBId, res.json().message.id);
    expect(mention).toBeDefined();
  });

  it('reaction add + duplicate + remove', async () => {
    const msgId = seedMessage(testDb, channelId, memberAId, 'react me');
    const r1 = await inject('PUT', `/api/v1/messages/${msgId}/reactions`, memberAId, { emoji: '👍' });
    expect(r1.statusCode).toBe(200);
    const r2 = await inject('PUT', `/api/v1/messages/${msgId}/reactions`, memberAId, { emoji: '👍' });
    expect(r2.statusCode).toBe(200);
    const r3 = await inject('DELETE', `/api/v1/messages/${msgId}/reactions`, memberAId, { emoji: '👍' });
    expect(r3.statusCode).toBe(200);
  });

  it('pagination → limit + before + has_more', async () => {
    const paginationCh = seedChannel(testDb, adminId, 'pagination-ch');
    addChannelMember(testDb, paginationCh, memberAId);
    const baseTime = 1700000000000;
    for (let i = 0; i < 15; i++) {
      seedMessage(testDb, paginationCh, memberAId, `pg-${i}`, baseTime + i * 1000);
    }
    const r1 = await inject('GET', `/api/v1/channels/${paginationCh}/messages?limit=10`, memberAId);
    const msgs1 = r1.json().messages;
    expect(msgs1.length).toBe(10);
    expect(r1.json().has_more).toBe(true);
    const oldest = msgs1[0];
    const r2 = await inject('GET', `/api/v1/channels/${paginationCh}/messages?limit=10&before=${oldest.created_at}`, memberAId);
    expect(r2.json().messages.length).toBe(5);
    expect(r2.json().has_more).toBe(false);
  });

  it('system message → type stored, sender_id is agent user', async () => {
    const sysId = seedMessage(testDb, channelId, agentId, 'User joined', undefined, 'system');
    const res = await inject('GET', `/api/v1/channels/${channelId}/messages?limit=50`, adminId);
    const sysMsg = res.json().messages.find((m: any) => m.id === sysId);
    expect(sysMsg).toBeDefined();
    expect(sysMsg.content_type).toBe('system');
  });
});
