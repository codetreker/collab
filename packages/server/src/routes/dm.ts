import type { FastifyInstance } from 'fastify';
import { getDb } from '../db.js';
import * as Q from '../queries.js';

export function registerDmRoutes(app: FastifyInstance): void {
  // Create or get DM channel with target user
  app.post<{
    Params: { userId: string };
  }>('/api/v1/dm/:userId', async (request, reply) => {
    const { userId: targetUserId } = request.params;
    const currentUserId = request.currentUser?.id;
    if (!currentUserId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    if (currentUserId === targetUserId) {
      return reply.status(400).send({ error: 'Cannot DM yourself' });
    }

    const db = getDb();
    const targetUser = Q.getUserById(db, targetUserId);
    if (!targetUser) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const channel = Q.createDmChannel(db, currentUserId, targetUserId);
    return {
      channel,
      peer: {
        id: targetUser.id,
        display_name: targetUser.display_name,
        avatar_url: targetUser.avatar_url,
        role: targetUser.role,
      },
    };
  });

  // List current user's DM channels
  app.get('/api/v1/dm', async (request, reply) => {
    const currentUserId = request.currentUser?.id;
    if (!currentUserId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const db = getDb();
    const channels = Q.listDmChannelsForUser(db, currentUserId);
    return { channels };
  });
}
