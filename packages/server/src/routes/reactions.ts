import type { FastifyInstance } from 'fastify';
import { getDb } from '../db.js';
import * as Q from '../queries.js';
import { broadcastToChannel } from '../ws.js';

export function registerReactionRoutes(app: FastifyInstance): void {
  app.put<{
    Params: { messageId: string };
    Body: { emoji: string };
  }>('/api/v1/messages/:messageId/reactions', async (request, reply) => {
    const userId = request.currentUser?.id;
    if (!userId) return reply.status(401).send({ error: 'Authentication required' });

    const { messageId } = request.params;
    const { emoji } = request.body ?? {};
    if (!emoji || typeof emoji !== 'string') {
      return reply.status(400).send({ error: 'emoji is required' });
    }

    const db = getDb();
    const message = Q.getMessageById(db, messageId);
    if (!message) return reply.status(404).send({ error: 'Message not found' });

    if (!Q.isChannelMember(db, message.channel_id, userId)) {
      return reply.status(403).send({ error: 'Not a member of this channel' });
    }

    const distinctCount = Q.getReactionCountForMessage(db, messageId);
    if (distinctCount >= 20) {
      const existing = db.prepare(
        'SELECT 1 FROM message_reactions WHERE message_id = ? AND emoji = ? LIMIT 1',
      ).get(messageId, emoji);
      if (!existing) {
        return reply.status(429).send({ error: 'Maximum 20 different emoji reactions per message' });
      }
    }

    Q.addReaction(db, messageId, userId, emoji);
    const reactions = Q.getReactionsByMessageId(db, messageId);
    broadcastToChannel(message.channel_id, {
      type: 'reaction_update',
      message_id: messageId,
      channel_id: message.channel_id,
      reactions,
    });
    return { ok: true, reactions };
  });

  app.delete<{
    Params: { messageId: string };
    Body: { emoji: string };
  }>('/api/v1/messages/:messageId/reactions', async (request, reply) => {
    const userId = request.currentUser?.id;
    if (!userId) return reply.status(401).send({ error: 'Authentication required' });

    const { messageId } = request.params;
    const { emoji } = request.body ?? {};
    if (!emoji || typeof emoji !== 'string') {
      return reply.status(400).send({ error: 'emoji is required' });
    }

    const db = getDb();
    const message = Q.getMessageById(db, messageId);
    if (!message) return reply.status(404).send({ error: 'Message not found' });

    if (!Q.isChannelMember(db, message.channel_id, userId)) {
      return reply.status(403).send({ error: 'Not a member of this channel' });
    }

    Q.removeReaction(db, messageId, userId, emoji);
    const reactions = Q.getReactionsByMessageId(db, messageId);
    broadcastToChannel(message.channel_id, {
      type: 'reaction_update',
      message_id: messageId,
      channel_id: message.channel_id,
      reactions,
    });
    return { ok: true, reactions };
  });

  app.get<{
    Params: { messageId: string };
  }>('/api/v1/messages/:messageId/reactions', async (request, reply) => {
    const userId = request.currentUser?.id;
    if (!userId) return reply.status(401).send({ error: 'Authentication required' });

    const { messageId } = request.params;
    const db = getDb();
    const message = Q.getMessageById(db, messageId);
    if (!message) return reply.status(404).send({ error: 'Message not found' });

    if (!Q.isChannelMember(db, message.channel_id, userId)) {
      return reply.status(403).send({ error: 'Not a member of this channel' });
    }

    const reactions = Q.getReactionsByMessageId(db, messageId);
    return { reactions };
  });
}
