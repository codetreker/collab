import type { FastifyInstance } from 'fastify';
import { getDb } from '../db.js';
import * as Q from '../queries.js';

import type { EventRow } from '../types.js';

type EventRows = EventRow[];

// In-memory waiters for long-polling
const waiters: Array<{
  cursor: number;
  resolve: (events: EventRows) => void;
  timer: ReturnType<typeof setTimeout>;
}> = [];

function notifyWaiters(): void {
  const db = getDb();
  const toRemove: number[] = [];

  for (let i = 0; i < waiters.length; i++) {
    const w = waiters[i]!;
    const events = Q.getEventsSince(db, w.cursor);
    if (events.length > 0) {
      clearTimeout(w.timer);
      (w.resolve as (events: EventRows) => void)(events);
      toRemove.push(i);
    }
  }

  // Remove resolved waiters (reverse order to keep indices stable)
  for (let i = toRemove.length - 1; i >= 0; i--) {
    waiters.splice(toRemove[i]!, 1);
  }
}

// Called after inserting events
export function signalNewEvents(): void {
  notifyWaiters();
}

export function registerPollRoutes(app: FastifyInstance): void {
  app.post<{
    Body: { api_key: string; cursor: number; timeout_ms?: number };
  }>('/api/v1/poll', async (request, reply) => {
    const { api_key, cursor, timeout_ms = 30000 } = request.body ?? {};

    if (!api_key || typeof api_key !== 'string') {
      return reply.status(401).send({ error: 'API key is required' });
    }

    const db = getDb();
    const user = Q.getUserByApiKey(db, api_key);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    const currentCursor = cursor ?? 0;

    // Check if there are already events
    const events = Q.getEventsSince(db, currentCursor);
    if (events.length > 0) {
      const latestCursor = events[events.length - 1]!.cursor;
      return { cursor: latestCursor, events };
    }

    // Long-poll: wait for new events
    const timeoutDuration = Math.min(Math.max(timeout_ms, 1000), 60000);

    return new Promise<{ cursor: number; events: EventRows }>((resolve) => {
      const timer = setTimeout(() => {
        // Timeout — return empty
        const idx = waiters.findIndex((w) => w.timer === timer);
        if (idx >= 0) waiters.splice(idx, 1);
        resolve({ cursor: Q.getLatestCursor(db), events: [] });
      }, timeoutDuration);

      waiters.push({
        cursor: currentCursor,
        resolve: (events: EventRows) => {
          const latestCursor = events.length > 0 ? events[events.length - 1]!.cursor : Q.getLatestCursor(db);
          resolve({ cursor: latestCursor, events });
        },
        timer,
      });
    });
  });
}
