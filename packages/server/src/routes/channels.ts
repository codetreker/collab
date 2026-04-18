import type { FastifyInstance } from 'fastify';
import { getDb } from '../db.js';
import * as Q from '../queries.js';

export function registerChannelRoutes(app: FastifyInstance): void {
  // List channels
  app.get('/api/v1/channels', async () => {
    const db = getDb();
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
    return reply.status(201).send({ channel });
  });
}
