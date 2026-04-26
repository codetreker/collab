import type { FastifyInstance } from 'fastify';
import { getDb } from '../db.js';
import * as Q from '../queries.js';

export function registerUserRoutes(app: FastifyInstance): void {
  app.get('/api/v1/users', async (request, reply) => {
    if (!request.currentUser) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const db = getDb();
    const users = Q.getVisibleUsers(db, request.currentUser.id);
    return { users };
  });
}
