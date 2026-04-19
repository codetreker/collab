import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'collab.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  initSchema(db);
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS channels (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      topic       TEXT DEFAULT '',
      created_at  INTEGER NOT NULL,
      created_by  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id           TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      role         TEXT DEFAULT 'member',
      avatar_url   TEXT,
      api_key      TEXT UNIQUE,
      created_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id            TEXT PRIMARY KEY,
      channel_id    TEXT NOT NULL REFERENCES channels(id),
      sender_id     TEXT NOT NULL REFERENCES users(id),
      content       TEXT NOT NULL,
      content_type  TEXT DEFAULT 'text',
      reply_to_id   TEXT REFERENCES messages(id),
      created_at    INTEGER NOT NULL,
      edited_at     INTEGER
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
  `);

  // Migration: add last_read_at if missing
  const cols = db.prepare("PRAGMA table_info(channel_members)").all() as { name: string }[];
  if (!cols.some((c) => c.name === 'last_read_at')) {
    db.exec('ALTER TABLE channel_members ADD COLUMN last_read_at INTEGER');
  }

  // Migration: add email and password_hash to users if missing
  const userCols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!userCols.some((c) => c.name === 'email')) {
    db.exec('ALTER TABLE users ADD COLUMN email TEXT');
  }
  if (!userCols.some((c) => c.name === 'password_hash')) {
    db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
  }
  if (!userCols.some((c) => c.name === 'last_seen_at')) {
    db.exec('ALTER TABLE users ADD COLUMN last_seen_at INTEGER');
  }
  if (!userCols.some((c) => c.name === 'require_mention')) {
    db.exec('ALTER TABLE users ADD COLUMN require_mention INTEGER DEFAULT 1');
  }

  // Migration: add type column to channels
  const channelCols = db.prepare("PRAGMA table_info(channels)").all() as { name: string }[];
  if (!channelCols.some((c) => c.name === 'type')) {
    db.exec("ALTER TABLE channels ADD COLUMN type TEXT DEFAULT 'channel'");
  }

  // Migration: clean up duplicate DM channels (keep the oldest per name)
  const dupes = db.prepare(
    `SELECT name, MIN(created_at) AS keep_created_at
     FROM channels WHERE type = 'dm'
     GROUP BY name HAVING COUNT(*) > 1`,
  ).all() as { name: string; keep_created_at: number }[];
  for (const { name, keep_created_at } of dupes) {
    const keep = db.prepare(
      "SELECT id FROM channels WHERE name = ? AND created_at = ? LIMIT 1",
    ).get(name, keep_created_at) as { id: string };
    const extras = db.prepare(
      "SELECT id FROM channels WHERE name = ? AND id != ?",
    ).all(name, keep.id) as { id: string }[];
    for (const { id } of extras) {
      db.prepare("DELETE FROM mentions WHERE channel_id = ?").run(id);
      db.prepare("DELETE FROM messages WHERE channel_id = ?").run(id);
      db.prepare("DELETE FROM channel_members WHERE channel_id = ?").run(id);
      db.prepare("DELETE FROM events WHERE channel_id = ?").run(id);
      db.prepare("DELETE FROM channels WHERE id = ?").run(id);
    }
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
