import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import type { Channel, User, Message, EventRow, Mention, EventKind, InviteCode } from './types.js';

// ─── Channels ───────────────────────────────────────────

export function listChannels(db: Database.Database): (Channel & { member_count: number; last_message_at: number | null })[] {
  return db
    .prepare(
      `SELECT c.*,
              COUNT(cm.user_id) AS member_count,
              (SELECT MAX(m.created_at) FROM messages m WHERE m.channel_id = c.id) AS last_message_at
       FROM channels c
       LEFT JOIN channel_members cm ON cm.channel_id = c.id
       WHERE (c.type = 'channel' OR c.type IS NULL)
         AND (c.visibility = 'public' OR c.visibility IS NULL)
         AND c.deleted_at IS NULL
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
       INNER JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
       LEFT JOIN channel_members cm2 ON cm2.channel_id = c.id
       WHERE (c.type = 'channel' OR c.type IS NULL)
         AND c.deleted_at IS NULL
       GROUP BY c.id
       ORDER BY
         CASE WHEN (SELECT MAX(m3.created_at) FROM messages m3 WHERE m3.channel_id = c.id) IS NULL THEN 1 ELSE 0 END,
         (SELECT MAX(m4.created_at) FROM messages m4 WHERE m4.channel_id = c.id) DESC,
         c.created_at DESC`,
    )
    .all(userId) as (Channel & { member_count: number; last_message_at: number | null; unread_count: number })[];
}

export function listAllChannelsForAdmin(
  db: Database.Database,
  userId: string,
): (Channel & { member_count: number; last_message_at: number | null; unread_count: number; is_member: number })[] {
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
              ) AS unread_count,
              CASE WHEN cm.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_member
       FROM channels c
       LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
       LEFT JOIN channel_members cm2 ON cm2.channel_id = c.id
       WHERE (c.type = 'channel' OR c.type IS NULL)
         AND c.deleted_at IS NULL
       GROUP BY c.id
       ORDER BY
         CASE WHEN (SELECT MAX(m3.created_at) FROM messages m3 WHERE m3.channel_id = c.id) IS NULL THEN 1 ELSE 0 END,
         (SELECT MAX(m4.created_at) FROM messages m4 WHERE m4.channel_id = c.id) DESC,
         c.created_at DESC`,
    )
    .all(userId) as (Channel & { member_count: number; last_message_at: number | null; unread_count: number; is_member: number })[];
}

export function getChannelWithCounts(
  db: Database.Database,
  channelId: string,
  userId?: string,
): (Channel & { member_count: number; unread_count: number; last_message_at: number | null; is_member: number }) | undefined {
  const row = db.prepare(
    `SELECT c.*,
            COUNT(DISTINCT cm2.user_id) AS member_count,
            (SELECT MAX(m.created_at) FROM messages m WHERE m.channel_id = c.id) AS last_message_at,
            COALESCE(
              (SELECT COUNT(*) FROM messages m2
               WHERE m2.channel_id = c.id
                 AND m2.created_at > COALESCE(cm.last_read_at, 0)),
              0
            ) AS unread_count,
            CASE WHEN cm.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_member
     FROM channels c
     LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
     LEFT JOIN channel_members cm2 ON cm2.channel_id = c.id
     WHERE c.id = ? AND c.deleted_at IS NULL
     GROUP BY c.id`,
  ).get(userId ?? '', channelId) as (Channel & { member_count: number; unread_count: number; last_message_at: number | null; is_member: number }) | undefined;
  return row;
}

export function getChannel(db: Database.Database, id: string): Channel | undefined {
  return db.prepare('SELECT * FROM channels WHERE id = ? AND deleted_at IS NULL').get(id) as Channel | undefined;
}

export function getChannelIncludingDeleted(db: Database.Database, id: string): Channel | undefined {
  return db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as Channel | undefined;
}

export function getChannelByName(db: Database.Database, name: string): Channel | undefined {
  return db.prepare('SELECT * FROM channels WHERE name = ? AND deleted_at IS NULL').get(name) as Channel | undefined;
}

export function getChannelDetail(
  db: Database.Database,
  id: string,
): (Channel & { member_count: number; members: { user_id: string; display_name: string; role: string; joined_at: number }[] }) | undefined {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ? AND deleted_at IS NULL').get(id) as Channel | undefined;
  if (!channel) return undefined;

  const members = db
    .prepare(
      `SELECT cm.user_id, u.display_name, u.role, cm.joined_at
       FROM channel_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.channel_id = ? AND u.deleted_at IS NULL AND u.disabled = 0
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
  visibility: 'public' | 'private' = 'public',
): Channel {
  const id = uuidv4();
  const now = Date.now();
  db.prepare(
    'INSERT INTO channels (id, name, topic, visibility, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, name, topic, visibility, now, createdBy);

  const channel: Channel = { id, name, topic, visibility, created_at: now, created_by: createdBy };

  insertEvent(db, 'channel_created', id, { channel });

  return channel;
}

export function updateChannel(
  db: Database.Database,
  id: string,
  updates: { name?: string; topic?: string; visibility?: 'public' | 'private' },
): Channel | undefined {
  const channel = getChannel(db, id);
  if (!channel) return undefined;

  const name = updates.name ?? channel.name;
  const topic = updates.topic ?? channel.topic;
  const visibility = updates.visibility ?? channel.visibility ?? 'public';

  db.prepare('UPDATE channels SET name = ?, topic = ?, visibility = ? WHERE id = ?').run(name, topic, visibility, id);
  return { ...channel, name, topic, visibility };
}

export function softDeleteChannel(db: Database.Database, id: string): boolean {
  const now = Date.now();
  const res = db
    .prepare('UPDATE channels SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL')
    .run(now, id);
  return res.changes > 0;
}

// ─── Users ──────────────────────────────────────────────

export function listUsers(db: Database.Database): User[] {
  return db
    .prepare('SELECT id, display_name, role, avatar_url, require_mention, created_at FROM users WHERE deleted_at IS NULL AND disabled = 0 ORDER BY created_at ASC')
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
  ownerId: string | null = null,
): User {
  const now = Date.now();
  db.prepare(
    'INSERT OR IGNORE INTO users (id, display_name, role, api_key, email, password_hash, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, displayName, role, apiKey, email, passwordHash, ownerId, now);
  return { id, display_name: displayName, role: role as User['role'], avatar_url: null, api_key: apiKey, email, password_hash: passwordHash, last_seen_at: null, require_mention: true, created_at: now, owner_id: ownerId, deleted_at: null, disabled: 0 };
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

  // Parse <@user_id> tokens from content
  const parsedIds: string[] = [];
  for (const m of content.matchAll(/<@([^>]+)>/g)) {
    const uid = m[1]!;
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(uid) as { id: string } | undefined;
    if (user && !mentionUserIds.includes(user.id)) {
      parsedIds.push(user.id);
    }
  }
  // Fallback: parse @displayName for backward compat with old clients
  for (const m of content.matchAll(/@([\p{L}\p{N}_]+)/gu)) {
    const name = m[1]!;
    const user = getUserByDisplayName(db, name);
    if (user && !mentionUserIds.includes(user.id) && !parsedIds.includes(user.id)) {
      parsedIds.push(user.id);
    }
  }
  const allMentionIds = [...new Set([...mentionUserIds, ...parsedIds])];

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

  const channelRow = db
    .prepare('SELECT type FROM channels WHERE id = ?')
    .get(channelId) as { type: string | null } | undefined;

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

    insertEventStmt.run('message', channelId, JSON.stringify({ ...message, channel_type: channelRow?.type ?? 'channel' }), now);

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

export function getEventsSinceWithChanges(
  db: Database.Database,
  cursor: number,
  limit: number,
  channelIds: string[],
  changeKinds: string[],
): EventRow[] {
  if (channelIds.length === 0 && changeKinds.length === 0) return [];

  const parts: string[] = [];
  const args: unknown[] = [cursor];

  if (channelIds.length > 0) {
    const ph = channelIds.map(() => '?').join(',');
    parts.push(`channel_id IN (${ph})`);
    args.push(...channelIds);
  }
  if (changeKinds.length > 0) {
    const ph = changeKinds.map(() => '?').join(',');
    parts.push(`kind IN (${ph})`);
    args.push(...changeKinds);
  }

  args.push(limit);
  const where = parts.join(' OR ');
  return db
    .prepare(`SELECT * FROM events WHERE cursor > ? AND (${where}) ORDER BY cursor ASC LIMIT ?`)
    .all(...args) as EventRow[];
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

export function addUserToPublicChannels(
  db: Database.Database,
  userId: string,
): void {
  const now = Date.now();
  const publicChannels = db.prepare(
    "SELECT id FROM channels WHERE (type = 'channel' OR type IS NULL) AND (visibility = 'public' OR visibility IS NULL) AND deleted_at IS NULL",
  ).all() as { id: string }[];

  const stmt = db.prepare(
    'INSERT OR IGNORE INTO channel_members (channel_id, user_id, joined_at, last_read_at) VALUES (?, ?, ?, ?)',
  );
  for (const ch of publicChannels) {
    stmt.run(ch.id, userId, now, now);
  }
}

export function addAllUsersToChannel(
  db: Database.Database,
  channelId: string,
): void {
  const now = Date.now();
  const users = db.prepare('SELECT id FROM users WHERE deleted_at IS NULL AND disabled = 0').all() as { id: string }[];
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO channel_members (channel_id, user_id, joined_at, last_read_at) VALUES (?, ?, ?, ?)',
  );
  for (const u of users) {
    stmt.run(channelId, u.id, now, now);
  }
}

export function canAccessChannel(
  db: Database.Database,
  channelId: string,
  userId: string,
): boolean {
  const row = db.prepare(
    `SELECT
       c.visibility,
       EXISTS(SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?) AS is_member,
       (SELECT role FROM users WHERE id = ?) AS user_role
     FROM channels c
     WHERE c.id = ? AND c.deleted_at IS NULL`,
  ).get(channelId, userId, userId, channelId) as { visibility: string | null; is_member: number; user_role: string | null } | undefined;

  if (!row) return false;
  if (row.visibility !== 'private') return true;
  if (row.is_member) return true;
  return row.user_role === 'admin';
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
       WHERE cm.channel_id = ? AND u.deleted_at IS NULL AND u.disabled = 0
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

export function getUserChannelIds(db: Database.Database, userId: string): string[] {
  const rows = db
    .prepare(
      `SELECT cm.channel_id FROM channel_members cm
       JOIN channels c ON c.id = cm.channel_id
       WHERE cm.user_id = ? AND c.deleted_at IS NULL`,
    )
    .all(userId) as { channel_id: string }[];
  return rows.map((r) => r.channel_id);
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

export function getRecentlySeenUserIds(db: Database.Database, withinMs = 120000): string[] {
  const cutoff = Date.now() - withinMs;
  const rows = db.prepare("SELECT id FROM users WHERE last_seen_at IS NOT NULL AND last_seen_at > ? AND deleted_at IS NULL AND disabled = 0").all(cutoff) as { id: string }[];
  return rows.map((r) => r.id);
}

// ─── Invite Codes ──────────────────────────────────────

export function createInviteCode(
  db: Database.Database,
  createdBy: string,
  expiresAt: number | null = null,
  note: string | null = null,
): InviteCode {
  const code = crypto.randomBytes(8).toString('hex');
  const now = Date.now();
  db.prepare(
    'INSERT INTO invite_codes (code, created_by, created_at, expires_at, note) VALUES (?, ?, ?, ?, ?)',
  ).run(code, createdBy, now, expiresAt, note);
  return { code, created_by: createdBy, created_at: now, expires_at: expiresAt, used_by: null, used_at: null, note };
}

export function listInviteCodes(db: Database.Database): InviteCode[] {
  return db.prepare('SELECT * FROM invite_codes ORDER BY created_at DESC').all() as InviteCode[];
}

export function getInviteCode(db: Database.Database, code: string): InviteCode | undefined {
  return db.prepare('SELECT * FROM invite_codes WHERE code = ?').get(code) as InviteCode | undefined;
}

export function deleteInviteCode(db: Database.Database, code: string): boolean {
  return db.prepare('DELETE FROM invite_codes WHERE code = ?').run(code).changes > 0;
}

export function consumeInviteCode(db: Database.Database, code: string, userId: string): boolean {
  const now = Date.now();
  return db.prepare(
    'UPDATE invite_codes SET used_by = ?, used_at = ? WHERE code = ? AND used_by IS NULL',
  ).run(userId, now, code).changes > 0;
}

// ─── Permissions ───────────────────────────────────────

const DEFAULT_MEMBER_PERMISSIONS = ['channel.create', 'message.send', 'agent.manage'];
const DEFAULT_AGENT_PERMISSIONS = ['message.send'];

export function grantDefaultPermissions(
  db: Database.Database,
  userId: string,
  role: 'member' | 'agent',
  grantedBy: string | null = null,
): void {
  const perms = role === 'member' ? DEFAULT_MEMBER_PERMISSIONS : DEFAULT_AGENT_PERMISSIONS;
  const now = Date.now();
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO user_permissions (user_id, permission, scope, granted_by, granted_at) VALUES (?, ?, \'*\', ?, ?)',
  );
  for (const p of perms) {
    stmt.run(userId, p, grantedBy, now);
  }
}

export function grantCreatorPermissions(
  db: Database.Database,
  creatorId: string,
  creatorRole: 'admin' | 'member' | 'agent',
  channelId: string,
  ownerIdIfAgent?: string,
): void {
  const recipientId = creatorRole === 'agent' && ownerIdIfAgent ? ownerIdIfAgent : creatorId;

  const scope = `channel:${channelId}`;
  const now = Date.now();
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO user_permissions (user_id, permission, scope, granted_by, granted_at) VALUES (?, ?, ?, ?, ?)',
  );
  stmt.run(recipientId, 'channel.delete', scope, null, now);
  stmt.run(recipientId, 'channel.manage_members', scope, null, now);
  stmt.run(recipientId, 'channel.manage_visibility', scope, null, now);
}

// ─── DM Channels ───────────────────────────────────────

function dmChannelName(userId1: string, userId2: string): string {
  const sorted = [userId1, userId2].sort();
  return `dm:${sorted[0]}_${sorted[1]}`;
}

export function createDmChannel(
  db: Database.Database,
  userId1: string,
  userId2: string,
): Channel {
  const name = dmChannelName(userId1, userId2);

  const txn = db.transaction(() => {
    const existing = db.prepare("SELECT * FROM channels WHERE name = ?").get(name) as Channel | undefined;
    if (existing) return existing;

    const id = uuidv4();
    const now = Date.now();
    db.prepare(
      "INSERT OR IGNORE INTO channels (id, name, topic, type, created_at, created_by) VALUES (?, ?, '', 'dm', ?, ?)",
    ).run(id, name, now, userId1);

    // Re-fetch in case INSERT OR IGNORE hit the UNIQUE constraint
    const channel = db.prepare("SELECT * FROM channels WHERE name = ?").get(name) as Channel;

    const memberStmt = db.prepare(
      'INSERT OR IGNORE INTO channel_members (channel_id, user_id, joined_at, last_read_at) VALUES (?, ?, ?, ?)',
    );
    memberStmt.run(channel.id, userId1, now, now);
    memberStmt.run(channel.id, userId2, now, now);

    return channel;
  });

  return txn();
}

export function getDmChannel(
  db: Database.Database,
  userId1: string,
  userId2: string,
): Channel | undefined {
  const name = dmChannelName(userId1, userId2);
  return db.prepare("SELECT * FROM channels WHERE name = ?").get(name) as Channel | undefined;
}

export interface DmChannelInfo {
  id: string;
  name: string;
  type: 'dm';
  created_at: number;
  peer: { id: string; display_name: string; avatar_url: string | null; role: string };
  unread_count: number;
  last_message: { content: string; created_at: number } | null;
}

export function listDmChannelsForUser(
  db: Database.Database,
  userId: string,
): DmChannelInfo[] {
  const rows = db.prepare(
    `SELECT c.id, c.name, c.type, c.created_at,
            u.id AS peer_id, u.display_name AS peer_display_name, u.avatar_url AS peer_avatar_url, u.role AS peer_role,
            COALESCE(
              (SELECT COUNT(*) FROM messages m2
               WHERE m2.channel_id = c.id
                 AND m2.created_at > COALESCE(cm.last_read_at, 0)),
              0
            ) AS unread_count
     FROM channels c
     JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
     JOIN channel_members cm2 ON cm2.channel_id = c.id AND cm2.user_id != ?
     JOIN users u ON u.id = cm2.user_id
     WHERE c.type = 'dm' AND c.deleted_at IS NULL
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
  ).all(userId, userId) as {
    id: string; name: string; type: 'dm'; created_at: number;
    peer_id: string; peer_display_name: string; peer_avatar_url: string | null; peer_role: string;
    unread_count: number;
  }[];

  return rows.map((r) => {
    const lastMsg = db.prepare(
      `SELECT content, created_at FROM messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT 1`,
    ).get(r.id) as { content: string; created_at: number } | undefined;

    return {
      id: r.id,
      name: r.name,
      type: 'dm' as const,
      created_at: r.created_at,
      peer: { id: r.peer_id, display_name: r.peer_display_name, avatar_url: r.peer_avatar_url, role: r.peer_role },
      unread_count: r.unread_count,
      last_message: lastMsg ?? null,
    };
  });
}

// ─── Reactions ─────────────────────────────────────────

export function addReaction(
  db: Database.Database, messageId: string, userId: string, emoji: string,
): void {
  db.prepare(
    'INSERT OR IGNORE INTO message_reactions (id, message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(uuidv4(), messageId, userId, emoji, Date.now());
}

export function removeReaction(
  db: Database.Database, messageId: string, userId: string, emoji: string,
): boolean {
  return db.prepare(
    'DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
  ).run(messageId, userId, emoji).changes > 0;
}

export function getReactionsByMessageId(
  db: Database.Database, messageId: string,
): { emoji: string; count: number; user_ids: string[] }[] {
  const rows = db.prepare(
    `SELECT emoji, GROUP_CONCAT(user_id) AS user_ids, COUNT(*) AS count
     FROM message_reactions
     WHERE message_id = ?
     GROUP BY emoji
     ORDER BY MIN(created_at) ASC`,
  ).all(messageId) as { emoji: string; user_ids: string; count: number }[];
  return rows.map(r => ({ emoji: r.emoji, count: r.count, user_ids: r.user_ids.split(',') }));
}

export function getReactionsForMessages(
  db: Database.Database, messageIds: string[],
): Map<string, { emoji: string; count: number; user_ids: string[] }[]> {
  const result = new Map<string, { emoji: string; count: number; user_ids: string[] }[]>();
  if (messageIds.length === 0) return result;

  const placeholders = messageIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT message_id, emoji, GROUP_CONCAT(user_id) AS user_ids, COUNT(*) AS count
     FROM message_reactions
     WHERE message_id IN (${placeholders})
     GROUP BY message_id, emoji
     ORDER BY MIN(created_at) ASC`,
  ).all(...messageIds) as { message_id: string; emoji: string; user_ids: string; count: number }[];

  for (const r of rows) {
    const arr = result.get(r.message_id) ?? [];
    arr.push({ emoji: r.emoji, count: r.count, user_ids: r.user_ids.split(',') });
    result.set(r.message_id, arr);
  }
  return result;
}

export function getReactionCountForMessage(
  db: Database.Database, messageId: string,
): number {
  const row = db.prepare(
    'SELECT COUNT(DISTINCT emoji) AS cnt FROM message_reactions WHERE message_id = ?',
  ).get(messageId) as { cnt: number };
  return row.cnt;
}
