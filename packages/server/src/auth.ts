import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from './db.js';
import { getUserByApiKey, getUserById, getUserByEmail } from './queries.js';
import type { User } from './types.js';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: User;
  }
}

const JWT_SECRET = process.env.JWT_SECRET ?? '';

if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production');
}

const COOKIE_NAME = 'collab_token';

interface JwtPayload {
  userId: string;
  email: string;
}

function extractCookie(request: FastifyRequest): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/(?:^|;\s*)collab_token=([^;]+)/);
  return match?.[1];
}

function verifyJwt(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

function isSecureCookie(): boolean {
  const host = process.env.HOST ?? '';
  return host !== 'localhost' && host !== '127.0.0.1' && process.env.NODE_ENV !== 'development';
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const db = getDb();

  // 1. JWT cookie → browser auth
  const token = extractCookie(request);
  if (token) {
    const payload = verifyJwt(token);
    if (payload) {
      const user = getUserById(db, payload.userId);
      if (user) {
        request.currentUser = user;
        return;
      }
    }
    return reply.status(401).send({ error: 'Invalid or expired token' });
  }

  // 2. Bearer token → API key auth (agents)
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

  // 3. Dev mode bypass
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
    const { api_key, password_hash, ...user } = request.currentUser;
    return { user };
  });

  app.post('/api/v1/auth/login', async (request, reply) => {
    const { email, password } = request.body as { email?: string; password?: string };
    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required' });
    }

    const db = getDb();
    const user = getUserByEmail(db, email);
    if (!user || !user.password_hash) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const tokenPayload: JwtPayload = { userId: user.id, email };
    const signed = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });

    const secure = isSecureCookie();
    reply.header(
      'Set-Cookie',
      `${COOKIE_NAME}=${signed}; HttpOnly; Path=/; SameSite=Lax${secure ? '; Secure' : ''}; Max-Age=${7 * 24 * 60 * 60}`,
    );

    const { api_key, password_hash, ...safeUser } = user;
    return { user: safeUser };
  });

  app.post('/api/v1/auth/logout', async (_request, reply) => {
    const secure = isSecureCookie();
    reply.header(
      'Set-Cookie',
      `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax${secure ? '; Secure' : ''}; Max-Age=0`,
    );
    return { ok: true };
  });
}
