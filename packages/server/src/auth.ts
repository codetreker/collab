import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from './db.js';
import { getUserByApiKey } from './queries.js';
import type { User } from './types.js';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: User;
  }
}

/**
 * Authentication middleware.
 * - Agent: Authorization: Bearer <api_key>
 * - Browser: Cf-Access-Jwt-Assertion header (TODO: full JWT validation)
 *   For now, we accept any request with a valid CF header or use a dev bypass.
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const db = getDb();

  // Check Bearer token (agent auth)
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const apiKey = authHeader.slice(7);
    const user = getUserByApiKey(db, apiKey);
    if (user) {
      request.currentUser = user;
      return;
    }
    return reply.status(401).send({ error: 'Invalid API key' });
  }

  // Check CF Access JWT (browser auth)
  const cfJwt = request.headers['cf-access-jwt-assertion'] as string | undefined;
  if (cfJwt) {
    // TODO: Validate JWT properly in production
    // For now, map to admin user for development
    const adminUser = db
      .prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1")
      .get() as User | undefined;
    if (adminUser) {
      request.currentUser = adminUser;
      return;
    }
  }

  // Dev mode: allow unauthenticated access with default admin user
  if (process.env.NODE_ENV !== 'production') {
    const adminUser = db
      .prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1")
      .get() as User | undefined;
    if (adminUser) {
      request.currentUser = adminUser;
      return;
    }
  }

  return reply.status(401).send({ error: 'Authentication required' });
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.get('/api/v1/users/me', async (request, reply) => {
    if (!request.currentUser) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }
    const { api_key, ...user } = request.currentUser;
    return { user };
  });
}
