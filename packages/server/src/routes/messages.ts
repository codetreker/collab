import type { FastifyInstance } from 'fastify';
import { getDb } from '../db.js';
import * as Q from '../queries.js';

export function registerMessageRoutes(app: FastifyInstance): void {
  // Get messages for a channel
  app.get<{
    Params: { channelId: string };
    Querystring: { before?: string; limit?: string };
  }>('/api/v1/channels/:channelId/messages', async (request, reply) => {
    const { channelId } = request.params;
    const before = request.query.before ? parseInt(request.query.before, 10) : undefined;
    const limit = request.query.limit ? Math.min(parseInt(request.query.limit, 10), 100) : 50;

    const db = getDb();
    const channel = Q.getChannel(db, channelId);
    if (!channel) {
      return reply.status(404).send({ error: 'Channel not found' });
    }

    const result = Q.getMessages(db, channelId, before, limit);
    return result;
  });

  // Create message
  app.post<{
    Params: { channelId: string };
    Body: {
      content: string;
      content_type?: 'text' | 'image';
      reply_to_id?: string;
      mentions?: string[];
    };
  }>('/api/v1/channels/:channelId/messages', async (request, reply) => {
    const { channelId } = request.params;
    const { content, content_type, reply_to_id, mentions } = request.body ?? {};

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return reply.status(400).send({ error: 'Message content is required' });
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

    const message = Q.createMessage(
      db,
      channelId,
      senderId,
      content.trim(),
      content_type ?? 'text',
      reply_to_id ?? null,
      mentions ?? [],
    );

    // Broadcast via WebSocket (imported lazily to avoid circular deps)
    const { broadcastToChannel } = await import('../ws.js');
    broadcastToChannel(channelId, {
      type: 'new_message',
      message,
    });

    return reply.status(201).send({ message });
  });
}
