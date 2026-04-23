import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedAgent, seedChannel,
  addChannelMember, authCookie, grantPermission, httpJson,
} from './setup.js';
import { connectAuthWS, connectPluginWS, subscribeToChannel, waitForMessage, collectMessages, closeWsAndWait, sleep } from './ws-helpers.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

import { buildFullApp } from './setup.js';
import type { FastifyInstance } from 'fastify';

describe('Scenario 2: Agent-Human round-trip (e2e)', () => {
  let app: FastifyInstance;
  let port: number;
  let adminId: string, adminToken: string;
  let agentId: string, agentApiKey: string;
  let channelId: string;
  const wsConnections: import('ws').WebSocket[] = [];

  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    port = (app.server.address() as any).port;

    adminId = seedAdmin(testDb, 'AgentAdmin');
    agentId = seedAgent(testDb, adminId, 'AgentBot');
    const row = testDb.prepare('SELECT api_key FROM users WHERE id = ?').get(agentId) as { api_key: string };
    agentApiKey = row.api_key;
    grantPermission(testDb, agentId, 'message.send');
    adminToken = authCookie(adminId);
    channelId = seedChannel(testDb, adminId, 'agent-ch');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, agentId);
  });

  afterAll(async () => {
    for (const ws of wsConnections) await closeWsAndWait(ws);
    await app.close();
    testDb.close();
  });

  it('Human @agent message → Plugin WS receives message + mention events', async () => {
    const pluginWs = await connectPluginWS(port, agentApiKey);
    wsConnections.push(pluginWs);

    // Post a warm-up message to initialize the plugin event cursor
    await httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, adminToken, { content: 'warmup' });
    await sleep(500);

    const msgPromise = waitForMessage(pluginWs, (m) => m.type === 'event' && m.event === 'message' && m.data?.content?.includes(agentId));
    const mentionPromise = waitForMessage(pluginWs, (m) => m.type === 'event' && m.event === 'mention');

    await httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, adminToken, {
      content: `hey <@${agentId}>`, mentions: [agentId],
    });

    const msgEvent = await msgPromise;
    expect(msgEvent.data.content).toContain(agentId);

    const mentionEvent = await mentionPromise;
    expect(mentionEvent.data.mentioned_user_id).toBe(agentId);
  }, 10000);

  it('Agent replies via api_request → Human WS receives new_message', async () => {
    const humanWs = await connectAuthWS(port, adminToken);
    await subscribeToChannel(humanWs, channelId);
    wsConnections.push(humanWs);

    const pluginWs = await connectPluginWS(port, agentApiKey);
    wsConnections.push(pluginWs);

    const humanMsgPromise = waitForMessage(humanWs, (m) => m.type === 'new_message' && m.message?.content === 'bot reply');
    const apiResPromise = waitForMessage(pluginWs, (m) => m.type === 'api_response' && m.id === 'reply-1');

    pluginWs.send(JSON.stringify({
      type: 'api_request',
      id: 'reply-1',
      data: {
        method: 'POST',
        path: `/api/v1/channels/${channelId}/messages`,
        body: { content: 'bot reply' },
      },
    }));

    const apiRes = await apiResPromise;
    expect(apiRes.data.status).toBe(201);

    const event = await humanMsgPromise;
    expect(event.message.sender_id).toBe(agentId);
  });

  it('Message without @agent → message event but no mention event', async () => {
    const pluginWs = await connectPluginWS(port, agentApiKey);
    wsConnections.push(pluginWs);

    await httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, adminToken, { content: 'no mention here' });

    const msgs = await collectMessages(pluginWs, 2000);
    const mentionEvents = msgs.filter(m => m.type === 'event' && m.event === 'mention');
    expect(mentionEvents).toHaveLength(0);
  });
});
