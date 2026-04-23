import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedChannel, seedMessage,
  addChannelMember, authCookie, grantPermission, httpJson,
} from './setup.js';
import { connectAuthWS, subscribeToChannel, collectMessages, closeWsAndWait } from './ws-helpers.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

import { buildFullApp } from './setup.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let port: number;
let adminId: string;
let memberAId: string;
let memberBId: string;
let channelId: string;

describe('Channel lifecycle (integration)', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (typeof addr === 'string' || !addr) throw new Error('unexpected address');
    port = addr.port;

    adminId = seedAdmin(testDb, 'LifeAdmin');
    memberAId = seedMember(testDb, 'LifeA');
    memberBId = seedMember(testDb, 'LifeB');
    grantPermission(testDb, memberAId, 'message.send');
    grantPermission(testDb, memberBId, 'message.send');
    channelId = seedChannel(testDb, adminId, 'life-ch');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, memberAId);
    addChannelMember(testDb, channelId, memberBId);
  });

  afterAll(async () => {
    await app.close();
    testDb.close();
  });

  it('admin creates public channel → 201', async () => {
    const r = await httpJson(port, 'POST', '/api/v1/channels', authCookie(adminId), { name: 'pub-life', visibility: 'public' });
    expect(r.status).toBe(201);
    expect(r.json.channel.visibility).toBe('public');
  });

  it('admin creates private channel → 201', async () => {
    const r = await httpJson(port, 'POST', '/api/v1/channels', authCookie(adminId), { name: 'priv-life', visibility: 'private' });
    expect(r.status).toBe(201);
    expect(r.json.channel.visibility).toBe('private');
  });

  it('member joins public channel → 200', async () => {
    const chId = seedChannel(testDb, adminId, 'join-life');
    const r = await httpJson(port, 'POST', `/api/v1/channels/${chId}/join`, authCookie(memberAId));
    expect(r.status).toBe(200);
  });

  it('member sends message → WS broadcast received by another member', async () => {
    const ws = await connectAuthWS(port, authCookie(memberBId));
    try {
      await subscribeToChannel(ws, channelId);
      const collected = collectMessages(ws, 2000);

      const r = await httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, authCookie(memberAId), { content: 'hello world' });
      expect(r.status).toBe(201);

      const msgs = await collected;
      const broadcast = msgs.find((m: any) => m.type === 'new_message' && m.message?.content === 'hello world');
      expect(broadcast).toBeDefined();
    } finally {
      await closeWsAndWait(ws);
    }
  });

  it('soft delete channel → member 403, admin 200', async () => {
    const chId = seedChannel(testDb, adminId, 'del-life');
    addChannelMember(testDb, chId, adminId);
    addChannelMember(testDb, chId, memberAId);
    const r1 = await httpJson(port, 'DELETE', `/api/v1/channels/${chId}`, authCookie(memberAId));
    expect(r1.status).toBe(403);
    const r2 = await httpJson(port, 'DELETE', `/api/v1/channels/${chId}`, authCookie(adminId));
    expect(r2.status).toBe(200);
  });

  it('public channel preview → recent messages only', async () => {
    const chId = seedChannel(testDb, adminId, 'preview-life');
    const now = Date.now();
    seedMessage(testDb, chId, adminId, 'recent', now - 3600_000);
    seedMessage(testDb, chId, adminId, 'old', now - 25 * 3600_000);
    const r = await httpJson(port, 'GET', `/api/v1/channels/${chId}/preview`, authCookie(memberBId));
    expect(r.status).toBe(200);
    expect(r.json.messages.some((m: any) => m.content === 'recent')).toBe(true);
    expect(r.json.messages.some((m: any) => m.content === 'old')).toBe(false);
  });

  it('multi-channel isolation → messages do not leak', async () => {
    const chA = seedChannel(testDb, adminId, 'iso-a');
    const chB = seedChannel(testDb, adminId, 'iso-b');
    addChannelMember(testDb, chA, adminId);
    addChannelMember(testDb, chB, adminId);
    seedMessage(testDb, chA, adminId, 'msg-in-A');
    const r = await httpJson(port, 'GET', `/api/v1/channels/${chB}/messages`, authCookie(adminId));
    const msgs = r.json.messages || [];
    expect(msgs.find((m: any) => m.content === 'msg-in-A')).toBeUndefined();
  });

  it('DM creation → only participants can see', async () => {
    const r = await httpJson(port, 'POST', `/api/v1/dm/${memberBId}`, authCookie(memberAId));
    expect(r.status).toBe(200);
    const dmChannelId = r.json.channel.id;
    const r2 = await httpJson(port, 'GET', `/api/v1/channels/${dmChannelId}`, authCookie(memberBId));
    expect(r2.status).toBe(200);
  });

  it('kick member → removed user cannot access channel', async () => {
    const chId = seedChannel(testDb, adminId, 'kick-life');
    addChannelMember(testDb, chId, adminId);
    addChannelMember(testDb, chId, memberAId);
    const r = await httpJson(port, 'DELETE', `/api/v1/channels/${chId}/members/${memberAId}`, authCookie(adminId));
    expect(r.status).toBe(200);
    const member = testDb.prepare('SELECT * FROM channel_members WHERE channel_id = ? AND user_id = ?').get(chId, memberAId);
    expect(member).toBeUndefined();
  });
});
