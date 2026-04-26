import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db.js';
import { getUserByApiKey, getUserById, getUserByEmail } from './queries.js';
import * as Q from './queries.js';
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

const COOKIE_NAME = 'borgee_token';

interface JwtPayload {
  userId: string;
  email: string;
}

function extractCookie(request: FastifyRequest): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/(?:^|;\s*)borgee_token=([^;]+)/);
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
        if (user.deleted_at) return reply.status(401).send({ error: 'account_deleted' });
        if (user.disabled) return reply.status(401).send({ error: 'account_disabled' });
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
      if (user.deleted_at) return reply.status(401).send({ error: 'account_deleted' });
      if (user.disabled) return reply.status(401).send({ error: 'account_disabled' });
      request.currentUser = user;
      return;
    }
    return reply.status(401).send({ error: 'Invalid API key' });
  }

  // 3. Dev mode bypass (explicit opt-in only)
  if (process.env.NODE_ENV === 'development' && process.env.DEV_AUTH_BYPASS === 'true') {
    const devUserId = request.headers['x-dev-user-id'] as string | undefined;
    if (devUserId) {
      const user = getUserById(db, devUserId);
      if (user) {
        if (user.deleted_at) return reply.status(401).send({ error: 'account_deleted' });
        if (user.disabled) return reply.status(401).send({ error: 'account_disabled' });
        request.currentUser = user;
        return;
      }
      return reply.status(401).send({ error: 'Invalid dev user ID' });
    }

    const adminUser = db
      .prepare("SELECT * FROM users WHERE role = 'admin' AND deleted_at IS NULL AND disabled = 0 LIMIT 1")
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
    const db = getDb();
    let permissions: string[];
    if (user.role === 'admin') {
      permissions = ['*'];
    } else {
      const rows = db.prepare('SELECT permission FROM user_permissions WHERE user_id = ?').all(user.id) as { permission: string }[];
      permissions = rows.map((r) => r.permission);
    }
    return { user: { ...user, permissions } };
  });

  app.get('/api/v1/me/permissions', async (request, reply) => {
    if (!request.currentUser) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }
    const user = request.currentUser;
    const db = getDb();
    if (user.role === 'admin') {
      return { user_id: user.id, role: 'admin', permissions: ['*'], details: [] };
    }
    const details = db.prepare(
      'SELECT id, permission, scope, granted_by, granted_at FROM user_permissions WHERE user_id = ? ORDER BY granted_at ASC'
    ).all(user.id) as { id: number; permission: string; scope: string; granted_by: string | null; granted_at: number }[];
    return {
      user_id: user.id,
      role: user.role,
      permissions: details.map((d) => d.permission),
      details,
    };
  });

  app.post('/api/v1/auth/register', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { invite_code, email: rawEmail, password, display_name } = request.body as {
      invite_code?: string; email?: string; password?: string; display_name?: string;
    };

    if (!invite_code || !rawEmail || !password || !display_name) {
      return reply.status(400).send({ error: 'All fields are required' });
    }

    const email = rawEmail.toLowerCase().trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return reply.status(400).send({ error: 'Invalid email format' });
    }

    const passwordBytes = Buffer.byteLength(password, 'utf8');
    if (passwordBytes < 8) {
      return reply.status(400).send({ error: 'Password must be at least 8 characters' });
    }
    if (passwordBytes > 72) {
      return reply.status(400).send({ error: 'Password must be at most 72 characters' });
    }

    const trimmedName = display_name.trim();
    if (trimmedName.length < 1 || trimmedName.length > 50) {
      return reply.status(400).send({ error: 'Display name must be 1-50 characters' });
    }

    const db = getDb();

    const passwordHash = bcrypt.hashSync(password, 10);
    const userId = uuidv4();

    const txn = db.transaction(() => {
      if (getUserByEmail(db, email)) {
        throw new Error('EMAIL_EXISTS');
      }

      const invite = Q.getInviteCode(db, invite_code);
      if (!invite || invite.used_by || (invite.expires_at && invite.expires_at <= Date.now())) {
        throw new Error('INVITE_INVALID');
      }

      Q.createUser(db, userId, trimmedName, 'member', null, email, passwordHash);
      Q.consumeInviteCode(db, invite_code, userId);
      Q.grantDefaultPermissions(db, userId, 'member');
      Q.addUserToPublicChannels(db, userId);

      const tokenPayload: JwtPayload = { userId, email };
      const signed = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });
      return signed;
    });

    let signed: string;
    try {
      signed = txn();
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'INVITE_INVALID') {
          return reply.status(404).send({ error: 'Invalid or expired invite code' });
        }
        if (err.message === 'EMAIL_EXISTS') {
          return reply.status(409).send({ error: 'Email already registered' });
        }
      }
      throw err;
    }

    const secure = isSecureCookie();
    reply.header(
      'Set-Cookie',
      `${COOKIE_NAME}=${signed}; HttpOnly; Path=/; SameSite=Lax${secure ? '; Secure' : ''}; Max-Age=${7 * 24 * 60 * 60}`,
    );

    const user = getUserById(db, userId);
    const { api_key, password_hash, ...safeUser } = user!;
    return reply.status(201).send({ user: safeUser });
  });

  app.post('/api/v1/auth/login', async (request, reply) => {
    const { email: rawEmail, password } = request.body as { email?: string; password?: string };
    if (!rawEmail || !password) {
      return reply.status(400).send({ error: 'Email and password are required' });
    }

    const email = rawEmail.toLowerCase().trim();
    const db = getDb();
    const user = getUserByEmail(db, email);
    if (!user || !user.password_hash) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    if (user.deleted_at) return reply.status(401).send({ error: 'account_deleted' });
    if (user.disabled) return reply.status(401).send({ error: 'account_disabled' });

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
