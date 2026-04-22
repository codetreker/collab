import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-secret-for-vitest';

export function makeToken(userId: string, email = 'test@test.com'): string {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '1h' });
}

export function authCookie(userId: string, email?: string): string {
  return `collab_token=${makeToken(userId, email)}`;
}

export function seedMessage(db: Database.Database, channelId: string, senderId: string, content = 'hello', createdAt?: number): string {
  const id = uuidv4();
  db.prepare('INSERT INTO messages (id, channel_id, sender_id, content, content_type, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, channelId, senderId, content, 'text', createdAt ?? Date.now());
  return id;
}

export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS channels (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      topic       TEXT DEFAULT '',
      type        TEXT DEFAULT 'channel',
      visibility  TEXT DEFAULT 'public' CHECK(visibility IN ('public','private')),
      created_at  INTEGER NOT NULL,
      created_by  TEXT NOT NULL,
      deleted_at  INTEGER
    );

    CREATE TABLE IF NOT EXISTS users (
      id           TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      role         TEXT DEFAULT 'member',
      avatar_url   TEXT,
      api_key      TEXT UNIQUE,
      email        TEXT,
      password_hash TEXT,
      last_seen_at INTEGER,
      require_mention INTEGER DEFAULT 1,
      owner_id     TEXT REFERENCES users(id),
      deleted_at   INTEGER,
      disabled     INTEGER DEFAULT 0,
      created_at   INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

    CREATE TABLE IF NOT EXISTS messages (
      id            TEXT PRIMARY KEY,
      channel_id    TEXT NOT NULL REFERENCES channels(id),
      sender_id     TEXT NOT NULL REFERENCES users(id),
      content       TEXT NOT NULL,
      content_type  TEXT DEFAULT 'text',
      reply_to_id   TEXT REFERENCES messages(id),
      created_at    INTEGER NOT NULL,
      edited_at     INTEGER,
      deleted_at    INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_messages_channel_time ON messages(channel_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

    CREATE TABLE IF NOT EXISTS channel_members (
      channel_id    TEXT NOT NULL REFERENCES channels(id),
      user_id       TEXT NOT NULL REFERENCES users(id),
      joined_at     INTEGER NOT NULL,
      last_read_at  INTEGER,
      PRIMARY KEY (channel_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS mentions (
      id          TEXT PRIMARY KEY,
      message_id  TEXT NOT NULL REFERENCES messages(id),
      user_id     TEXT NOT NULL REFERENCES users(id),
      channel_id  TEXT NOT NULL REFERENCES channels(id)
    );

    CREATE INDEX IF NOT EXISTS idx_mentions_user ON mentions(user_id, channel_id);

    CREATE TABLE IF NOT EXISTS events (
      cursor      INTEGER PRIMARY KEY AUTOINCREMENT,
      kind        TEXT NOT NULL,
      channel_id  TEXT NOT NULL,
      payload     TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_permissions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission  TEXT NOT NULL,
      scope       TEXT NOT NULL DEFAULT '*',
      granted_by  TEXT REFERENCES users(id),
      granted_at  INTEGER NOT NULL,
      UNIQUE(user_id, permission, scope)
    );

    CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_permissions_lookup ON user_permissions(user_id, permission, scope);

    CREATE TABLE IF NOT EXISTS invite_codes (
      code        TEXT PRIMARY KEY,
      created_by  TEXT NOT NULL REFERENCES users(id),
      created_at  INTEGER NOT NULL,
      expires_at  INTEGER,
      used_by     TEXT REFERENCES users(id),
      used_at     INTEGER,
      note        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_invite_codes_used ON invite_codes(used_by);

    CREATE TABLE IF NOT EXISTS message_reactions (
      id          TEXT PRIMARY KEY,
      message_id  TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id     TEXT NOT NULL REFERENCES users(id),
      emoji       TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_reactions_unique
      ON message_reactions(message_id, user_id, emoji);
    CREATE INDEX IF NOT EXISTS idx_reactions_message
      ON message_reactions(message_id);

    CREATE TABLE IF NOT EXISTS workspace_files (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      channel_id TEXT NOT NULL REFERENCES channels(id),
      parent_id TEXT REFERENCES workspace_files(id),
      name TEXT NOT NULL,
      is_directory INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT,
      size_bytes INTEGER DEFAULT 0,
      source TEXT DEFAULT 'upload',
      source_message_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, channel_id, parent_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_workspace_files_user_channel
      ON workspace_files(user_id, channel_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_files_parent
      ON workspace_files(parent_id);
  `);

  return db;
}

export function seedAdmin(db: Database.Database, name = 'Admin'): string {
  const id = uuidv4();
  const now = Date.now();
  db.prepare('INSERT INTO users (id, display_name, role, created_at) VALUES (?, ?, ?, ?)').run(id, name, 'admin', now);
  return id;
}

export function seedMember(db: Database.Database, name = 'Member'): string {
  const id = uuidv4();
  const now = Date.now();
  db.prepare('INSERT INTO users (id, display_name, role, email, created_at) VALUES (?, ?, ?, ?, ?)').run(id, name, 'member', `${name.toLowerCase()}@test.com`, now);
  return id;
}

export function seedAgent(db: Database.Database, ownerId: string, name = 'Bot'): string {
  const id = uuidv4();
  const now = Date.now();
  db.prepare('INSERT INTO users (id, display_name, role, owner_id, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, name, 'agent', ownerId, `col_${id}`, now);
  return id;
}

export function seedChannel(db: Database.Database, createdBy: string, name = 'test-channel', visibility = 'public'): string {
  const id = uuidv4();
  const now = Date.now();
  db.prepare('INSERT INTO channels (id, name, topic, visibility, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)').run(id, name, '', visibility, now, createdBy);
  return id;
}

export function seedInviteCode(db: Database.Database, createdBy: string, code = 'TESTINVITE'): string {
  db.prepare('INSERT INTO invite_codes (code, created_by, created_at) VALUES (?, ?, ?)').run(code, createdBy, Date.now());
  return code;
}

export function grantPermission(db: Database.Database, userId: string, permission: string, scope = '*'): void {
  db.prepare('INSERT OR IGNORE INTO user_permissions (user_id, permission, scope, granted_by, granted_at) VALUES (?, ?, ?, NULL, ?)').run(userId, permission, scope, Date.now());
}

export function addChannelMember(db: Database.Database, channelId: string, userId: string): void {
  db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id, joined_at) VALUES (?, ?, ?)').run(channelId, userId, Date.now());
}
