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
      visibility  TEXT DEFAULT 'public' CHECK(visibility IN ('public','private')),
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
  const migrate = db.transaction(() => {
    const cols = db.prepare("PRAGMA table_info(channel_members)").all() as { name: string }[];
    if (!cols.some((c) => c.name === 'last_read_at')) {
      db.exec('ALTER TABLE channel_members ADD COLUMN last_read_at INTEGER');
    }

    // Migration: add email and password_hash to users if missing
    const userCols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
    if (!userCols.some((c) => c.name === 'email')) {
      db.exec('ALTER TABLE users ADD COLUMN email TEXT');
    }

    // Migration: add UNIQUE index on email
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL');
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

    // Migration: add visibility column to channels
    if (!channelCols.some((c) => c.name === 'visibility')) {
      db.exec("ALTER TABLE channels ADD COLUMN visibility TEXT DEFAULT 'public'");
    }

    // Migration: add deleted_at column to channels (soft delete)
    if (!channelCols.some((c) => c.name === 'deleted_at')) {
      db.exec('ALTER TABLE channels ADD COLUMN deleted_at INTEGER');
    }

    // Migration: P1 — users.owner_id, deleted_at, disabled
    const userColsP1 = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
    if (!userColsP1.some((c) => c.name === 'owner_id')) {
      db.exec('ALTER TABLE users ADD COLUMN owner_id TEXT REFERENCES users(id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_users_owner_id ON users(owner_id)');
    }
    if (!userColsP1.some((c) => c.name === 'deleted_at')) {
      db.exec('ALTER TABLE users ADD COLUMN deleted_at INTEGER');
    }
    if (!userColsP1.some((c) => c.name === 'disabled')) {
      db.exec('ALTER TABLE users ADD COLUMN disabled INTEGER DEFAULT 0');
    }

    // Migration: P1 — user_permissions table
    db.exec(`
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
    `);

    // Migration: P1 — invite_codes table
    db.exec(`
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
    `);

    // Migration: P1 — backfill default permissions for existing users
    {
      const now = Date.now();
      const members = db.prepare("SELECT id FROM users WHERE role = 'member'").all() as { id: string }[];
      const agents = db.prepare("SELECT id FROM users WHERE role = 'agent'").all() as { id: string }[];
      const insertPerm = db.prepare(
        'INSERT OR IGNORE INTO user_permissions (user_id, permission, scope, granted_by, granted_at) VALUES (?, ?, \'*\', NULL, ?)'
      );

      for (const u of members) {
        insertPerm.run(u.id, 'channel.create', now);
        insertPerm.run(u.id, 'message.send', now);
        insertPerm.run(u.id, 'agent.manage', now);
      }
      for (const u of agents) {
        insertPerm.run(u.id, 'message.send', now);
      }
    }

    // Migration: P1 — backfill Creator permissions for existing channels
    {
      const now = Date.now();
      const creatorChannels = db.prepare(
        `SELECT c.id, c.created_by FROM channels c
         JOIN users u ON u.id = c.created_by
         WHERE u.role = 'member' AND c.deleted_at IS NULL AND c.name != 'general'`
      ).all() as { id: string; created_by: string }[];
      const insertPerm = db.prepare(
        'INSERT OR IGNORE INTO user_permissions (user_id, permission, scope, granted_by, granted_at) VALUES (?, ?, ?, NULL, ?)'
      );
      for (const ch of creatorChannels) {
        const scope = `channel:${ch.id}`;
        insertPerm.run(ch.created_by, 'channel.delete', scope, now);
        insertPerm.run(ch.created_by, 'channel.manage_members', scope, now);
        insertPerm.run(ch.created_by, 'channel.manage_visibility', scope, now);
      }
    }

    // Migration: P1 — backfill agent owner_id (assign to first admin)
    {
      const firstAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1").get() as { id: string } | undefined;
      if (firstAdmin) {
        db.prepare("UPDATE users SET owner_id = ? WHERE role = 'agent' AND owner_id IS NULL").run(firstAdmin.id);
      }
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

    // Migration: clean up DM channels with >2 members (keep only the pair from the channel name)

    // Migration: P5 — message_reactions table
    db.exec(`
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
    `);

    // Migration: B10 — add deleted_at column to messages (soft delete)
    const msgCols = db.prepare("PRAGMA table_info(messages)").all() as { name: string }[];
    if (!msgCols.some((c) => c.name === 'deleted_at')) {
      db.exec('ALTER TABLE messages ADD COLUMN deleted_at INTEGER');
    }

    // Migration: B20 — workspace_files table
    db.exec(`
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

    const dmChannels = db.prepare(
      `SELECT c.id, c.name FROM channels c
       WHERE c.type = 'dm'
         AND (SELECT COUNT(*) FROM channel_members WHERE channel_id = c.id) > 2`,
    ).all() as { id: string; name: string }[];
    for (const { id, name } of dmChannels) {
      const match = name.match(/^dm:(.+)_(.+)$/);
      if (match) {
        const [, uid1, uid2] = match;
        db.prepare(
          "DELETE FROM channel_members WHERE channel_id = ? AND user_id NOT IN (?, ?)",
        ).run(id, uid1, uid2);
      }
    }
  });
  migrate();
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
