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
    return result;
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
}
