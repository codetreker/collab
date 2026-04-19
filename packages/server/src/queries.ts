import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { Channel, User, Message, EventRow, Mention, EventKind } from './types.js';

// ─── Channels ───────────────────────────────────────────

export function listChannels(db: Database.Database): (Channel & { member_count: number; last_message_at: number | null })[] {
  return db
    .prepare(
      `SELECT c.*,
              COUNT(cm.user_id) AS member_count,
              (SELECT MAX(m.created_at) FROM messages m WHERE m.channel_id = c.id) AS last_message_at
       FROM channels c
       LEFT JOIN channel_members cm ON cm.channel_id = c.id
       GROUP BY c.id
       ORDER BY
         CASE WHEN (SELECT MAX(m2.created_at) FROM messages m2 WHERE m2.channel_id = c.id) IS NULL THEN 1 ELSE 0 END,
         (SELECT MAX(m3.created_at) FROM messages m3 WHERE m3.channel_id = c.id) DESC,
         c.created_at DESC`,
    )
    .all() as (Channel & { member_count: number; last_message_at: number | null })[];
}

export function listChannelsWithUnread(
  db: Database.Database,
  userId: string,
): (Channel & { member_count: number; last_message_at: number | null; unread_count: number })[] {
  return db
    .prepare(
      `SELECT c.*,
              COUNT(DISTINCT cm2.user_id) AS member_count,
              (SELECT MAX(m.created_at) FROM messages m WHERE m.channel_id = c.id) AS last_message_at,
              COALESCE(
                (SELECT COUNT(*) FROM messages m2
                 WHERE m2.channel_id = c.id
                   AND m2.created_at > COALESCE(cm.last_read_at, 0)),
                0
              ) AS unread_count
       FROM channels c
       LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
       LEFT JOIN channel_members cm2 ON cm2.channel_id = c.id
       GROUP BY c.id
       ORDER BY
         CASE WHEN (SELECT MAX(m3.created_at) FROM messages m3 WHERE m3.channel_id = c.id) IS NULL THEN 1 ELSE 0 END,
         (SELECT MAX(m4.created_at) FROM messages m4 WHERE m4.channel_id = c.id) DESC,
         c.created_at DESC`,
    )
    .all(userId) as (Channel & { member_count: number; last_message_at: number | null; unread_count: number })[];
}

export function getChannel(db: Database.Database, id: string): Channel | undefined {
  return db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as Channel | undefined;
}

export function getChannelByName(db: Database.Database, name: string): Channel | undefined {
  return db.prepare('SELECT * FROM channels WHERE name = ?').get(name) as Channel | undefined;
}

export function getChannelDetail(
  db: Database.Database,
  id: string,
): (Channel & { member_count: number; members: { user_id: string; display_name: string; role: string; joined_at: number }[] }) | undefined {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as Channel | undefined;
  if (!channel) return undefined;

  const members = db
    .prepare(
      `SELECT cm.user_id, u.display_name, u.role, cm.joined_at
       FROM channel_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.channel_id = ?
       ORDER BY cm.joined_at ASC`,
    )
    .all(id) as { user_id: string; display_name: string; role: string; joined_at: number }[];

  return { ...channel, member_count: members.length, members };
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

  const channel: Channel = { id, name, topic, created_at: now, created_by: createdBy };

  insertEvent(db, 'channel_created', id, { channel });

  return channel;
}

export function updateChannel(
  db: Database.Database,
  id: string,
  updates: { name?: string; topic?: string },
): Channel | undefined {
  const channel = getChannel(db, id);
  if (!channel) return undefined;

  const name = updates.name ?? channel.name;
  const topic = updates.topic ?? channel.topic;

  db.prepare('UPDATE channels SET name = ?, topic = ? WHERE id = ?').run(name, topic, id);
  return { ...channel, name, topic };
}

// ─── Users ──────────────────────────────────────────────

export function listUsers(db: Database.Database): User[] {
  return db
    .prepare('SELECT id, display_name, role, avatar_url, require_mention, created_at FROM users ORDER BY created_at ASC')
    .all() as User[];
}

export function getUserById(db: Database.Database, id: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
}

export function getUserByApiKey(db: Database.Database, apiKey: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE api_key = ?').get(apiKey) as User | undefined;
}

export function getUserByDisplayName(db: Database.Database, displayName: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE display_name = ?').get(displayName) as User | undefined;
}

export function getUserByEmail(db: Database.Database, email: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;
}

export function createUser(
  db: Database.Database,
  id: string,
  displayName: string,
  role: string,
  apiKey: string | null = null,
  email: string | null = null,
  passwordHash: string | null = null,
): User {
  const now = Date.now();
  db.prepare(
    'INSERT OR IGNORE INTO users (id, display_name, role, api_key, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, displayName, role, apiKey, email, passwordHash, now);
  return { id, display_name: displayName, role: role as User['role'], avatar_url: null, api_key: apiKey, email, password_hash: passwordHash, last_seen_at: null, require_mention: true, created_at: now };
}

// ─── Messages ───────────────────────────────────────────

export function getMessages(
  db: Database.Database,
  channelId: string,
  before?: number,
  limit = 50,
  after?: number,
): { messages: Message[]; has_more: boolean } {
  const actualLimit = limit + 1;

  let rows: Message[];
  if (after) {
    rows = db
      .prepare(
        `SELECT m.*, u.display_name AS sender_name
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.channel_id = ? AND m.created_at > ?
         ORDER BY m.created_at ASC
         LIMIT ?`,
      )
      .all(channelId, after, actualLimit) as Message[];

    const hasMore = rows.length > limit;
    const messages = hasMore ? rows.slice(0, limit) : rows;
    attachMentions(db, messages);
    return { messages, has_more: hasMore };
  }

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
  attachMentions(db, messages);
  return { messages: messages.reverse(), has_more: hasMore };
}

function attachMentions(db: Database.Database, messages: Message[]): void {
  for (const msg of messages) {
    const mentionRows = db
      .prepare('SELECT user_id FROM mentions WHERE message_id = ?')
      .all(msg.id) as { user_id: string }[];
    msg.mentions = mentionRows.map((r) => r.user_id);
  }
}

export function searchMessages(
  db: Database.Database,
  channelId: string,
  query: string,
  limit = 50,
): Message[] {
  const rows = db
    .prepare(
      `SELECT m.*, u.display_name AS sender_name
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.channel_id = ? AND m.content LIKE ?
       ORDER BY m.created_at DESC
       LIMIT ?`,
    )
    .all(channelId, `%${query}%`, limit) as Message[];

  attachMentions(db, rows);
  return rows;
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

  // Auto-parse @mentions from content
  const parsedMentionNames = [...content.matchAll(/@([\p{L}\p{N}_]+)/gu)].map((m) => m[1]!);
  const parsedMentionIds: string[] = [];
  for (const name of parsedMentionNames) {
    const user = getUserByDisplayName(db, name);
    if (user && !mentionUserIds.includes(user.id)) {
      parsedMentionIds.push(user.id);
    }
  }
  const allMentionIds = [...new Set([...mentionUserIds, ...parsedMentionIds])];

  const insertMsg = db.prepare(
    `INSERT INTO messages (id, channel_id, sender_id, content, content_type, reply_to_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const insertMention = db.prepare(
    'INSERT INTO mentions (id, message_id, user_id, channel_id) VALUES (?, ?, ?, ?)',
  );

  const insertEventStmt = db.prepare(
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
    mentions: allMentionIds,
  };

  const txn = db.transaction(() => {
    insertMsg.run(id, channelId, senderId, content, contentType, replyToId, now);

    for (const userId of allMentionIds) {
      insertMention.run(uuidv4(), id, userId, channelId);
    }

    insertEventStmt.run('message', channelId, JSON.stringify(message), now);

    for (const userId of allMentionIds) {
      insertEventStmt.run('mention', channelId, JSON.stringify({ message, mentioned_user_id: userId }), now);
    }
  });

  txn();

  import('./routes/poll.js').then((m) => m.signalNewEvents()).catch(() => {});

  return message;
}

// ─── Events (for plugin long-polling) ───────────────────

export function insertEvent(
  db: Database.Database,
  kind: EventKind,
  channelId: string,
  payload: unknown,
): void {
  db.prepare(
    'INSERT INTO events (kind, channel_id, payload, created_at) VALUES (?, ?, ?, ?)',
  ).run(kind, channelId, JSON.stringify(payload), Date.now());

  import('./routes/poll.js').then((m) => m.signalNewEvents()).catch(() => {});
}

export function getEventsSince(
  db: Database.Database,
  cursor: number,
  limit = 100,
  channelIds?: string[],
): EventRow[] {
  if (channelIds && channelIds.length > 0) {
    const placeholders = channelIds.map(() => '?').join(',');
    return db
      .prepare(`SELECT * FROM events WHERE cursor > ? AND channel_id IN (${placeholders}) ORDER BY cursor ASC LIMIT ?`)
      .all(cursor, ...channelIds, limit) as EventRow[];
  }
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

export function getMessageById(db: Database.Database, id: string): Message | undefined {
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Message | undefined;
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

/**
 * Auto-join a user to ALL existing channels.
 * Sets last_read_at = now so the user starts with 0 unread.
 * Used when creating new CF Access users.
 */
export function addUserToAllChannels(
  db: Database.Database,
  userId: string,
): number {
  const channels = db.prepare('SELECT id FROM channels').all() as { id: string }[];
  const now = Date.now();
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO channel_members (channel_id, user_id, joined_at, last_read_at) VALUES (?, ?, ?, ?)',
  );
  for (const ch of channels) {
    stmt.run(ch.id, userId, now, now);
  }
  return channels.length;
}

export function removeChannelMember(
  db: Database.Database,
  channelId: string,
  userId: string,
): boolean {
  const result = db.prepare(
    'DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?',
  ).run(channelId, userId);
  return result.changes > 0;
}

export function getChannelMembers(
  db: Database.Database,
  channelId: string,
): { user_id: string; display_name: string; role: string; joined_at: number }[] {
  return db
    .prepare(
      `SELECT cm.user_id, u.display_name, u.role, cm.joined_at
       FROM channel_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.channel_id = ?
       ORDER BY cm.joined_at ASC`,
    )
    .all(channelId) as { user_id: string; display_name: string; role: string; joined_at: number }[];
}

export function isChannelMember(
  db: Database.Database,
  channelId: string,
  userId: string,
): boolean {
  const row = db
    .prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?')
    .get(channelId, userId);
  return row !== undefined;
}

export function markChannelRead(
  db: Database.Database,
  channelId: string,
  userId: string,
): void {
  db.prepare(
    'UPDATE channel_members SET last_read_at = ? WHERE channel_id = ? AND user_id = ?',
  ).run(Date.now(), channelId, userId);
}

export function getUnreadCount(
  db: Database.Database,
  channelId: string,
  userId: string,
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM messages m
       JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = ?
       WHERE m.channel_id = ? AND m.created_at > COALESCE(cm.last_read_at, 0)`,
    )
    .get(userId, channelId) as { cnt: number };
  return row.cnt;
}

export function getRecentlySeenUserIds(db: Database.Database, withinMs = 60000): string[] {
  const cutoff = Date.now() - withinMs;
  const rows = db.prepare("SELECT id FROM users WHERE last_seen_at IS NOT NULL AND last_seen_at > ?").all(cutoff) as { id: string }[];
  return rows.map((r) => r.id);
}
