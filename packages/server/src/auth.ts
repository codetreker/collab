import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getDb } from './db.js';
import { getUserByApiKey, getUserById, createUser } from './queries.js';
import type { User } from './types.js';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: User;
  }
}

const CF_ACCESS_TEAM_DOMAIN = process.env.CF_ACCESS_TEAM_DOMAIN ?? '';
const CF_ACCESS_AUD = process.env.CF_ACCESS_AUD ?? '';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getCfJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    const certsUrl = new URL(`https://${CF_ACCESS_TEAM_DOMAIN}.cloudflareaccess.com/cdn-cgi/access/certs`);
    jwks = createRemoteJWKSet(certsUrl);
  }
  return jwks;
}

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
    if (process.env.NODE_ENV === 'production' && CF_ACCESS_TEAM_DOMAIN && CF_ACCESS_AUD) {
      try {
        const { payload } = await jwtVerify(cfJwt, getCfJwks(), {
          audience: CF_ACCESS_AUD,
        });

        const email = payload.email as string | undefined;
        if (!email) {
          return reply.status(401).send({ error: 'No email in JWT' });
        }

        const userId = `cf-${email}`;
        let user = getUserById(db, userId);
        if (!user) {
          user = createUser(db, userId, email.split('@')[0]!, 'member');
        }
        request.currentUser = user;
        return;
      } catch {
        return reply.status(401).send({ error: 'Invalid CF Access JWT' });
      }
    } else {
      const adminUser = db
        .prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1")
        .get() as User | undefined;
      if (adminUser) {
        request.currentUser = adminUser;
        return;
      }
    }
  }

  // Dev mode bypass
  if (process.env.NODE_ENV !== 'production') {
    const devUserId = request.headers['x-dev-user-id'] as string | undefined;
    if (devUserId) {
      const user = getUserById(db, devUserId);
      if (user) {
        request.currentUser = user;
        return;
      }
      return reply.status(401).send({ error: 'Invalid dev user ID' });
    }

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
