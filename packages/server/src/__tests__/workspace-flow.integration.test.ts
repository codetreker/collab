import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedChannel,
  addChannelMember, authCookie,
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
import fastifyMultipart from '@fastify/multipart';
import { registerWorkspaceRoutes } from '../routes/workspace.js';
import { authMiddleware } from '../auth.js';

let app: FastifyInstance;
let adminId: string;
let memberAId: string;
let memberBId: string;
let channelId: string;

function inject(method: string, url: string, userId?: string, payload?: unknown) {
  return app.inject({
    method: method as any,
    url,
    payload: payload as any,
    headers: userId ? { cookie: authCookie(userId) } : {},
  });
}

function uploadFile(url: string, userId: string, filename: string, content: Buffer | string) {
  const boundary = '----TestBoundary';
  const buf = typeof content === 'string' ? Buffer.from(content) : content;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    buf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return app.inject({
    method: 'POST',
    url,
    headers: {
      cookie: authCookie(userId),
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: body,
  });
}

describe('Workspace flow (integration)', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    app = Fastify({ logger: false });
    await app.register(fastifyMultipart, { limits: { fileSize: 10 * 1024 * 1024 } });
    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/v1/auth/')) return;
      await authMiddleware(request, reply);
    });
    registerWorkspaceRoutes(app);
    await app.ready();

    adminId = seedAdmin(testDb, 'WsAdmin');
    memberAId = seedMember(testDb, 'WsMemberA');
    memberBId = seedMember(testDb, 'WsMemberB');
    channelId = seedChannel(testDb, adminId, 'ws-ch');
    addChannelMember(testDb, channelId, adminId);
    addChannelMember(testDb, channelId, memberAId);
    addChannelMember(testDb, channelId, memberBId);
  });

  afterAll(async () => {
    await app.close();
    testDb.close();
  });

  let uploadedFileId: string;

  it('upload file → 201 + file metadata', async () => {
    const res = await uploadFile(
      `/api/v1/channels/${channelId}/workspace/upload`,
      memberAId, 'test.txt', 'hello',
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().file.name).toBe('test.txt');
    uploadedFileId = res.json().file.id;
  });

  it('list files → user isolation (memberA sees own, memberB sees none)', async () => {
    const r1 = await inject('GET', `/api/v1/channels/${channelId}/workspace`, memberAId);
    expect(r1.json().files.length).toBeGreaterThan(0);
    const r2 = await inject('GET', `/api/v1/channels/${channelId}/workspace`, memberBId);
    expect(r2.json().files.length).toBe(0);
  });

  it('rename file → 200 + new name', async () => {
    const res = await inject('PATCH', `/api/v1/channels/${channelId}/workspace/files/${uploadedFileId}`, memberAId, { name: 'renamed.txt' });
    expect(res.statusCode).toBe(200);
    expect(res.json().file.name).toBe('renamed.txt');
  });

  it('duplicate filename → auto-resolved', async () => {
    await uploadFile(
      `/api/v1/channels/${channelId}/workspace/upload`,
      memberAId, 'dup.txt', 'a',
    );
    const res = await uploadFile(
      `/api/v1/channels/${channelId}/workspace/upload`,
      memberAId, 'dup.txt', 'b',
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().file.name).not.toBe('dup.txt');
  });

  it('mkdir + nested mkdir + delete folder', async () => {
    const r1 = await inject('POST', `/api/v1/channels/${channelId}/workspace/mkdir`, memberAId, { name: 'docs' });
    expect(r1.statusCode).toBe(201);
    const folderId = r1.json().file.id;

    const r2 = await inject('POST', `/api/v1/channels/${channelId}/workspace/mkdir`, memberAId, { name: 'sub', parentId: folderId });
    expect(r2.statusCode).toBe(201);

    const r3 = await inject('DELETE', `/api/v1/channels/${channelId}/workspace/files/${folderId}`, memberAId);
    expect(r3.statusCode).toBe(204);
  });

  it.skip('10MB size limit → requires real HTTP server to test streaming limit', () => {});

  it('download file → 200 + correct content', async () => {
    const upRes = await uploadFile(
      `/api/v1/channels/${channelId}/workspace/upload`,
      memberAId, 'download-me.txt', 'download content',
    );
    const fId = upRes.json().file.id;
    const res = await inject('GET', `/api/v1/channels/${channelId}/workspace/files/${fId}`, memberAId);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('download content');
  });

  it('move file to folder → 200 + parent_id updated', async () => {
    const folderRes = await inject('POST', `/api/v1/channels/${channelId}/workspace/mkdir`, memberAId, { name: 'target-folder' });
    const folderId = folderRes.json().file.id;

    const upRes = await uploadFile(
      `/api/v1/channels/${channelId}/workspace/upload`,
      memberAId, 'move-me.txt', 'move',
    );
    const fileId = upRes.json().file.id;

    const res = await inject('POST', `/api/v1/channels/${channelId}/workspace/files/${fileId}/move`, memberAId, { parentId: folderId });
    expect(res.statusCode).toBe(200);
    expect(res.json().file.parent_id).toBe(folderId);
  });

  it('delete file → 204 + removed from list', async () => {
    const upRes = await uploadFile(
      `/api/v1/channels/${channelId}/workspace/upload`,
      memberAId, 'delete-me.txt', 'delete',
    );
    const fId = upRes.json().file.id;
    const res = await inject('DELETE', `/api/v1/channels/${channelId}/workspace/files/${fId}`, memberAId);
    expect(res.statusCode).toBe(204);
    const file = testDb.prepare('SELECT * FROM workspace_files WHERE id = ?').get(fId);
    expect(file).toBeUndefined();
  });
});
