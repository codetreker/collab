import type { FastifyInstance } from 'fastify';
import { getDb } from '../db.js';
import * as Q from '../queries.js';

export function registerUserRoutes(app: FastifyInstance): void {
  app.get('/api/v1/users', async () => {
    const db = getDb();
    const users = Q.listUsers(db);
    return { users };
  });
}
