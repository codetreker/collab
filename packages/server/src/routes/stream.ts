import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { getDb } from '../db.js';
import * as Q from '../queries.js';
import type { User } from '../types.js';
import { pluginManager } from '../plugin-manager.js';

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
  dead: boolean;
}

const sseClients: SSEClient[] = [];

export function getSSEClients(): SSEClient[] {
  return sseClients;
}

export function removeSSEClient(client: SSEClient): void {
  if (client.dead) return;
  client.dead = true;
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

export async function writeSafe(client: SSEClient, chunk: string): Promise<boolean> {
  if (client.dead) return false;
  try {
    const ok = client.res.raw.write(chunk);
    if (!ok) {
      await new Promise<void>((resolve, reject) => {
        const onDrain = (): void => {
          client.res.raw.off('error', onError);
          client.res.raw.off('close', onClose);
          resolve();
        };
        const onError = (err: Error): void => {
          client.res.raw.off('drain', onDrain);
          client.res.raw.off('close', onClose);
          reject(err);
        };
        const onClose = (): void => {
          client.res.raw.off('drain', onDrain);
          client.res.raw.off('error', onError);
          reject(new Error('closed'));
        };
        client.res.raw.once('drain', onDrain);
        client.res.raw.once('error', onError);
        client.res.raw.once('close', onClose);
      });
    }
    return !client.dead;
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
      if (user) {
        if (user.deleted_at || user.disabled) return null;
        return user;
      }
    } catch {
      /* fall through */
    }
  }

  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const apiKey = authHeader.slice(7);
    const user = Q.getUserByApiKey(db, apiKey);
    if (user) {
      if (user.deleted_at || user.disabled) return null;
      return user;
    }
  }

  // Deprecated: query string api_key (will be removed in a future version)
  const q = request.query as { api_key?: string } | undefined;
  if (q?.api_key && typeof q.api_key === 'string') {
    console.warn('[stream] Authenticated via deprecated query string api_key');
    const user = Q.getUserByApiKey(db, q.api_key);
    if (user) {
      if (user.deleted_at || user.disabled) return null;
      return user;
    }
  }

  return null;
}

export function parseLastEventId(request: FastifyRequest): number | null {
  const raw = request.headers['last-event-id'];
  if (!raw || typeof raw !== 'string') return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function touchLastSeen(userId: string): void {
  try {
    getDb().prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(Date.now(), userId);
  } catch {
    /* ignore */
  }
}

export function registerStreamRoutes(app: FastifyInstance): void {
  // HEAD probe: used by plugin auto-mode to detect SSE availability without auth churn.
  app.route({
    method: 'HEAD',
    url: '/api/v1/stream',
    handler: async (_request, reply) => {
      return reply.status(200).send();
    },
  });

  app.get('/api/v1/stream', async (request, reply) => {
    const user = authenticate(request);
    if (!user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const db = getDb();
    const lastEventId = parseLastEventId(request);
    const startCursor = lastEventId ?? Q.getLatestCursor(db);

    // Hijack Fastify so it doesn't try to finalize the response after we return.
    reply.hijack();

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
      dead: false,
    };

    clearInterval(client.heartbeatTimer);
    clearInterval(client.channelRefreshTimer);

    client.heartbeatTimer = setInterval(() => {
      if (client.dead) return;
      const latest = Q.getLatestCursor(getDb());
      void writeSafe(client, `event: heartbeat\nid: ${latest}\ndata: {}\n\n`);
      touchLastSeen(client.userId);
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

    touchLastSeen(user.id);

    void writeSafe(client, `:connected\n\n`);

    void backfillAndReady(client, lastEventId !== null);
  });
}

async function backfillAndReady(client: SSEClient, hasLastEventId: boolean): Promise<void> {
  if (hasLastEventId) {
    await backfillLoop(client);
  }

  client.ready = true;

  // drain-until-stable: catch events that slipped in between backfill end and ready=true
  while (!client.dead) {
    const drained = await drainPending(client);
    if (drained === 0) break;
  }
}

async function backfillLoop(client: SSEClient): Promise<void> {
  const db = getDb();
  const LIMIT = 100;
  const changeKinds = Array.from(CHANNEL_CHANGE_KINDS);

  while (!client.dead) {
    const events = Q.getEventsSinceWithChanges(
      db,
      client.lastCursor,
      LIMIT,
      client.cachedChannelIds,
      changeKinds,
    );
    if (events.length === 0) return;

    for (const ev of events) {
      if (!(await processEvent(client, ev))) return;
    }

    if (events.length < LIMIT) return;
    // Yield to the event loop so we don't starve other requests during large backfills.
    await new Promise<void>((r) => setImmediate(r));
  }
}

async function drainPending(client: SSEClient): Promise<number> {
  const db = getDb();
  const LIMIT = 100;
  const changeKinds = Array.from(CHANNEL_CHANGE_KINDS);
  let total = 0;

  while (!client.dead) {
    const events = Q.getEventsSinceWithChanges(
      db,
      client.lastCursor,
      LIMIT,
      client.cachedChannelIds,
      changeKinds,
    );
    if (events.length === 0) return total;

    for (const ev of events) {
      if (!(await processEvent(client, ev))) return total;
    }
    total += events.length;

    if (events.length < LIMIT) return total;
    await new Promise<void>((r) => setImmediate(r));
  }
  return total;
}

/** Returns true if the client is still alive after processing this event. */
export async function processEvent(
  client: SSEClient,
  event: { cursor: number; kind: string; channel_id: string; payload: string },
): Promise<boolean> {
  if (client.dead) return false;
  const db = getDb();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(event.payload) as Record<string, unknown>;
  } catch {
    client.lastCursor = event.cursor;
    return !client.dead;
  }

  if (CHANNEL_CHANGE_KINDS.has(event.kind)) {
    const ch = payload['channel'] as { created_by?: string } | undefined;
    const payloadUserId = payload['user_id'] as string | undefined;
    let isRelevant =
      payloadUserId === client.userId ||
      ch?.created_by === client.userId ||
      client.cachedChannelIds.includes(event.channel_id);

    if (!isRelevant && event.kind === 'channel_deleted') {
      const row = db
        .prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?')
        .get(event.channel_id, client.userId);
      if (row !== undefined) isRelevant = true;
    }

    if (!isRelevant) {
      const refreshed = Q.getUserChannelIds(db, client.userId);
      if (refreshed.includes(event.channel_id)) {
        client.cachedChannelIds = refreshed;
        isRelevant = true;
      }
    }

    if (isRelevant) {
      client.cachedChannelIds = Q.getUserChannelIds(db, client.userId);
      const ok = await writeSafe(
        client,
        `event: ${event.kind}\nid: ${event.cursor}\ndata: ${event.payload}\n\n`,
      );
      client.lastCursor = event.cursor;
      return ok && !client.dead;
    }
    client.lastCursor = event.cursor;
    return !client.dead;
  }

  const senderId = payload['sender_id'] as string | undefined;
  if (senderId === client.userId) {
    client.lastCursor = event.cursor;
    return !client.dead;
  }

  const ok = await writeSafe(
    client,
    `event: ${event.kind}\nid: ${event.cursor}\ndata: ${event.payload}\n\n`,
  );
  client.lastCursor = event.cursor;
  return ok && !client.dead;
}

export async function notifySSEClients(): Promise<void> {
  const db = getDb();
  const changeKinds = Array.from(CHANNEL_CHANGE_KINDS);

  for (const client of [...sseClients]) {
    if (!client.ready || client.dead) continue;

    try {
      const events = Q.getEventsSinceWithChanges(
        db,
        client.lastCursor,
        100,
        client.cachedChannelIds,
        changeKinds,
      );
      for (const ev of events) {
        if (!(await processEvent(client, ev))) break;
      }
    } catch {
      removeSSEClient(client);
    }
  }

  notifyPluginWsClients();
}

const pluginCursors = new Map<string, number>();

function notifyPluginWsClients(): void {
  const db = getDb();
  const agentIds = pluginManager.getConnectedAgentIds();
  console.log('[DEBUG notifyPluginWsClients] agentIds:', agentIds);

  for (const agentId of agentIds) {
    const conn = pluginManager.getConnection(agentId);
    if (!conn || conn.ws.readyState !== 1) {
      pluginCursors.delete(agentId);
      continue;
    }

    let cursor = pluginCursors.get(agentId);
    if (cursor == null) {
      cursor = Q.getLatestCursor(db);
      pluginCursors.set(agentId, cursor);
      console.log('[DEBUG] initialized cursor for', agentId, '=', cursor);
      continue;
    }

    const channelIds = Q.getUserChannelIds(db, conn.userId);
    const changeKinds = Array.from(CHANNEL_CHANGE_KINDS);

    try {
      const events = Q.getEventsSinceWithChanges(db, cursor, 100, channelIds, changeKinds);
      console.log('[DEBUG] events for', agentId, 'since cursor', cursor, ':', events.length, 'channelIds:', channelIds);
      for (const ev of events) {
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(ev.payload) as Record<string, unknown>;
        } catch {
          pluginCursors.set(agentId, ev.cursor);
          continue;
        }

        pluginManager.pushEvent(agentId, ev.kind, payload);
        pluginCursors.set(agentId, ev.cursor);
      }
    } catch {
      /* ignore */
    }
  }
}
