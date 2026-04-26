import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import * as Q from '../queries.js';
import { generateRankBetween } from '../lexorank.js';
import { broadcastToAll } from '../ws.js';

export function registerChannelGroupRoutes(app: FastifyInstance): void {
  // List channel groups
  app.get('/api/v1/channel-groups', async () => {
    const db = getDb();
    const groups = Q.listChannelGroups(db);
    return { groups };
  });

  // Create channel group
  app.post<{
    Body: { name: string };
  }>('/api/v1/channel-groups', async (request, reply) => {
    const { name } = request.body ?? {};

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return reply.status(400).send({ error: 'Group name is required' });
    }

    const trimmed = name.trim();
    if (trimmed.length > 50) {
      return reply.status(400).send({ error: 'Group name must be 50 characters or fewer' });
    }

    const userId = request.currentUser?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const db = getDb();
    const lastPos = Q.getLastGroupPosition(db);
    const position = generateRankBetween(lastPos, null);
    const id = uuidv4();
    const now = Date.now();

    const group = Q.createChannelGroup(db, { id, name: trimmed, position, created_by: userId, created_at: now });

    broadcastToAll({ type: 'group_created', group });

    return reply.status(201).send({ group });
  });

  // Rename channel group
  app.put<{
    Params: { groupId: string };
    Body: { name: string };
  }>('/api/v1/channel-groups/:groupId', async (request, reply) => {
    const { groupId } = request.params;
    const { name } = request.body ?? {};

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return reply.status(400).send({ error: 'Group name is required' });
    }

    const trimmed = name.trim();
    if (trimmed.length > 50) {
      return reply.status(400).send({ error: 'Group name must be 50 characters or fewer' });
    }

    const userId = request.currentUser?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const db = getDb();
    const group = Q.getChannelGroup(db, groupId);
    if (!group) {
      return reply.status(404).send({ error: 'Group not found' });
    }

    if (group.created_by !== userId) {
      return reply.status(403).send({ error: 'Only the group creator can rename it' });
    }

    const updated = Q.updateChannelGroup(db, groupId, { name: trimmed });

    broadcastToAll({ type: 'group_updated', group: updated });

    return { group: updated };
  });

  // Delete channel group
  app.delete<{
    Params: { groupId: string };
  }>('/api/v1/channel-groups/:groupId', async (request, reply) => {
    const { groupId } = request.params;

    const userId = request.currentUser?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const db = getDb();
    const group = Q.getChannelGroup(db, groupId);
    if (!group) {
      return reply.status(404).send({ error: 'Group not found' });
    }

    if (group.created_by !== userId) {
      return reply.status(403).send({ error: 'Only the group creator can delete it' });
    }

    const txn = db.transaction(() => {
      const ungroupedIds = Q.ungroupChannels(db, groupId);
      Q.deleteChannelGroup(db, groupId);
      return ungroupedIds;
    });

    const ungrouped_channel_ids = txn();

    broadcastToAll({ type: 'group_deleted', group_id: groupId, ungrouped_channel_ids });

    return { ok: true, ungrouped_channel_ids };
  });

  // Reorder channel group (drag-and-drop sorting via lexorank)
  app.put<{
    Body: { group_id: string; after_id: string | null };
  }>('/api/v1/channel-groups/reorder', async (request, reply) => {
    const { group_id, after_id } = request.body ?? {};

    if (!group_id || typeof group_id !== 'string') {
      return reply.status(400).send({ error: 'group_id is required' });
    }

    const db = getDb();
    const userId = request.currentUser?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const group = Q.getChannelGroup(db, group_id);
    if (!group) {
      return reply.status(404).send({ error: 'Group not found' });
    }

    if (group.created_by !== userId) {
      return reply.status(403).send({ error: 'Only the group creator can reorder' });
    }

    const afterId = after_id ?? null;
    if (afterId !== null) {
      const afterGroup = Q.getChannelGroup(db, afterId);
      if (!afterGroup) {
        return reply.status(404).send({ error: 'after_id group not found' });
      }
    }

    // Use BEGIN IMMEDIATE to prevent concurrent lexorank conflicts
    db.exec('BEGIN IMMEDIATE');
    try {
      const { before, after } = Q.getAdjacentGroupPositions(db, afterId);
      const newPosition = generateRankBetween(before, after);
      Q.updateGroupPosition(db, group_id, newPosition);
      db.exec('COMMIT');

      const updated = Q.getChannelGroup(db, group_id);

      broadcastToAll({
        type: 'channel_groups_reordered',
        group_id: updated!.id,
        position: updated!.position,
      });

      return { group: updated };
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  });
}
