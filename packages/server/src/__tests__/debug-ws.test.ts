import { describe, it, vi, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDb, seedAdmin, seedAgent, seedChannel, addChannelMember, authCookie, grantPermission, httpJson } from './setup.js';
import { connectPluginWS, closeWsAndWait, collectMessages, sleep, waitForMessage } from './ws-helpers.js';

let testDb: Database.Database;
vi.mock('../db.js', () => ({ getDb: () => testDb, closeDb: () => {} }));
import { buildFullApp } from './setup.js';
import { pluginManager } from '../plugin-manager.js';
import { notifySSEClients } from '../routes/stream.js';

describe('debug', () => {
  let app: any, port: number;
  let adminId: string, adminToken: string;
  let agentId: string, agentApiKey: string;
  let channelId: string;

  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    port = (app.server.address() as any).port;
    adminId = seedAdmin(testDb, 'DA');
    agentId = seedAgent(testDb, adminId, 'Bot');
    const row = testDb.prepare('SELECT api_key FROM users WHERE id = ?').get(agentId) as any;
    agentApiKey = row.api_key;
    grantPermission(testDb, agentId, 'message.send');
    adminToken = authCookie(adminId);
    channelId = seedChannel(testDb, adminId, 'ch');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, agentId);
  });

  afterAll(async () => { await app.close(); testDb.close(); });

  it('spy pushEvent', async () => {
    const pushSpy = vi.spyOn(pluginManager, 'pushEvent');
    const pluginWs = await connectPluginWS(port, agentApiKey);
    
    await notifySSEClients();
    
    await httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, adminToken, {
      content: `hey <@${agentId}>`, mentions: [agentId],
    });
    
    const collectP = collectMessages(pluginWs, 1000);
    await notifySSEClients();
    const msgs = await collectP;
    
    console.log('pushEvent calls:', pushSpy.mock.calls.length);
    for (const call of pushSpy.mock.calls) {
      console.log('  ->', call[0], call[1], JSON.stringify(call[2]).slice(0, 80));
    }
    console.log('collected msgs:', msgs.length);
    
    pushSpy.mockRestore();
    await closeWsAndWait(pluginWs);
  }, 10000);
});
