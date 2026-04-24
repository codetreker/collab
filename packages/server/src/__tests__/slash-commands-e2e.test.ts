import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedAgent, seedChannel,
  addChannelMember, authCookie, grantPermission, httpJson,
} from './setup.js';
import { connectAuthWS, connectWS, subscribeToChannel, waitForMessage, closeWsAndWait, sleep, collectMessages } from './ws-helpers.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

import { buildFullApp } from './setup.js';
import type { FastifyInstance } from 'fastify';

describe('Slash Commands E2E', () => {
  let app: FastifyInstance;
  let port: number;
  let adminId: string, adminToken: string;
  let memberAId: string, memberAToken: string;
  let agentId: string, agentApiKey: string;
  let channelId: string;
  const wsConnections: import('ws').WebSocket[] = [];

  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    port = (app.server.address() as any).port;

    adminId = seedAdmin(testDb, 'CmdAdmin');
    memberAId = seedMember(testDb, 'CmdMemberA');
    grantPermission(testDb, adminId, 'message.send');
    grantPermission(testDb, memberAId, 'message.send');
    adminToken = authCookie(adminId);
    memberAToken = authCookie(memberAId);

    agentId = seedAgent(testDb, adminId, 'CmdBot');
    grantPermission(testDb, agentId, 'message.send');
    const row = testDb.prepare('SELECT api_key FROM users WHERE id = ?').get(agentId) as { api_key: string };
    agentApiKey = row.api_key;

    channelId = seedChannel(testDb, adminId, 'cmd-e2e');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, memberAId);
    addChannelMember(testDb, channelId, agentId);
  });

  afterAll(async () => {
    for (const ws of wsConnections) await closeWsAndWait(ws);
    await app.close();
    testDb.close();
  });

  it('full flow: register → broadcast → API includes → command message → agent receives → reply', { timeout: 15000 }, async () => {
    // Agent connects via WS
    const agentWs = await connectWS(port, '/ws', { headers: { authorization: `Bearer ${agentApiKey}` } });
    wsConnections.push(agentWs);
    agentWs.send(JSON.stringify({ type: 'ping' }));
    await waitForMessage(agentWs, (m) => m.type === 'pong');

    // User connects
    const userWs = await connectAuthWS(port, adminToken);
    wsConnections.push(userWs);
    await subscribeToChannel(userWs, channelId);

    // Agent subscribes to channel
    agentWs.send(JSON.stringify({ type: 'subscribe', channel_id: channelId }));
    await waitForMessage(agentWs, (m) => m.type === 'subscribed');

    // Listen for commands_updated broadcast on user WS
    const updatedPromise = waitForMessage(userWs, (m) => m.type === 'commands_updated');

    // Agent registers commands
    agentWs.send(JSON.stringify({
      type: 'register_commands',
      commands: [{ name: 'deploy', description: 'Deploy app', usage: '/deploy', params: [] }],
    }));

    const regResult = await waitForMessage(agentWs, (m) => m.type === 'commands_registered');
    expect(regResult.registered).toHaveLength(1);
    expect(regResult.skipped).toHaveLength(0);

    // User receives commands_updated
    await updatedPromise;

    // GET /api/v1/commands includes the new command
    const { json } = await httpJson(port, 'GET', '/api/v1/commands', adminToken);
    expect(json.agent.length).toBeGreaterThanOrEqual(1);
    const botGroup = json.agent.find((a: any) => a.agent_id === agentId);
    expect(botGroup).toBeDefined();
    expect(botGroup.commands[0].name).toBe('deploy');

    // User sends command message targeting the agent
    const agentMsgPromise = waitForMessage(agentWs, (m) => m.type === 'new_message' && m.message?.content_type === 'command');
    const commandContent = JSON.stringify({ command: 'deploy', params: [] });
    userWs.send(JSON.stringify({
      type: 'send_message',
      channel_id: channelId,
      content: commandContent,
      content_type: 'command',
      mentions: [agentId],
    }));
    await waitForMessage(userWs, (m) => m.type === 'message_ack');

    // Agent receives the command message
    const cmdMsg = await agentMsgPromise;
    expect(cmdMsg.message.content_type).toBe('command');

    // Agent replies with reply_to_id
    const replyPromise = waitForMessage(userWs, (m) => m.type === 'new_message' && m.message?.reply_to_id === cmdMsg.message.id);
    agentWs.send(JSON.stringify({
      type: 'send_message',
      channel_id: channelId,
      content: 'Deployed successfully!',
      reply_to_id: cmdMsg.message.id,
    }));
    const replyEvent = await replyPromise;
    expect(replyEvent.message.content).toBe('Deployed successfully!');
    expect(replyEvent.message.reply_to_id).toBe(cmdMsg.message.id);
  });

  it('WS disconnect → commands auto-cleared → commands_updated broadcast', async () => {
    const agentWs = await connectWS(port, '/ws', { headers: { authorization: `Bearer ${agentApiKey}` } });
    agentWs.send(JSON.stringify({ type: 'ping' }));
    await waitForMessage(agentWs, (m) => m.type === 'pong');

    const userWs = await connectAuthWS(port, adminToken);
    wsConnections.push(userWs);

    // Register commands
    agentWs.send(JSON.stringify({
      type: 'register_commands',
      commands: [{ name: 'cleanup-test', description: 'Test', usage: '/cleanup-test', params: [] }],
    }));
    await waitForMessage(agentWs, (m) => m.type === 'commands_registered');
    // Drain the commands_updated from registration
    await waitForMessage(userWs, (m) => m.type === 'commands_updated');

    // Disconnect agent - should trigger commands_updated
    const clearPromise = waitForMessage(userWs, (m) => m.type === 'commands_updated');
    agentWs.close();
    await clearPromise;
  });

  it('non-agent role sends register_commands → rejected', async () => {
    const memberWs = await connectAuthWS(port, memberAToken);
    wsConnections.push(memberWs);

    memberWs.send(JSON.stringify({
      type: 'register_commands',
      commands: [{ name: 'hack', description: 'no', usage: '/hack', params: [] }],
    }));

    const err = await waitForMessage(memberWs, (m) => m.type === 'error');
    expect(err.message).toMatch(/only agents/i);
  });

  it('same agent multiple connections: independent register/clear', async () => {
    const ws1 = await connectWS(port, '/ws', { headers: { authorization: `Bearer ${agentApiKey}` } });
    wsConnections.push(ws1);
    ws1.send(JSON.stringify({ type: 'ping' }));
    await waitForMessage(ws1, (m) => m.type === 'pong');

    const ws2 = await connectWS(port, '/ws', { headers: { authorization: `Bearer ${agentApiKey}` } });
    wsConnections.push(ws2);
    ws2.send(JSON.stringify({ type: 'ping' }));
    await waitForMessage(ws2, (m) => m.type === 'pong');

    // Each connection registers different commands
    ws1.send(JSON.stringify({
      type: 'register_commands',
      commands: [{ name: 'cmd-a', description: 'A', usage: '/cmd-a', params: [] }],
    }));
    await waitForMessage(ws1, (m) => m.type === 'commands_registered');

    ws2.send(JSON.stringify({
      type: 'register_commands',
      commands: [{ name: 'cmd-b', description: 'B', usage: '/cmd-b', params: [] }],
    }));
    await waitForMessage(ws2, (m) => m.type === 'commands_registered');

    // API should show both
    let { json } = await httpJson(port, 'GET', '/api/v1/commands', adminToken);
    const botCmds = json.agent.filter((a: any) => a.agent_id === agentId).flatMap((a: any) => a.commands);
    expect(botCmds.length).toBeGreaterThanOrEqual(2);

    // Close ws1 → only cmd-a removed
    const userWs = await connectAuthWS(port, adminToken);
    wsConnections.push(userWs);
    const updPromise = waitForMessage(userWs, (m) => m.type === 'commands_updated');
    ws1.close();
    await updPromise;
    await sleep(100);

    ({ json } = await httpJson(port, 'GET', '/api/v1/commands', adminToken));
    const remaining = json.agent.filter((a: any) => a.agent_id === agentId).flatMap((a: any) => a.commands);
    expect(remaining.some((c: any) => c.name === 'cmd-b')).toBe(true);
    expect(remaining.some((c: any) => c.name === 'cmd-a')).toBe(false);
  });

  it('101 commands → error', async () => {
    const agentWs = await connectWS(port, '/ws', { headers: { authorization: `Bearer ${agentApiKey}` } });
    wsConnections.push(agentWs);
    agentWs.send(JSON.stringify({ type: 'ping' }));
    await waitForMessage(agentWs, (m) => m.type === 'pong');

    const commands = Array.from({ length: 101 }, (_, i) => ({
      name: `cmd${i}`, description: `Cmd ${i}`, usage: `/cmd${i}`, params: [],
    }));

    agentWs.send(JSON.stringify({ type: 'register_commands', commands }));
    const err = await waitForMessage(agentWs, (m) => m.type === 'error');
    expect(err.message).toMatch(/too many/i);
  });
});
