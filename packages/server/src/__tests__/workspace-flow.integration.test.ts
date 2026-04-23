import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedMember, seedChannel,
  addChannelMember, authCookie, httpJson,
} from './setup.js';

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

function uploadFile(chId: string, userId: string, filename: string, content: string) {
  const form = new FormData();
  form.append('file', new Blob([content]), filename);
  return fetch(`http://127.0.0.1:${port}/api/v1/channels/${chId}/workspace/upload`, {
    method: 'POST',
    headers: { cookie: authCookie(userId) },
    body: form,
  });
}

describe('Workspace flow (integration)', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    app = await buildFullApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (typeof addr === 'string' || !addr) throw new Error('unexpected address');
    port = addr.port;

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
    const res = await uploadFile(channelId, memberAId, 'test.txt', 'hello');
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.file.name).toBe('test.txt');
    uploadedFileId = body.file.id;
  });

  it('list files → user isolation (memberA sees own, memberB sees none)', async () => {
    const r1 = await httpJson(port, 'GET', `/api/v1/channels/${channelId}/workspace`, authCookie(memberAId));
    expect(r1.json.files.length).toBeGreaterThan(0);
    const r2 = await httpJson(port, 'GET', `/api/v1/channels/${channelId}/workspace`, authCookie(memberBId));
    expect(r2.json.files.length).toBe(0);
  });

  it('rename file → 200 + new name', async () => {
    const r = await httpJson(port, 'PATCH', `/api/v1/channels/${channelId}/workspace/files/${uploadedFileId}`, authCookie(memberAId), { name: 'renamed.txt' });
    expect(r.status).toBe(200);
    expect(r.json.file.name).toBe('renamed.txt');
  });

  it('duplicate filename → auto-resolved', async () => {
    await uploadFile(channelId, memberAId, 'dup.txt', 'a');
    const res = await uploadFile(channelId, memberAId, 'dup.txt', 'b');
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.file.name).not.toBe('dup.txt');
  });

  it('mkdir + nested mkdir + delete folder', async () => {
    const r1 = await httpJson(port, 'POST', `/api/v1/channels/${channelId}/workspace/mkdir`, authCookie(memberAId), { name: 'docs' });
    expect(r1.status).toBe(201);
    const folderId = r1.json.file.id;

    const r2 = await httpJson(port, 'POST', `/api/v1/channels/${channelId}/workspace/mkdir`, authCookie(memberAId), { name: 'sub', parentId: folderId });
    expect(r2.status).toBe(201);

    const r3 = await httpJson(port, 'DELETE', `/api/v1/channels/${channelId}/workspace/files/${folderId}`, authCookie(memberAId));
    expect(r3.status).toBe(204);
  });

  it('download file → 200 + correct content', async () => {
    const upRes = await uploadFile(channelId, memberAId, 'download-me.txt', 'download content');
    const fId = (await upRes.json()).file.id;
    const r = await httpJson(port, 'GET', `/api/v1/channels/${channelId}/workspace/files/${fId}`, authCookie(memberAId));
    expect(r.status).toBe(200);
    expect(r.text).toContain('download content');
  });

  it('move file to folder → 200 + parent_id updated', async () => {
    const folderRes = await httpJson(port, 'POST', `/api/v1/channels/${channelId}/workspace/mkdir`, authCookie(memberAId), { name: 'target-folder' });
    const folderId = folderRes.json.file.id;

    const upRes = await uploadFile(channelId, memberAId, 'move-me.txt', 'move');
    const fileId = (await upRes.json()).file.id;

    const r = await httpJson(port, 'POST', `/api/v1/channels/${channelId}/workspace/files/${fileId}/move`, authCookie(memberAId), { parentId: folderId });
    expect(r.status).toBe(200);
    expect(r.json.file.parent_id).toBe(folderId);
  });

  it('delete file → 204 + removed from list', async () => {
    const upRes = await uploadFile(channelId, memberAId, 'delete-me.txt', 'delete');
    const fId = (await upRes.json()).file.id;
    const r = await httpJson(port, 'DELETE', `/api/v1/channels/${channelId}/workspace/files/${fId}`, authCookie(memberAId));
    expect(r.status).toBe(204);
    const file = testDb.prepare('SELECT * FROM workspace_files WHERE id = ?').get(fId);
    expect(file).toBeUndefined();
  });
});
