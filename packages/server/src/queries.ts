import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { Channel, User, Message, EventRow, Mention } from './types.js';

// ─── Channels ───────────────────────────────────────────

export function listChannels(db: Database.Database): (Channel & { member_count: number })[] {
  return db
    .prepare(
      `SELECT c.*, COUNT(cm.user_id) AS member_count
       FROM channels c
       LEFT JOIN channel_members cm ON cm.channel_id = c.id
       GROUP BY c.id
       ORDER BY c.created_at ASC`,
    )
    .all() as (Channel & { member_count: number })[];
}

export function getChannel(db: Database.Database, id: string): Channel | undefined {
  return db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as Channel | undefined;
}

export function getChannelByName(db: Database.Database, name: string): Channel | undefined {
  return db.prepare('SELECT * FROM channels WHERE name = ?').get(name) as Channel | undefined;
}

export function createChannel(
  db: Database.Database,
  name: string,
  topic: string,
  createdBy: string,
): Channel {
  const id = uuidv4();
  const now = Date.now();
  db.prepare(
    'INSERT INTO channels (id, name, topic, created_at, created_by) VALUES (?, ?, ?, ?, ?)',
  ).run(id, name, topic, now, createdBy);
  return { id, name, topic, created_at: now, created_by: createdBy };
}

// ─── Users ──────────────────────────────────────────────

export function listUsers(db: Database.Database): User[] {
  return db
    .prepare('SELECT id, display_name, role, avatar_url, created_at FROM users ORDER BY created_at ASC')
    .all() as User[];
}

export function getUserById(db: Database.Database, id: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
}

export function getUserByApiKey(db: Database.Database, apiKey: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE api_key = ?').get(apiKey) as User | undefined;
}

export function createUser(
  db: Database.Database,
  id: string,
  displayName: string,
  role: string,
  apiKey: string | null = null,
): User {
  const now = Date.now();
  db.prepare(
    'INSERT OR IGNORE INTO users (id, display_name, role, api_key, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, displayName, role, apiKey, now);
  return { id, display_name: displayName, role: role as User['role'], avatar_url: null, api_key: apiKey, created_at: now };
}

// ─── Messages ───────────────────────────────────────────

export function getMessages(
  db: Database.Database,
  channelId: string,
  before?: number,
  limit = 50,
): { messages: Message[]; has_more: boolean } {
  const actualLimit = limit + 1; // fetch one extra to check has_more

  let rows: Message[];
  if (before) {
    rows = db
      .prepare(
        `SELECT m.*, u.display_name AS sender_name
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.channel_id = ? AND m.created_at < ?
         ORDER BY m.created_at DESC
         LIMIT ?`,
      )
      .all(channelId, before, actualLimit) as Message[];
  } else {
    rows = db
      .prepare(
        `SELECT m.*, u.display_name AS sender_name
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.channel_id = ?
         ORDER BY m.created_at DESC
         LIMIT ?`,
      )
      .all(channelId, actualLimit) as Message[];
  }

  const hasMore = rows.length > limit;
  const messages = hasMore ? rows.slice(0, limit) : rows;

  // Attach mentions
  for (const msg of messages) {
    const mentionRows = db
      .prepare('SELECT user_id FROM mentions WHERE message_id = ?')
      .all(msg.id) as { user_id: string }[];
    msg.mentions = mentionRows.map((r) => r.user_id);
  }

  return { messages: messages.reverse(), has_more: hasMore };
}

export function createMessage(
  db: Database.Database,
  channelId: string,
  senderId: string,
  content: string,
  contentType: 'text' | 'image' = 'text',
  replyToId: string | null = null,
  mentionUserIds: string[] = [],
): Message {
  const id = uuidv4();
  const now = Date.now();

  const insertMsg = db.prepare(
    `INSERT INTO messages (id, channel_id, sender_id, content, content_type, reply_to_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const insertMention = db.prepare(
    'INSERT INTO mentions (id, message_id, user_id, channel_id) VALUES (?, ?, ?, ?)',
  );

  const insertEvent = db.prepare(
    'INSERT INTO events (kind, channel_id, payload, created_at) VALUES (?, ?, ?, ?)',
  );

  const senderRow = db
    .prepare('SELECT display_name FROM users WHERE id = ?')
    .get(senderId) as { display_name: string } | undefined;

  const message: Message = {
    id,
    channel_id: channelId,
    sender_id: senderId,
    sender_name: senderRow?.display_name ?? 'Unknown',
    content,
    content_type: contentType,
    reply_to_id: replyToId,
    created_at: now,
    edited_at: null,
    mentions: mentionUserIds,
  };

  const txn = db.transaction(() => {
    insertMsg.run(id, channelId, senderId, content, contentType, replyToId, now);

    for (const userId of mentionUserIds) {
      insertMention.run(uuidv4(), id, userId, channelId);
    }

    insertEvent.run('message', channelId, JSON.stringify(message), now);
  });

  txn();

  // Notify long-poll waiters
  import('./routes/poll.js').then((m) => m.signalNewEvents()).catch(() => {});

  return message;
}

// ─── Events (for plugin long-polling) ───────────────────

export function getEventsSince(
  db: Database.Database,
  cursor: number,
  limit = 100,
): EventRow[] {
  return db
    .prepare('SELECT * FROM events WHERE cursor > ? ORDER BY cursor ASC LIMIT ?')
    .all(cursor, limit) as EventRow[];
}

export function getLatestCursor(db: Database.Database): number {
  const row = db.prepare('SELECT MAX(cursor) AS max_cursor FROM events').get() as {
    max_cursor: number | null;
  };
  return row.max_cursor ?? 0;
}

// ─── Channel Members ────────────────────────────────────

export function addChannelMember(
  db: Database.Database,
  channelId: string,
  userId: string,
): void {
  db.prepare(
    'INSERT OR IGNORE INTO channel_members (channel_id, user_id, joined_at) VALUES (?, ?, ?)',
  ).run(channelId, userId, Date.now());
}
