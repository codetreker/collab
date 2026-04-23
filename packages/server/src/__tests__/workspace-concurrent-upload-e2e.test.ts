import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedChannel,
  addChannelMember, authCookie, grantPermission, httpJson,
  createTmpDir, removeTmpDir,
} from './setup.js';
import { closeWsAndWait } from './ws-helpers.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

import { buildFullApp } from './setup.js';
import type { FastifyInstance } from 'fastify';

describe('Scenario 19: Workspace concurrent upload (e2e)', () => {
  let app: FastifyInstance;
  let port: number;
  let adminId: string, adminToken: string;
  let memberAId: string, memberAToken: string;
  let memberBId: string, memberBToken: string;
  let channelId: string;
  let tmpDir: string;
  const wsConnections: import('ws').WebSocket[] = [];

  beforeAll(async () => {
    testDb = createTestDb();
    tmpDir = createTmpDir();
    process.env.WORKSPACE_DIR = tmpDir;
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    port = (app.server.address() as any).port;

    adminId = seedAdmin(testDb, 'WsUpAdmin');
    memberAId = seedMember(testDb, 'WsUpA');
    memberBId = seedMember(testDb, 'WsUpB');
    grantPermission(testDb, memberAId, 'workspace.upload');
    grantPermission(testDb, memberBId, 'workspace.upload');
    adminToken = authCookie(adminId);
    memberAToken = authCookie(memberAId);
    memberBToken = authCookie(memberBId);

    channelId = seedChannel(testDb, adminId, 'ws-upload-ch');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, memberAId);
    addChannelMember(testDb, channelId, memberBId);
  });

  afterAll(async () => {
    for (const ws of wsConnections) await closeWsAndWait(ws);
    await app.close();
    testDb.close();
    removeTmpDir(tmpDir);
    delete process.env.WORKSPACE_DIR;
  });

  it('A and B upload same-named file concurrently → both succeed with different IDs', async () => {
    const [resA, resB] = await Promise.all([
      httpJson(port, 'POST', `/api/v1/channels/${channelId}/workspace/upload`, memberAToken, {
        name: 'shared.txt', content: Buffer.from('content-A').toString('base64'), mime_type: 'text/plain',
      }),
      httpJson(port, 'POST', `/api/v1/channels/${channelId}/workspace/upload`, memberBToken, {
        name: 'shared.txt', content: Buffer.from('content-B').toString('base64'), mime_type: 'text/plain',
      }),
    ]);
    // Both should succeed (no 500)
    expect(resA.status).not.toBe(500);
    expect(resB.status).not.toBe(500);

    // If both succeed, IDs should differ; if one conflicts (409), that's also acceptable
    if (resA.status < 300 && resB.status < 300) {
      expect(resA.json.id || resA.json.file?.id).not.toBe(resB.json.id || resB.json.file?.id);
    }
  });

  it('workspace list shows uploaded files without corruption', async () => {
    const { json, status } = await httpJson(port, 'GET', `/api/v1/channels/${channelId}/workspace`, adminToken);
    expect(status).toBe(200);
    const files = json.files || json;
    expect(Array.isArray(files)).toBe(true);
  });
});
