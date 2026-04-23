import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedChannel,
  addChannelMember, authCookie, grantPermission, httpJson, createTmpDir, removeTmpDir,
} from './setup.js';

let testDb: Database.Database;

vi.mock('../db.js', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

import { buildFullApp } from './setup.js';
import type { FastifyInstance } from 'fastify';

describe('Scenario 6: Workspace message attachment + download (e2e)', () => {
  let app: FastifyInstance;
  let port: number;
  let adminId: string, adminToken: string;
  let memberAId: string, memberAToken: string;
  let channelId: string;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = createTmpDir('ws-msg-');
    process.env.WORKSPACE_DIR = tmpDir;
    testDb = createTestDb();
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    port = (app.server.address() as any).port;

    adminId = seedAdmin(testDb, 'WsAdmin');
    memberAId = seedMember(testDb, 'WsMemberA');
    grantPermission(testDb, memberAId, 'message.send');
    adminToken = authCookie(adminId);
    memberAToken = authCookie(memberAId);
    channelId = seedChannel(testDb, adminId, 'ws-msg-ch');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, memberAId);
  });

  afterAll(async () => {
    await app.close();
    testDb.close();
    delete process.env.WORKSPACE_DIR;
    removeTmpDir(tmpDir);
  });

  it('upload file → send message referencing it → download content matches', async () => {
    const fileContent = 'report data for e2e test';
    const boundary = '----FormBoundary' + Date.now();
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="report.txt"',
      'Content-Type: text/plain',
      '',
      fileContent,
      `--${boundary}--`,
    ].join('\r\n');

    const uploadRes = await fetch(`http://127.0.0.1:${port}/api/v1/channels/${channelId}/workspace/upload`, {
      method: 'POST',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        cookie: memberAToken,
      },
      body,
    });
    expect(uploadRes.status).toBe(201);
    const uploadJson = await uploadRes.json() as any;
    const fileId = uploadJson.file.id;
    expect(fileId).toBeDefined();

    // Send message referencing the file
    const { json: msgJson, status: msgStatus } = await httpJson(port, 'POST', `/api/v1/channels/${channelId}/messages`, memberAToken, {
      content: `See attached file: ${fileId}`,
    });
    expect(msgStatus).toBe(201);
    expect(msgJson.message.content).toContain(fileId);

    // Download and verify content matches
    const dlRes = await fetch(`http://127.0.0.1:${port}/api/v1/channels/${channelId}/workspace/files/${fileId}`, {
      headers: { cookie: memberAToken },
    });
    expect(dlRes.status).toBe(200);
    const dlText = await dlRes.text();
    expect(dlText).toBe(fileContent);
  });
});
