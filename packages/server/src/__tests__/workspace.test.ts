import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
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

function addWorkspaceFilesTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_files (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      channel_id TEXT NOT NULL REFERENCES channels(id),
      parent_id TEXT REFERENCES workspace_files(id),
      name TEXT NOT NULL,
      is_directory INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT,
      size_bytes INTEGER DEFAULT 0,
      source TEXT DEFAULT 'upload',
      source_message_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, channel_id, parent_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_files_user_channel
      ON workspace_files(user_id, channel_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_files_parent
      ON workspace_files(parent_id);
  `);
}

describe('Workspace API', () => {
  beforeAll(async () => {
    testDb = createTestDb();
    addWorkspaceFilesTable(testDb);
    app = Fastify({ logger: false });
    await app.register(fastifyMultipart);
    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/v1/auth/')) return;
      await authMiddleware(request, reply);
    });
    registerWorkspaceRoutes(app);
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    testDb.exec('DELETE FROM workspace_files');
    testDb.exec('DELETE FROM channel_members');
    testDb.exec('DELETE FROM channels');
    testDb.exec('DELETE FROM users');
  });

  function setup() {
    const userId = seedAdmin(testDb);
    const channelId = seedChannel(testDb, userId, 'workspace-test');
    addChannelMember(testDb, channelId, userId);
    return { userId, channelId };
  }

  describe('POST /api/v1/channels/:channelId/workspace/upload', () => {
    it('uploads a file', async () => {
      const { userId, channelId } = setup();
      const res = await uploadFile(
        `/api/v1/channels/${channelId}/workspace/upload`,
        userId, 'readme.txt', 'hello world',
      );
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.file.name).toBe('readme.txt');
      expect(body.file.is_directory).toBe(0);
      expect(body.file.size_bytes).toBe(11);
    });

    it('rejects request with no file attached', async () => {
      const { userId, channelId } = setup();
      const res = await inject('POST', `/api/v1/channels/${channelId}/workspace/upload`, userId);
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('resolves name conflicts', async () => {
      const { userId, channelId } = setup();
      const url = `/api/v1/channels/${channelId}/workspace/upload`;
      await uploadFile(url, userId, 'doc.txt', 'a');
      const res = await uploadFile(url, userId, 'doc.txt', 'b');
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.file.name).not.toBe('doc.txt');
    });
  });

  describe('GET /api/v1/channels/:channelId/workspace', () => {
    it('lists files in root', async () => {
      const { userId, channelId } = setup();
      await uploadFile(`/api/v1/channels/${channelId}/workspace/upload`, userId, 'a.txt', 'x');
      const res = await inject('GET', `/api/v1/channels/${channelId}/workspace`, userId);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.files).toHaveLength(1);
      expect(body.files[0].name).toBe('a.txt');
    });

    it('lists files in a subdirectory', async () => {
      const { userId, channelId } = setup();
      const mkdirRes = await inject('POST', `/api/v1/channels/${channelId}/workspace/mkdir`, userId, { name: 'sub' });
      const folderId = JSON.parse(mkdirRes.body).file.id;
      await uploadFile(`/api/v1/channels/${channelId}/workspace/upload?parentId=${folderId}`, userId, 'nested.txt', 'n');
      const res = await inject('GET', `/api/v1/channels/${channelId}/workspace?parentId=${folderId}`, userId);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.files).toHaveLength(1);
      expect(body.files[0].name).toBe('nested.txt');
    });
  });

  describe('GET /api/v1/channels/:channelId/workspace/files/:id (download)', () => {
    it('downloads a file', async () => {
      const { userId, channelId } = setup();
      const up = await uploadFile(`/api/v1/channels/${channelId}/workspace/upload`, userId, 'dl.txt', 'content123');
      const fileId = JSON.parse(up.body).file.id;
      const res = await inject('GET', `/api/v1/channels/${channelId}/workspace/files/${fileId}`, userId);
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe('content123');
    });

    it('returns 404 for non-existent file', async () => {
      const { userId, channelId } = setup();
      const res = await inject('GET', `/api/v1/channels/${channelId}/workspace/files/nonexistent`, userId);
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 when trying to download a directory', async () => {
      const { userId, channelId } = setup();
      const mkRes = await inject('POST', `/api/v1/channels/${channelId}/workspace/mkdir`, userId, { name: 'folder' });
      const folderId = JSON.parse(mkRes.body).file.id;
      const res = await inject('GET', `/api/v1/channels/${channelId}/workspace/files/${folderId}`, userId);
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/channels/:channelId/workspace/mkdir', () => {
    it('creates a folder', async () => {
      const { userId, channelId } = setup();
      const res = await inject('POST', `/api/v1/channels/${channelId}/workspace/mkdir`, userId, { name: 'docs' });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.file.name).toBe('docs');
      expect(body.file.is_directory).toBe(1);
    });

    it('returns 400 with empty name', async () => {
      const { userId, channelId } = setup();
      const res = await inject('POST', `/api/v1/channels/${channelId}/workspace/mkdir`, userId, { name: '' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/channels/:channelId/workspace/files/:id/move', () => {
    it('moves a file into a folder', async () => {
      const { userId, channelId } = setup();
      const up = await uploadFile(`/api/v1/channels/${channelId}/workspace/upload`, userId, 'move-me.txt', 'data');
      const fileId = JSON.parse(up.body).file.id;
      const mkRes = await inject('POST', `/api/v1/channels/${channelId}/workspace/mkdir`, userId, { name: 'target' });
      const folderId = JSON.parse(mkRes.body).file.id;

      const res = await inject('POST', `/api/v1/channels/${channelId}/workspace/files/${fileId}/move`, userId, { parentId: folderId });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.file.parent_id).toBe(folderId);
    });

    it('moves a file to root', async () => {
      const { userId, channelId } = setup();
      const mkRes = await inject('POST', `/api/v1/channels/${channelId}/workspace/mkdir`, userId, { name: 'src' });
      const folderId = JSON.parse(mkRes.body).file.id;
      const up = await uploadFile(`/api/v1/channels/${channelId}/workspace/upload?parentId=${folderId}`, userId, 'f.txt', 'd');
      const fileId = JSON.parse(up.body).file.id;

      const res = await inject('POST', `/api/v1/channels/${channelId}/workspace/files/${fileId}/move`, userId, { parentId: null });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.file.parent_id).toBeNull();
    });
  });

  describe('PATCH /api/v1/channels/:channelId/workspace/files/:id (rename)', () => {
    it('renames a file', async () => {
      const { userId, channelId } = setup();
      const up = await uploadFile(`/api/v1/channels/${channelId}/workspace/upload`, userId, 'old.txt', 'x');
      const fileId = JSON.parse(up.body).file.id;
      const res = await inject('PATCH', `/api/v1/channels/${channelId}/workspace/files/${fileId}`, userId, { name: 'new.txt' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).file.name).toBe('new.txt');
    });

    it('returns 409 on name conflict', async () => {
      const { userId, channelId } = setup();
      await uploadFile(`/api/v1/channels/${channelId}/workspace/upload`, userId, 'taken.txt', 'a');
      const up2 = await uploadFile(`/api/v1/channels/${channelId}/workspace/upload`, userId, 'other.txt', 'b');
      const fileId = JSON.parse(up2.body).file.id;
      const res = await inject('PATCH', `/api/v1/channels/${channelId}/workspace/files/${fileId}`, userId, { name: 'taken.txt' });
      expect(res.statusCode).toBe(409);
    });

    it('returns 400 with empty name', async () => {
      const { userId, channelId } = setup();
      const up = await uploadFile(`/api/v1/channels/${channelId}/workspace/upload`, userId, 'f.txt', 'x');
      const fileId = JSON.parse(up.body).file.id;
      const res = await inject('PATCH', `/api/v1/channels/${channelId}/workspace/files/${fileId}`, userId, { name: '  ' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/v1/channels/:channelId/workspace/files/:id', () => {
    it('deletes a file', async () => {
      const { userId, channelId } = setup();
      const up = await uploadFile(`/api/v1/channels/${channelId}/workspace/upload`, userId, 'del.txt', 'bye');
      const fileId = JSON.parse(up.body).file.id;
      const res = await inject('DELETE', `/api/v1/channels/${channelId}/workspace/files/${fileId}`, userId);
      expect(res.statusCode).toBe(204);

      const list = await inject('GET', `/api/v1/channels/${channelId}/workspace`, userId);
      expect(JSON.parse(list.body).files).toHaveLength(0);
    });

    it('deletes a directory recursively', async () => {
      const { userId, channelId } = setup();
      const mkRes = await inject('POST', `/api/v1/channels/${channelId}/workspace/mkdir`, userId, { name: 'dir' });
      const folderId = JSON.parse(mkRes.body).file.id;
      await uploadFile(`/api/v1/channels/${channelId}/workspace/upload?parentId=${folderId}`, userId, 'child.txt', 'c');

      const res = await inject('DELETE', `/api/v1/channels/${channelId}/workspace/files/${folderId}`, userId);
      expect(res.statusCode).toBe(204);

      const list = await inject('GET', `/api/v1/channels/${channelId}/workspace`, userId);
      expect(JSON.parse(list.body).files).toHaveLength(0);
    });

    it('returns 404 for non-existent file', async () => {
      const { userId, channelId } = setup();
      const res = await inject('DELETE', `/api/v1/channels/${channelId}/workspace/files/nope`, userId);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('permissions', () => {
    it('returns 403 for non-member on list', async () => {
      const { channelId } = setup();
      const outsider = seedMember(testDb, 'Outsider');
      const res = await inject('GET', `/api/v1/channels/${channelId}/workspace`, outsider);
      expect(res.statusCode).toBe(403);
    });

    it('returns 403 for non-member on upload', async () => {
      const { channelId } = setup();
      const outsider = seedMember(testDb, 'Outsider');
      const res = await uploadFile(`/api/v1/channels/${channelId}/workspace/upload`, outsider, 'x.txt', 'x');
      expect(res.statusCode).toBe(403);
    });

    it('returns 403 for non-member on mkdir', async () => {
      const { channelId } = setup();
      const outsider = seedMember(testDb, 'Outsider');
      const res = await inject('POST', `/api/v1/channels/${channelId}/workspace/mkdir`, outsider, { name: 'test' });
      expect(res.statusCode).toBe(403);
    });

    it('returns 401 without auth', async () => {
      const { channelId } = setup();
      const res = await inject('GET', `/api/v1/channels/${channelId}/workspace`);
      expect(res.statusCode).toBe(401);
    });
  });
});
