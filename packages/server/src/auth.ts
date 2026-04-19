import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getDb } from './db.js';
import { getUserByApiKey, getUserById, createUser, addUserToAllChannels } from './queries.js';
import type { User } from './types.js';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: User;
  }
}

const CF_ACCESS_TEAM_DOMAIN = process.env.CF_ACCESS_TEAM_DOMAIN ?? '';
const CF_ACCESS_AUD = process.env.CF_ACCESS_AUD ?? '';

// Log CF Access config status at startup
if (!CF_ACCESS_TEAM_DOMAIN || !CF_ACCESS_AUD) {
  console.warn('[auth] CF_ACCESS_TEAM_DOMAIN or CF_ACCESS_AUD not configured — CF Access JWT verification disabled');
} else {
  console.log(`[auth] CF Access configured: team=${CF_ACCESS_TEAM_DOMAIN}`);
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getCfJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    const certsUrl = new URL(`https://${CF_ACCESS_TEAM_DOMAIN}.cloudflareaccess.com/cdn-cgi/access/certs`);
    jwks = createRemoteJWKSet(certsUrl);
  }
  return jwks;
}

/**
 * Extract CF Access JWT from request — checks both header and cookie.
 * CF proxy sets the header; browser sends the cookie on same-origin requests.
 */
function extractCfJwt(request: FastifyRequest): string | undefined {
  // 1. cf-access-jwt-assertion header (set by CF proxy on every proxied request)
  const headerJwt = request.headers['cf-access-jwt-assertion'] as string | undefined;
  if (headerJwt) return headerJwt;

  // 2. CF_Authorization cookie (set by CF in browser, sent on same-origin fetch/XHR)
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return match?.[1];
}

/**
 * Verify CF Access JWT → return existing or newly-created user.
 * New users are auto-joined to all existing channels.
 */
async function authenticateCfAccess(cfJwt: string): Promise<User | 'invalid' | 'no-config'> {
  if (!CF_ACCESS_TEAM_DOMAIN || !CF_ACCESS_AUD) {
    return 'no-config';
  }

  try {
    const { payload } = await jwtVerify(cfJwt, getCfJwks(), {
      audience: CF_ACCESS_AUD,
    });

    const email = payload.email as string | undefined;
    if (!email) {
      console.warn('[auth] CF Access JWT valid but missing email claim');
      return 'invalid';
    }

    const db = getDb();
    const userId = `cf-${email}`;
    let user = getUserById(db, userId);

    if (!user) {
      const displayName = email.split('@')[0]!;
      user = createUser(db, userId, displayName, 'member');
      const channelCount = addUserToAllChannels(db, userId);
      console.log(`[auth] Created CF Access user: ${userId} (${displayName}), auto-joined ${channelCount} channels`);
    }

    return user;
  } catch (err) {
    console.warn('[auth] CF Access JWT verification failed:', err instanceof Error ? err.message : String(err));
    return 'invalid';
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const db = getDb();

  // 1. Bearer token → API key auth (agents)
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

  // 2. CF Access JWT → browser auth (header or cookie)
  const cfJwt = extractCfJwt(request);
  if (cfJwt) {
    const result = await authenticateCfAccess(cfJwt);

    if (typeof result === 'object') {
      // Successfully authenticated
      request.currentUser = result;
      return;
    }

    if (result === 'invalid') {
      return reply.status(401).send({ error: 'Invalid CF Access JWT' });
    }

    // result === 'no-config'
    if (process.env.NODE_ENV === 'production') {
      console.error('[auth] CF Access JWT present but CF_ACCESS_TEAM_DOMAIN/CF_ACCESS_AUD not configured in production');
      return reply.status(500).send({ error: 'Authentication misconfigured' });
    }
    // In dev mode with no CF config: fall through to dev bypass below
  }

  // 3. Dev mode bypass (only when NODE_ENV is explicitly 'development')
  if (process.env.NODE_ENV === 'development') {
    const devUserId = request.headers['x-dev-user-id'] as string | undefined;
    if (devUserId) {
      const user = getUserById(db, devUserId);
      if (user) {
        request.currentUser = user;
        return;
      }
      return reply.status(401).send({ error: 'Invalid dev user ID' });
    }

    // Fallback: auto-login as first admin in dev
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
