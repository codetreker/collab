import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedChannel,
  addChannelMember, authCookie, httpJson,
} from './setup.js';
import { connectWS, closeWsAndWait, sleep } from './ws-helpers.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

import { buildFullApp } from './setup.js';
import type { FastifyInstance } from 'fastify';

describe('Scenario 5: Remote Explorer composite lifecycle (e2e)', () => {
  let app: FastifyInstance;
  let port: number;
  let adminId: string, adminToken: string;
  let channelId: string;
  const wsConnections: import('ws').WebSocket[] = [];

  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    port = (app.server.address() as any).port;

    adminId = seedAdmin(testDb, 'RemoteAdmin');
    adminToken = authCookie(adminId);
    channelId = seedChannel(testDb, adminId, 'remote-ch');
    addChannelMember(testDb, channelId, adminId);
  });

  afterAll(async () => {
    for (const ws of wsConnections) await closeWsAndWait(ws);
    await app.close();
    testDb.close();
  });

  it('register → WS connect → ls → read → disconnect 503 → reconnect → read again', async () => {
    // Step 1: Register node
    const { json: regJson, status: regStatus } = await httpJson(port, 'POST', '/api/v1/remote/nodes', adminToken, {
      machine_name: 'lifecycle-machine',
    });
    expect(regStatus).toBe(201);
    const nodeId = regJson.node.id;
    const nodeToken = regJson.node.connection_token;

    // Step 2: Connect remote agent WS
    const agentWs = await connectWS(port, '/ws/remote', { headers: { authorization: `Bearer ${nodeToken}` } });
    wsConnections.push(agentWs);
    expect(agentWs.readyState).toBe(1);

    // Step 3: Set up agent to respond to ls and read requests
    // Server sends { type: 'request', id, data: { action, path } }
    // Agent must reply { type: 'response', id, data: { ... } }
    agentWs.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== 'request') return;
      const action = msg.data?.action;
      if (action === 'ls') {
        agentWs.send(JSON.stringify({
          type: 'response', id: msg.id,
          data: { entries: [{ name: 'file.txt', type: 'file', size: 100 }, { name: 'sub', type: 'directory', size: 0 }] },
        }));
      }
      if (action === 'read') {
        agentWs.send(JSON.stringify({
          type: 'response', id: msg.id,
          data: { content: 'hello world', size: 11, mime_type: 'text/plain' },
        }));
      }
    });

    await sleep(100);

    // Step 4: List directory
    const { status: lsStatus, json: lsJson } = await httpJson(port, 'GET', `/api/v1/remote/nodes/${nodeId}/ls?path=/`, adminToken);
    expect(lsStatus).toBe(200);
    expect(lsJson.entries).toHaveLength(2);

    // Step 5: Read file
    const { status: readStatus, json: readJson } = await httpJson(port, 'GET', `/api/v1/remote/nodes/${nodeId}/read?path=/file.txt`, adminToken);
    expect(readStatus).toBe(200);
    expect(readJson.content).toBe('hello world');

    // Step 6: Disconnect → 503
    await closeWsAndWait(agentWs);
    await sleep(100);
    const { status: offlineStatus } = await httpJson(port, 'GET', `/api/v1/remote/nodes/${nodeId}/read?path=/file.txt`, adminToken);
    expect(offlineStatus).toBe(503);

    // Step 7: Reconnect → read succeeds
    const agentWs2 = await connectWS(port, '/ws/remote', { headers: { authorization: `Bearer ${nodeToken}` } });
    wsConnections.push(agentWs2);
    agentWs2.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'request' && msg.data?.action === 'read') {
        agentWs2.send(JSON.stringify({
          type: 'response', id: msg.id,
          data: { content: 'hello again', size: 11, mime_type: 'text/plain' },
        }));
      }
    });
    await sleep(100);

    const { status: reconnectStatus, json: reconnectJson } = await httpJson(port, 'GET', `/api/v1/remote/nodes/${nodeId}/read?path=/file.txt`, adminToken);
    expect(reconnectStatus).toBe(200);
    expect(reconnectJson.content).toBe('hello again');
  }, 15000);
});
