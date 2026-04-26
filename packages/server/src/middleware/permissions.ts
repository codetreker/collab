import type { FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../db.js';

export function requirePermission(
  permission: string,
  scopeResolver?: (req: FastifyRequest) => string,
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.currentUser;
    if (!user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    if (user.role === 'admin') return;

    const scope = scopeResolver ? scopeResolver(request) : '*';
    const db = getDb();
    const row = db.prepare(
      `SELECT 1 FROM user_permissions
       WHERE user_id = ? AND permission = ? AND (scope = '*' OR scope = ?)
       LIMIT 1`,
    ).get(user.id, permission, scope);

    if (!row) {
      return reply.status(403).send({ error: 'Permission denied', required_permission: permission, scope });
    }
  };
}
