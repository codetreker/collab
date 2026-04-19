import type { FastifyInstance } from 'fastify';
import { getDb } from '../db.js';
import * as Q from '../queries.js';

import type { EventRow } from '../types.js';

type EventRows = EventRow[];

const waiters: Array<{
  cursor: number;
  channelIds?: string[];
  resolve: (events: EventRows) => void;
  timer: ReturnType<typeof setTimeout>;
}> = [];

function notifyWaiters(): void {
  const db = getDb();
  const toRemove: number[] = [];

  for (let i = 0; i < waiters.length; i++) {
    const w = waiters[i]!;
    const events = Q.getEventsSince(db, w.cursor, 100, w.channelIds);
    if (events.length > 0) {
      clearTimeout(w.timer);
      (w.resolve as (events: EventRows) => void)(events);
      toRemove.push(i);
    }
  }

  for (let i = toRemove.length - 1; i >= 0; i--) {
    waiters.splice(toRemove[i]!, 1);
  }
}

export function signalNewEvents(): void {
  notifyWaiters();
}

export function registerPollRoutes(app: FastifyInstance): void {
  app.post<{
    Body: {
      api_key: string;
      cursor?: number;
      since_id?: string;
      timeout_ms?: number;
      channel_ids?: string[];
    };
  }>('/api/v1/poll', async (request, reply) => {
    const { api_key, cursor, since_id, timeout_ms = 30000, channel_ids } = request.body ?? {};

    if (!api_key || typeof api_key !== 'string') {
      return reply.status(401).send({ error: 'API key is required' });
    }

    const db = getDb();
    const user = Q.getUserByApiKey(db, api_key);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    db.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").run(Date.now(), user.id);

    const userChannelIds = (db.prepare("SELECT channel_id FROM channel_members WHERE user_id = ?").all(user.id) as { channel_id: string }[]).map(r => r.channel_id);

    let currentCursor: number;

    if (since_id && typeof since_id === 'string') {
      const msg = Q.getMessageById(db, since_id);
      if (!msg) {
        return reply.status(404).send({ error: 'Message not found for since_id' });
      }
      const eventRow = db.prepare(
        "SELECT cursor FROM events WHERE kind = 'message' AND json_extract(payload, '$.id') = ? LIMIT 1",
      ).get(since_id) as { cursor: number } | undefined;
      currentCursor = eventRow?.cursor ?? 0;
    } else {
      currentCursor = cursor ?? 0;
    }

    const effectiveChannelIds = channel_ids && Array.isArray(channel_ids) && channel_ids.length > 0
      ? channel_ids.filter(id => userChannelIds.includes(id))
      : userChannelIds;

    if (effectiveChannelIds.length === 0) {
      const timeoutDuration = Math.min(Math.max(timeout_ms, 1000), 60000);
      return new Promise<{ cursor: number; events: EventRows }>((resolve) => {
        setTimeout(() => {
          resolve({ cursor: Q.getLatestCursor(db), events: [] });
        }, timeoutDuration);
      });
    }

    const filteredChannelIds = effectiveChannelIds;

    const events = Q.getEventsSince(db, currentCursor, 100, filteredChannelIds);
    if (events.length > 0) {
      const latestCursor = events[events.length - 1]!.cursor;
      return { cursor: latestCursor, events };
    }

    const timeoutDuration = Math.min(Math.max(timeout_ms, 1000), 60000);

    return new Promise<{ cursor: number; events: EventRows }>((resolve) => {
      const timer = setTimeout(() => {
        const idx = waiters.findIndex((w) => w.timer === timer);
        if (idx >= 0) waiters.splice(idx, 1);
        resolve({ cursor: Q.getLatestCursor(db), events: [] });
      }, timeoutDuration);

      waiters.push({
        cursor: currentCursor,
        channelIds: filteredChannelIds,
        resolve: (events: EventRows) => {
          const latestCursor = events.length > 0 ? events[events.length - 1]!.cursor : Q.getLatestCursor(db);
          resolve({ cursor: latestCursor, events });
        },
        timer,
      });
    });
  });
}
