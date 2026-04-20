import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { getDb } from '../db.js';
import * as Q from '../queries.js';
import type { User } from '../types.js';

const JWT_SECRET = process.env.JWT_SECRET ?? '';
const HEARTBEAT_MS = 15_000;
const CHANNEL_REFRESH_MS = 60_000;

export const CHANNEL_CHANGE_KINDS = new Set<string>([
  'member_joined',
  'member_left',
  'channel_created',
  'channel_deleted',
  'visibility_changed',
  'user_joined',
  'user_left',
]);

export interface SSEClient {
  userId: string;
  res: FastifyReply;
  heartbeatTimer: ReturnType<typeof setInterval>;
  channelRefreshTimer: ReturnType<typeof setInterval>;
  lastCursor: number;
  cachedChannelIds: string[];
  ready: boolean;
}

const sseClients: SSEClient[] = [];

export function getSSEClients(): SSEClient[] {
  return sseClients;
}

export function removeSSEClient(client: SSEClient): void {
  clearInterval(client.heartbeatTimer);
  clearInterval(client.channelRefreshTimer);
  const idx = sseClients.indexOf(client);
  if (idx >= 0) sseClients.splice(idx, 1);
  try {
    client.res.raw.end();
  } catch {
    /* ignore */
  }
}

export function writeSafe(client: SSEClient, chunk: string): boolean {
  try {
    client.res.raw.write(chunk);
    return true;
  } catch {
    removeSSEClient(client);
    return false;
  }
}

function extractCookie(request: FastifyRequest): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/(?:^|;\s*)collab_token=([^;]+)/);
  return match?.[1];
}

function authenticate(request: FastifyRequest): User | null {
  const db = getDb();

  const token = extractCookie(request);
  if (token && JWT_SECRET) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
      const user = Q.getUserById(db, payload.userId);
      if (user) return user;
    } catch {
      /* fall through */
    }
  }

  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const apiKey = authHeader.slice(7);
    const user = Q.getUserByApiKey(db, apiKey);
    if (user) return user;
  }

  const q = request.query as { api_key?: string } | undefined;
  if (q?.api_key && typeof q.api_key === 'string') {
    const user = Q.getUserByApiKey(db, q.api_key);
    if (user) return user;
  }

  return null;
}

export function parseLastEventId(request: FastifyRequest): number | null {
  const raw = request.headers['last-event-id'];
  if (!raw || typeof raw !== 'string') return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function registerStreamRoutes(app: FastifyInstance): void {
  app.get('/api/v1/stream', async (request, reply) => {
    const user = authenticate(request);
    if (!user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const db = getDb();
    const lastEventId = parseLastEventId(request);
    const startCursor = lastEventId ?? Q.getLatestCursor(db);

    reply.raw.statusCode = 200;
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders?.();

    const channelIds = Q.getUserChannelIds(db, user.id);

    const client: SSEClient = {
      userId: user.id,
      res: reply,
      heartbeatTimer: setInterval(() => {
        /* replaced below */
      }, 1 << 30),
      channelRefreshTimer: setInterval(() => {
        /* replaced below */
      }, 1 << 30),
      lastCursor: startCursor,
      cachedChannelIds: channelIds,
      ready: false,
    };

    clearInterval(client.heartbeatTimer);
    clearInterval(client.channelRefreshTimer);

    client.heartbeatTimer = setInterval(() => {
      writeSafe(client, `:heartbeat\n\n`);
    }, HEARTBEAT_MS);

    client.channelRefreshTimer = setInterval(() => {
      try {
        client.cachedChannelIds = Q.getUserChannelIds(getDb(), client.userId);
      } catch {
        /* ignore */
      }
    }, CHANNEL_REFRESH_MS);

    sseClients.push(client);

    const onClose = (): void => {
      removeSSEClient(client);
    };
    request.raw.on('close', onClose);
    reply.raw.on('close', onClose);
    reply.raw.on('error', onClose);

    try {
      db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(Date.now(), user.id);
    } catch {
      /* ignore */
    }

    writeSafe(client, `:connected\n\n`);

    return reply;
  });
}
