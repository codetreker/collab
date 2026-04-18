import type { FastifyInstance } from 'fastify';
import { getDb } from '../db.js';
import * as Q from '../queries.js';
import { broadcastToChannel } from '../ws.js';

export function registerChannelRoutes(app: FastifyInstance): void {
  // List channels
  app.get('/api/v1/channels', async (request) => {
    const db = getDb();
    if (request.currentUser) {
      const channels = Q.listChannelsWithUnread(db, request.currentUser.id);
      return { channels };
    }
    const channels = Q.listChannels(db);
    return { channels };
  });

  // Create channel
  app.post<{
    Body: { name: string; topic?: string };
  }>('/api/v1/channels', async (request, reply) => {
    const { name, topic } = request.body ?? {};

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return reply.status(400).send({ error: 'Channel name is required' });
    }

    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');

    const db = getDb();
    const existing = Q.getChannelByName(db, cleanName);
    if (existing) {
      return reply.status(409).send({ error: `Channel #${cleanName} already exists` });
    }

    const userId = request.currentUser?.id ?? 'system';
    const channel = Q.createChannel(db, cleanName, topic?.trim() ?? '', userId);

    broadcastToChannel(channel.id, {
      type: 'channel_created',
      channel,
    });

    return reply.status(201).send({ channel });
  });

  // Get channel detail
  app.get<{
    Params: { channelId: string };
  }>('/api/v1/channels/:channelId', async (request, reply) => {
    const { channelId } = request.params;
    const db = getDb();
    const channel = Q.getChannelDetail(db, channelId);
    if (!channel) {
      return reply.status(404).send({ error: 'Channel not found' });
    }
    return { channel };
  });

  // Update channel
  app.put<{
    Params: { channelId: string };
    Body: { name?: string; topic?: string };
  }>('/api/v1/channels/:channelId', async (request, reply) => {
    const { channelId } = request.params;
    const { name, topic } = request.body ?? {};

    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
      return reply.status(400).send({ error: 'Invalid channel name' });
    }

    const db = getDb();
    const channel = Q.getChannel(db, channelId);
    if (!channel) {
      return reply.status(404).send({ error: 'Channel not found' });
    }

    const userId = request.currentUser?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const user = Q.getUserById(db, userId);
    if (channel.created_by !== userId && user?.role !== 'admin') {
      return reply.status(403).send({ error: 'Only the channel creator or an admin can update this channel' });
    }

    const cleanName = name ? name.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-') : undefined;
    if (cleanName) {
      const existing = Q.getChannelByName(db, cleanName);
      if (existing && existing.id !== channelId) {
        return reply.status(409).send({ error: `Channel #${cleanName} already exists` });
      }
    }

    const updated = Q.updateChannel(db, channelId, {
      name: cleanName,
      topic: topic?.trim(),
    });
    return { channel: updated };
  });

  // Join channel
  app.post<{
    Params: { channelId: string };
    Body: { user_id: string };
  }>('/api/v1/channels/:channelId/members', async (request, reply) => {
    const { channelId } = request.params;
    const { user_id } = request.body ?? {};

    if (!user_id || typeof user_id !== 'string') {
      return reply.status(400).send({ error: 'user_id is required' });
    }

    const db = getDb();
    const channel = Q.getChannel(db, channelId);
    if (!channel) {
      return reply.status(404).send({ error: 'Channel not found' });
    }

    const user = Q.getUserById(db, user_id);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    Q.addChannelMember(db, channelId, user_id);
    Q.insertEvent(db, 'member_joined', channelId, { channel_id: channelId, user_id, display_name: user.display_name });

    broadcastToChannel(channelId, {
      type: 'user_joined',
      channel_id: channelId,
      user_id,
      display_name: user.display_name,
    });

    return reply.status(201).send({ ok: true });
  });

  // Leave / remove from channel
  app.delete<{
    Params: { channelId: string; userId: string };
  }>('/api/v1/channels/:channelId/members/:userId', async (request, reply) => {
    const { channelId, userId } = request.params;
    const db = getDb();

    const channel = Q.getChannel(db, channelId);
    if (!channel) {
      return reply.status(404).send({ error: 'Channel not found' });
    }

    const removed = Q.removeChannelMember(db, channelId, userId);
    if (!removed) {
      return reply.status(404).send({ error: 'User is not a member of this channel' });
    }

    const user = Q.getUserById(db, userId);
    Q.insertEvent(db, 'member_left', channelId, { channel_id: channelId, user_id: userId, display_name: user?.display_name });

    broadcastToChannel(channelId, {
      type: 'user_left',
      channel_id: channelId,
      user_id: userId,
      display_name: user?.display_name,
    });

    return { ok: true };
  });

  // List channel members
  app.get<{
    Params: { channelId: string };
  }>('/api/v1/channels/:channelId/members', async (request, reply) => {
    const { channelId } = request.params;
    const db = getDb();

    const channel = Q.getChannel(db, channelId);
    if (!channel) {
      return reply.status(404).send({ error: 'Channel not found' });
    }

    const members = Q.getChannelMembers(db, channelId);
    return { members };
  });

  // Mark channel as read
  app.put<{
    Params: { channelId: string };
  }>('/api/v1/channels/:channelId/read', async (request, reply) => {
    const { channelId } = request.params;
    const db = getDb();

    const channel = Q.getChannel(db, channelId);
    if (!channel) {
      return reply.status(404).send({ error: 'Channel not found' });
    }

    const userId = request.currentUser?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    if (!Q.isChannelMember(db, channelId, userId)) {
      return reply.status(403).send({ error: 'Not a member of this channel' });
    }

    Q.markChannelRead(db, channelId, userId);
    return { ok: true };
  });
}
