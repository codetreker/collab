import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedChannel,
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

describe('Scenario 15: Rapid-fire operations (e2e)', () => {
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

    adminId = seedAdmin(testDb, 'RapidAdmin');
    memberAId = seedMember(testDb, 'RapidA');
    grantPermission(testDb, memberAId, 'message.send');
    adminToken = authCookie(adminId);
    memberAToken = authCookie(memberAId);

    channelId = seedChannel(testDb, adminId, 'rapid-ch');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, memberAId);
  });

  afterAll(async () => {
    for (const ws of wsConnections) await closeWsAndWait(ws);
    await app.close();
    testDb.close();
  });

  it('5 concurrent messages → all stored in DB', async () => {
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, memberAToken, { content: `rapid-${i}` }));
    }
    const results = await Promise.all(promises);
    expect(results.every(r => r.status === 200 || r.status === 201)).toBe(true);

    const { json } = await httpJson(port, 'GET', `/api/v1/channels/${channelId}/messages?limit=20`, adminToken);
    const rapidMsgs = json.messages.filter((m: any) => m.content.startsWith('rapid-'));
    expect(rapidMsgs).toHaveLength(5);
  });

  it('5 sequential messages → WS receives all in order', async () => {
    const ws = await connectAuthWS(port, adminToken);
    await subscribeToChannel(ws, channelId);
    wsConnections.push(ws);

    const collected: any[] = [];
    const handler = (raw: Buffer | string) => {
      collected.push(JSON.parse(raw.toString()));
    };
    ws.on('message', handler);

    for (let i = 0; i < 5; i++) {
      await httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, memberAToken, { content: `seq-${i}` });
    }

    const { sleep } = await import('./ws-helpers.js');
    await sleep(2000);
    ws.removeListener('message', handler);

    const seqMsgs = collected.filter(m => m.type === 'new_message' && m.message?.content?.startsWith('seq-'));
    expect(seqMsgs).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(seqMsgs[i].message.content).toBe(`seq-${i}`);
    }
  });
});
