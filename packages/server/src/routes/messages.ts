import type { FastifyInstance } from 'fastify';
import { getDb } from '../db.js';
import * as Q from '../queries.js';
import { requirePermission } from '../middleware/permissions.js';

export function registerMessageRoutes(app: FastifyInstance): void {
  // Get messages for a channel
  app.get<{
    Params: { channelId: string };
    Querystring: { before?: string; limit?: string; after?: string };
  }>('/api/v1/channels/:channelId/messages', async (request, reply) => {
    const { channelId } = request.params;
    const before = request.query.before ? parseInt(request.query.before, 10) : undefined;
    const after = request.query.after ? parseInt(request.query.after, 10) : undefined;
    const limit = request.query.limit ? Math.min(parseInt(request.query.limit, 10), 100) : 50;

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

    const result = Q.getMessages(db, channelId, before, limit, after);
    const messageIds = result.messages.map(m => m.id);
    const reactionsMap = Q.getReactionsForMessages(db, messageIds);
    const messagesWithReactions = result.messages.map(m => ({
      ...m,
      reactions: reactionsMap.get(m.id) ?? [],
    }));
    return { messages: messagesWithReactions, has_more: result.has_more };
  });

  // Search messages in a channel
  app.get<{
    Params: { channelId: string };
    Querystring: { q?: string };
  }>('/api/v1/channels/:channelId/messages/search', async (request, reply) => {
    const { channelId } = request.params;
    const q = request.query.q;

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return reply.status(400).send({ error: 'Search query (q) is required' });
    }

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

    const messages = Q.searchMessages(db, channelId, q.trim(), 50);
    return { messages };
  });

  // Create message
  app.post<{
    Params: { channelId: string };
    Body: {
      content: string;
      content_type?: string;
      reply_to_id?: string;
      mentions?: string[];
    };
  }>('/api/v1/channels/:channelId/messages', { preHandler: [requirePermission('message.send', (req) => `channel:${(req.params as { channelId: string }).channelId}`)] }, async (request, reply) => {
    const { channelId } = request.params;
    const { content, content_type, reply_to_id, mentions } = request.body ?? {};

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return reply.status(400).send({ error: 'Message content is required' });
    }

    const ct = content_type ?? 'text';
    if (ct !== 'text' && ct !== 'image') {
      return reply.status(400).send({ error: "content_type must be 'text' or 'image'" });
    }

    const db = getDb();
    const channel = Q.getChannel(db, channelId);
    if (!channel) {
      return reply.status(404).send({ error: 'Channel not found' });
    }

    const senderId = request.currentUser?.id;
    if (!senderId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    if (channel.visibility === 'private' && !Q.canAccessChannel(db, channelId, senderId)) {
      return reply.status(404).send({ error: 'Channel not found' });
    }

    if (!Q.isChannelMember(db, channelId, senderId)) {
      return reply.status(403).send({ error: 'Not a member of this channel' });
    }

    const message = Q.createMessage(
      db,
      channelId,
      senderId,
      content.trim(),
      ct,
      reply_to_id ?? null,
      mentions ?? [],
    );

    const { broadcastToChannel } = await import('../ws.js');
    broadcastToChannel(channelId, {
      type: 'new_message',
      message,
    });

    return reply.status(201).send({ message });
  });

  // Edit message
  app.put<{
    Params: { messageId: string };
    Body: { content: string };
  }>('/api/v1/messages/:messageId', async (request, reply) => {
    const { messageId } = request.params;
    const { content } = request.body ?? {};

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return reply.status(400).send({ error: 'Content is required' });
    }

    const senderId = request.currentUser?.id;
    if (!senderId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const db = getDb();
    const existing = Q.getMessageById(db, messageId);
    if (!existing) {
      return reply.status(404).send({ error: 'Message not found' });
    }

    if (existing.deleted_at) {
      return reply.status(400).send({ error: 'Cannot edit deleted message' });
    }

    if (existing.sender_id !== senderId) {
      return reply.status(403).send({ error: 'Can only edit your own messages' });
    }

    const message = Q.updateMessageContent(db, messageId, content.trim());

    const { broadcastToChannel } = await import('../ws.js');
    broadcastToChannel(existing.channel_id, {
      type: 'message_edited',
      message,
    });

    const senderName = request.currentUser?.display_name ?? senderId;
    Q.insertEvent(db, 'message_edited', existing.channel_id, {
      ...message,
      sender_id: senderId,
      system_message: `用户 ${senderName} 编辑了消息`,
    });

    return { message };
  });

  // Delete message (soft delete)
  app.delete<{
    Params: { messageId: string };
  }>('/api/v1/messages/:messageId', async (request, reply) => {
    const { messageId } = request.params;

    const senderId = request.currentUser?.id;
    if (!senderId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const db = getDb();
    const existing = Q.getMessageById(db, messageId);
    if (!existing) {
      return reply.status(404).send({ error: 'Message not found' });
    }

    // Already deleted — idempotent
    if (existing.deleted_at) {
      return reply.status(204).send();
    }

    const isAdmin = request.currentUser?.role === 'admin';
    if (existing.sender_id !== senderId && !isAdmin) {
      return reply.status(403).send({ error: 'Permission denied' });
    }

    const { deleted_at } = Q.softDeleteMessage(db, messageId);

    const { broadcastToChannel } = await import('../ws.js');
    broadcastToChannel(existing.channel_id, {
      type: 'message_deleted',
      message_id: existing.id,
      channel_id: existing.channel_id,
      deleted_at,
    });

    const senderName = request.currentUser?.display_name ?? senderId;
    Q.insertEvent(db, 'message_deleted', existing.channel_id, {
      message_id: existing.id,
      channel_id: existing.channel_id,
      deleted_at,
      sender_id: senderId,
      system_message: `用户 ${senderName} 删除了一条消息`,
    });

    return reply.status(204).send();
  });
}
