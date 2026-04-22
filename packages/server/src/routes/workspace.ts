import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../db.js';
import * as Q from '../queries.js';

const WORKSPACE_DIR = process.env.WORKSPACE_DIR ?? path.join(process.cwd(), 'data', 'workspaces');

function getFilePath(userId: string, channelId: string, fileId: string): string {
  return path.join(WORKSPACE_DIR, userId, channelId, `${fileId}.dat`);
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export async function writeWorkspaceFileData(
  userId: string,
  channelId: string,
  fileId: string,
  data: Buffer,
): Promise<void> {
  const filePath = getFilePath(userId, channelId, fileId);
  ensureDir(filePath);
  fs.writeFileSync(filePath, data);
}

export function registerWorkspaceRoutes(app: FastifyInstance): void {
  // List files
  app.get<{
    Params: { channelId: string };
    Querystring: { parentId?: string };
  }>('/api/v1/channels/:channelId/workspace', async (request, reply) => {
    const userId = request.currentUser?.id;
    if (!userId) return reply.status(401).send({ error: 'Authentication required' });

    const { channelId } = request.params;
    const db = getDb();

    if (!Q.isChannelMember(db, channelId, userId)) {
      return reply.status(403).send({ error: 'Not a member of this channel' });
    }

    const parentId = request.query.parentId ?? null;
    const files = Q.listWorkspaceFiles(db, userId, channelId, parentId);
    return { files };
  });

  // Upload file
  app.post<{
    Params: { channelId: string };
    Querystring: { parentId?: string };
  }>('/api/v1/channels/:channelId/workspace/upload', async (request, reply) => {
    const userId = request.currentUser?.id;
    if (!userId) return reply.status(401).send({ error: 'Authentication required' });

    const { channelId } = request.params;
    const db = getDb();

    if (!Q.isChannelMember(db, channelId, userId)) {
      return reply.status(403).send({ error: 'Not a member of this channel' });
    }

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const chunks: Buffer[] = [];
    let totalSize = 0;
    const maxSize = 10 * 1024 * 1024;

    for await (const chunk of data.file) {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        return reply.status(413).send({ error: 'File too large. Maximum size is 10MB' });
      }
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    const parentId = request.query.parentId ?? null;
    const originalName = data.filename || 'untitled';

    const siblings = Q.getSiblingNames(db, userId, channelId, parentId);
    const resolvedName = Q.resolveConflict(originalName, siblings);
    const fileId = crypto.randomBytes(16).toString('hex');

    await writeWorkspaceFileData(userId, channelId, fileId, buffer);

    const file = Q.insertWorkspaceFile(db, {
      id: fileId,
      userId,
      channelId,
      parentId,
      name: resolvedName,
      isDirectory: false,
      mimeType: data.mimetype || null,
      sizeBytes: buffer.length,
    });

    return reply.status(201).send({ file });
  });

  // Download file
  app.get<{
    Params: { channelId: string; id: string };
  }>('/api/v1/channels/:channelId/workspace/files/:id', async (request, reply) => {
    const userId = request.currentUser?.id;
    if (!userId) return reply.status(401).send({ error: 'Authentication required' });

    const { channelId, id } = request.params;
    const db = getDb();

    const file = Q.getWorkspaceFile(db, id);
    if (!file || file.user_id !== userId || file.channel_id !== channelId) {
      return reply.status(404).send({ error: 'File not found' });
    }

    if (file.is_directory) {
      return reply.status(400).send({ error: 'Cannot download a directory' });
    }

    const filePath = getFilePath(userId, channelId, id);
    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ error: 'File data not found' });
    }

    const content = fs.readFileSync(filePath);
    return reply
      .header('Content-Type', file.mime_type ?? 'application/octet-stream')
      .header('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`)
      .send(content);
  });

  // Update file content (for markdown editing)
  app.put<{
    Params: { channelId: string; id: string };
    Body: { content: string };
  }>('/api/v1/channels/:channelId/workspace/files/:id', async (request, reply) => {
    const userId = request.currentUser?.id;
    if (!userId) return reply.status(401).send({ error: 'Authentication required' });

    const { channelId, id } = request.params;
    const db = getDb();

    const file = Q.getWorkspaceFile(db, id);
    if (!file || file.user_id !== userId || file.channel_id !== channelId) {
      return reply.status(404).send({ error: 'File not found' });
    }

    const { content } = request.body ?? {};
    if (typeof content !== 'string') {
      return reply.status(400).send({ error: 'Content is required' });
    }

    const buffer = Buffer.from(content, 'utf-8');
    await writeWorkspaceFileData(userId, channelId, id, buffer);
    Q.updateWorkspaceFileContent(db, id, buffer.length);

    const updated = Q.getWorkspaceFile(db, id);
    return { file: updated };
  });

  // Rename file/folder
  app.patch<{
    Params: { channelId: string; id: string };
    Body: { name: string };
  }>('/api/v1/channels/:channelId/workspace/files/:id', async (request, reply) => {
    const userId = request.currentUser?.id;
    if (!userId) return reply.status(401).send({ error: 'Authentication required' });

    const { channelId, id } = request.params;
    const { name } = request.body ?? {};

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return reply.status(400).send({ error: 'Name is required' });
    }

    const db = getDb();
    const file = Q.getWorkspaceFile(db, id);
    if (!file || file.user_id !== userId || file.channel_id !== channelId) {
      return reply.status(404).send({ error: 'File not found' });
    }

    try {
      const updated = Q.renameWorkspaceFile(db, id, name.trim());
      return { file: updated };
    } catch (err: any) {
      if (err.message === 'CONFLICT') {
        return reply.status(409).send({ error: 'A file with that name already exists' });
      }
      throw err;
    }
  });

  // Delete file
  app.delete<{
    Params: { channelId: string; id: string };
  }>('/api/v1/channels/:channelId/workspace/files/:id', async (request, reply) => {
    const userId = request.currentUser?.id;
    if (!userId) return reply.status(401).send({ error: 'Authentication required' });

    const { channelId, id } = request.params;
    const db = getDb();

    const file = Q.getWorkspaceFile(db, id);
    if (!file || file.user_id !== userId || file.channel_id !== channelId) {
      return reply.status(404).send({ error: 'File not found' });
    }

    // Delete file data from disk (recursively for directories)
    const deleteFileData = (f: { id: string; is_directory: number }) => {
      if (f.is_directory) {
        const children = db.prepare('SELECT id, is_directory FROM workspace_files WHERE parent_id = ?').all(f.id) as { id: string; is_directory: number }[];
        for (const child of children) deleteFileData(child);
      } else {
        const fp = getFilePath(userId, channelId, f.id);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }
    };
    deleteFileData(file);

    Q.deleteWorkspaceFile(db, id);
    return reply.status(204).send();
  });

  // Create directory
  app.post<{
    Params: { channelId: string };
    Body: { name: string; parentId?: string };
  }>('/api/v1/channels/:channelId/workspace/mkdir', async (request, reply) => {
    const userId = request.currentUser?.id;
    if (!userId) return reply.status(401).send({ error: 'Authentication required' });

    const { channelId } = request.params;
    const { name, parentId } = request.body ?? {};

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return reply.status(400).send({ error: 'Folder name is required' });
    }

    const db = getDb();
    if (!Q.isChannelMember(db, channelId, userId)) {
      return reply.status(403).send({ error: 'Not a member of this channel' });
    }

    const file = Q.mkdirWorkspace(db, userId, channelId, parentId ?? null, name.trim());
    return reply.status(201).send({ file });
  });

  // Move file
  app.post<{
    Params: { channelId: string; id: string };
    Body: { parentId: string | null };
  }>('/api/v1/channels/:channelId/workspace/files/:id/move', async (request, reply) => {
    const userId = request.currentUser?.id;
    if (!userId) return reply.status(401).send({ error: 'Authentication required' });

    const { channelId, id } = request.params;
    const db = getDb();

    const file = Q.getWorkspaceFile(db, id);
    if (!file || file.user_id !== userId || file.channel_id !== channelId) {
      return reply.status(404).send({ error: 'File not found' });
    }

    const { parentId } = request.body ?? {};
    const moved = Q.moveWorkspaceFile(db, id, parentId ?? null);
    return { file: moved };
  });

  // Get all workspaces (cross-channel)
  app.get('/api/v1/workspaces', async (request, reply) => {
    const userId = request.currentUser?.id;
    if (!userId) return reply.status(401).send({ error: 'Authentication required' });

    const db = getDb();
    const files = Q.getAllWorkspaceFiles(db, userId);
    return { files };
  });
}
