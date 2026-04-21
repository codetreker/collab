import type { FastifyInstance } from 'fastify';
import { getDb } from '../db.js';
import * as Q from '../queries.js';
import { broadcastToChannel, broadcastToUser, getOnlineUserIds } from '../ws.js';
import { requirePermission } from '../middleware/permissions.js';

export function registerChannelRoutes(app: FastifyInstance): void {
  // List channels
  app.get('/api/v1/channels', async (request) => {
    const db = getDb();
    if (request.currentUser?.role === 'admin') {
      const channels = Q.listAllChannelsForAdmin(db, request.currentUser.id);
      return { channels };
    }
    if (request.currentUser) {
      const channels = Q.listChannelsWithUnread(db, request.currentUser.id);
      return { channels };
    }
    const channels = Q.listChannels(db);
    return { channels };
  });

  // Create channel
  app.post<{
    Body: { name: string; topic?: string; member_ids?: string[]; visibility?: 'public' | 'private' };
  }>('/api/v1/channels', { preHandler: [requirePermission('channel.create')] }, async (request, reply) => {
    const { name, topic, member_ids, visibility } = request.body ?? {};

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return reply.status(400).send({ error: 'Channel name is required' });
    }

    const vis = visibility ?? 'public';
    if (vis !== 'public' && vis !== 'private') {
      return reply.status(400).send({ error: "visibility must be 'public' or 'private'" });
    }

    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');

    const db = getDb();
    const existing = Q.getChannelByName(db, cleanName);
    if (existing) {
      return reply.status(409).send({ error: `Channel #${cleanName} already exists` });
    }

    const userId = request.currentUser?.id ?? 'system';

    if (Array.isArray(member_ids)) {
      const caller = request.currentUser!;
      for (const memberId of member_ids) {
        if (typeof memberId !== 'string' || memberId === userId) continue;
        const memberUser = Q.getUserById(db, memberId);
        if (memberUser?.role === 'agent') {
          if (caller.role !== 'admin' && caller.id !== memberUser.owner_id) {
            return reply.status(403).send({ error: `Only the agent owner or admin can add agent ${memberId}` });
          }
          if (vis === 'private') {
            const ownerId = memberUser.owner_id;
            if (ownerId && ownerId !== userId && !member_ids.includes(ownerId)) {
              return reply.status(409).send({ error: `Agent owner must be a member of the channel` });
            }
          }
        }
      }
    }

    const txn = db.transaction(() => {
      const channel = Q.createChannel(db, cleanName, topic?.trim() ?? '', userId, vis);
      Q.addChannelMember(db, channel.id, userId);

      if (vis === 'public') {
        Q.addAllUsersToChannel(db, channel.id);
      } else if (Array.isArray(member_ids)) {
        for (const memberId of member_ids) {
          if (typeof memberId === 'string' && memberId !== userId) {
            Q.addChannelMember(db, channel.id, memberId);
          }
        }
      }

      const creator = Q.getUserById(db, userId);
      const creatorRole = creator?.role ?? 'member';
      Q.grantCreatorPermissions(db, userId, creatorRole as 'admin' | 'member' | 'agent', channel.id, creator?.owner_id ?? undefined);

      return channel;
    });

    const channel = txn();

    if (vis === 'public') {
      const allUsers = Q.listUsers(db);
      for (const u of allUsers) {
        if (u.id === userId) continue;
        const ch = Q.getChannelWithCounts(db, channel.id, u.id);
        broadcastToUser(u.id, { type: 'channel_added', channel: ch ?? channel });
      }
    } else {
      broadcastToChannel(channel.id, {
        type: 'channel_created',
        channel,
      });
    }

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

    if (channel.visibility === 'private') {
      const userId = request.currentUser?.id;
      if (!userId || !Q.canAccessChannel(db, channelId, userId)) {
        return reply.status(404).send({ error: 'Channel not found' });
      }
    }

    return { channel };
  });

  // Update channel
  app.put<{
    Params: { channelId: string };
    Body: { name?: string; topic?: string; visibility?: 'public' | 'private' };
  }>('/api/v1/channels/:channelId', { preHandler: [requirePermission('channel.manage_visibility', (req) => `channel:${(req.params as { channelId: string }).channelId}`)] }, async (request, reply) => {
    const { channelId } = request.params;
    const { name, topic, visibility } = request.body ?? {};

    if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
      return reply.status(400).send({ error: 'Invalid channel name' });
    }

    if (visibility !== undefined && visibility !== 'public' && visibility !== 'private') {
      return reply.status(400).send({ error: "visibility must be 'public' or 'private'" });
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

    if (visibility === 'private' && channel.name === 'general') {
      return reply.status(403).send({ error: 'Cannot make #general private' });
    }

    const cleanName = name ? name.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-') : undefined;
    if (cleanName) {
      const existing = Q.getChannelByName(db, cleanName);
      if (existing && existing.id !== channelId) {
        return reply.status(409).send({ error: `Channel #${cleanName} already exists` });
      }
    }

    const oldVisibility = channel.visibility ?? 'public';
    const newVisibility = visibility ?? oldVisibility;
    let newMemberUserIds: string[] = [];

    if (oldVisibility === 'private' && newVisibility === 'public') {
      const existingMembers = new Set(
        Q.getChannelMembers(db, channelId).map((m) => m.user_id),
      );

      const txn = db.transaction(() => {
        Q.updateChannel(db, channelId, { name: cleanName, topic: topic?.trim(), visibility });
        Q.addAllUsersToChannel(db, channelId);
      });
      txn();

      const allMembers = Q.getChannelMembers(db, channelId);
      newMemberUserIds = allMembers
        .filter((m) => !existingMembers.has(m.user_id))
        .map((m) => m.user_id);
    } else {
      Q.updateChannel(db, channelId, { name: cleanName, topic: topic?.trim(), visibility });
    }

    const updated = Q.getChannel(db, channelId);

    if (visibility && visibility !== oldVisibility) {
      broadcastToChannel(channelId, {
        type: 'visibility_changed',
        channel_id: channelId,
        visibility: newVisibility,
      });
      Q.insertEvent(db, 'visibility_changed', channelId, { channel_id: channelId, visibility: newVisibility });

      for (const uid of newMemberUserIds) {
        const fullChannel = Q.getChannelWithCounts(db, channelId, uid);
        broadcastToUser(uid, { type: 'channel_added', channel: fullChannel ?? updated });
      }
    }

    return { channel: updated };
  });

  // Join channel (self-service)
  app.post<{
    Params: { channelId: string };
  }>('/api/v1/channels/:channelId/join', async (request, reply) => {
    const { channelId } = request.params;
    const db = getDb();

    const channel = Q.getChannel(db, channelId);
    if (!channel) {
      return reply.status(404).send({ error: 'Channel not found' });
    }

    if (channel.type === 'dm') {
      return reply.status(403).send({ error: 'Cannot join DM channels' });
    }

    const userId = request.currentUser?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const vis = channel.visibility ?? 'public';
    if (vis === 'private') {
      return reply.status(403).send({ error: 'Cannot join private channels' });
    }

    const user = Q.getUserById(db, userId);
    if (user?.role === 'agent') {
      const ownerId = user.owner_id;
      if (ownerId && !Q.isChannelMember(db, channelId, ownerId)) {
        return reply.status(409).send({ error: 'Agent owner must be a member of the channel' });
      }
    }

    Q.addChannelMember(db, channelId, userId);

    Q.insertEvent(db, 'user_joined', channelId, { channel_id: channelId, user_id: userId, display_name: user?.display_name });

    const memberCount = Q.getChannelMembers(db, channelId).length;

    broadcastToChannel(channelId, {
      type: 'user_joined',
      channel_id: channelId,
      user_id: userId,
      display_name: user?.display_name,
      member_count: memberCount,
    });

    return { ok: true };
  });

  // Leave channel (self-service)
  app.post<{
    Params: { channelId: string };
  }>('/api/v1/channels/:channelId/leave', async (request, reply) => {
    const { channelId } = request.params;
    const db = getDb();

    const channel = Q.getChannel(db, channelId);
    if (!channel) {
      return reply.status(404).send({ error: 'Channel not found' });
    }

    if (channel.type === 'dm') {
      return reply.status(403).send({ error: 'Cannot leave DM channels' });
    }

    if (channel.name === 'general') {
      return reply.status(403).send({ error: 'Cannot leave #general' });
    }

    const userId = request.currentUser?.id;
    if (!userId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const removed = Q.removeChannelMember(db, channelId, userId);
    if (!removed) {
      return { ok: true };
    }

    const user = Q.getUserById(db, userId);

    Q.insertEvent(db, 'user_left', channelId, { channel_id: channelId, user_id: userId, display_name: user?.display_name });

    const leaveCount = Q.getChannelMembers(db, channelId).length;

    broadcastToChannel(channelId, {
      type: 'user_left',
      channel_id: channelId,
      user_id: userId,
      display_name: user?.display_name,
      member_count: leaveCount,
    });

    return { ok: true };
  });

  // Add member to channel
  app.post<{
    Params: { channelId: string };
    Body: { user_id: string };
  }>('/api/v1/channels/:channelId/members', { preHandler: [requirePermission('channel.manage_members', (req) => `channel:${(req.params as { channelId: string }).channelId}`)] }, async (request, reply) => {
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

    if ((channel as { type?: string }).type === 'dm') {
      return reply.status(403).send({ error: 'Cannot join DM channels' });
    }

    const user = Q.getUserById(db, user_id);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    if (user.role === 'agent') {
      const caller = request.currentUser!;
      if (caller.role !== 'admin' && caller.id !== user.owner_id) {
        return reply.status(403).send({ error: 'Only the agent owner or admin can add this agent' });
      }
      const ownerId = user.owner_id;
      if (ownerId && !Q.isChannelMember(db, channelId, ownerId)) {
        return reply.status(409).send({ error: 'Agent owner must be a member of the channel' });
      }
    }

    Q.addChannelMember(db, channelId, user_id);
    Q.insertEvent(db, 'member_joined', channelId, { channel_id: channelId, user_id, display_name: user.display_name });

    const addCount = Q.getChannelMembers(db, channelId).length;

    broadcastToChannel(channelId, {
      type: 'user_joined',
      channel_id: channelId,
      user_id,
      display_name: user.display_name,
      member_count: addCount,
    });

    const fullChannel = Q.getChannelWithCounts(db, channelId, user_id);
    broadcastToUser(user_id, { type: 'channel_added', channel: fullChannel ?? channel });

    return reply.status(201).send({ ok: true });
  });

  // Remove member from channel (self-leave bypasses permission check)
  app.delete<{
    Params: { channelId: string; userId: string };
  }>('/api/v1/channels/:channelId/members/:userId', { preHandler: [async (request, reply) => {
    const { userId } = request.params as { userId: string };
    if (request.currentUser?.id === userId) return;
    return requirePermission('channel.manage_members', (req) => `channel:${(req.params as { channelId: string }).channelId}`)(request, reply);
  }] }, async (request, reply) => {
    const { channelId, userId } = request.params;
    const db = getDb();

    const channel = Q.getChannel(db, channelId);
    if (!channel) {
      return reply.status(404).send({ error: 'Channel not found' });
    }

    if (channel.name === 'general') {
      return reply.status(403).send({ error: 'Cannot remove members from #general' });
    }

    const removed = Q.removeChannelMember(db, channelId, userId);
    if (!removed) {
      return reply.status(404).send({ error: 'User is not a member of this channel' });
    }

    const user = Q.getUserById(db, userId);
    Q.insertEvent(db, 'member_left', channelId, { channel_id: channelId, user_id: userId, display_name: user?.display_name });

    const removeCount = Q.getChannelMembers(db, channelId).length;

    broadcastToChannel(channelId, {
      type: 'user_left',
      channel_id: channelId,
      user_id: userId,
      display_name: user?.display_name,
      member_count: removeCount,
    });

    broadcastToUser(userId, { type: 'channel_removed', channel_id: channelId });

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

    if (channel.visibility === 'private') {
      const userId = request.currentUser?.id;
      if (!userId || !Q.canAccessChannel(db, channelId, userId)) {
        return reply.status(404).send({ error: 'Channel not found' });
      }
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

  // Delete channel (soft delete)
  app.delete<{
    Params: { channelId: string };
  }>('/api/v1/channels/:channelId', { preHandler: [
    async (request, reply) => {
      const { channelId } = request.params as { channelId: string };
      const db = getDb();
      const channel = Q.getChannelIncludingDeleted(db, channelId);
      if (!channel || channel.deleted_at) {
        return reply.status(204).send();
      }
    },
    requirePermission('channel.delete', (req) => `channel:${(req.params as { channelId: string }).channelId}`)
  ] }, async (request, reply) => {
    const { channelId } = request.params;
    const db = getDb();

    const channel = Q.getChannelIncludingDeleted(db, channelId);
    if (!channel) {
      return reply.status(404).send({ error: 'Channel not found' });
    }

    if (channel.type === 'dm') {
      return reply.status(403).send({ error: 'Cannot delete DM channels' });
    }

    if (channel.name === 'general') {
      return reply.status(403).send({ error: 'Cannot delete #general' });
    }

    const memberIds = Q.getChannelMembers(db, channelId).map((m) => m.user_id);

    const ok = Q.softDeleteChannel(db, channelId);
    if (!ok) {
      return reply.status(404).send({ error: 'Channel not found' });
    }

    // Clean up orphaned permissions for this channel
    db.prepare("DELETE FROM user_permissions WHERE scope = ?").run(`channel:${channelId}`);

    const payload = { channel_id: channelId, name: channel.name };
    Q.insertEvent(db, 'channel_deleted', channelId, payload);

    broadcastToChannel(channelId, { type: 'channel_deleted', ...payload });
    for (const uid of memberIds) {
      broadcastToUser(uid, { type: 'channel_deleted', ...payload });
    }

    return { ok: true };
  });
}
