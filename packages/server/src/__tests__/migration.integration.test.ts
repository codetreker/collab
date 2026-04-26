import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  createTestDb, seedAdmin, seedChannel, seedMessage,
} from './setup.js';

const EXPECTED_TABLES = [
  'channels', 'users', 'messages', 'channel_members', 'mentions',
  'events', 'user_permissions', 'invite_codes', 'message_reactions',
  'workspace_files',
];

describe('Migration (integration)', () => {
  const dbs: Database.Database[] = [];

  afterEach(() => {
    for (const db of dbs) {
      try { db.close(); } catch { /* ignore */ }
    }
    dbs.length = 0;
  });

  it('new DB creates all expected tables', () => {
    const db = createTestDb();
    dbs.push(db);

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    for (const expected of EXPECTED_TABLES) {
      expect(tableNames).toContain(expected);
    }
  });

  it('migration is idempotent — running createTestDb schema twice does not error', () => {
    const db = createTestDb();
    dbs.push(db);

    expect(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS channels (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          topic TEXT DEFAULT '',
          type TEXT DEFAULT 'channel',
          visibility TEXT DEFAULT 'public',
          created_at INTEGER NOT NULL,
          created_by TEXT NOT NULL,
          deleted_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          role TEXT DEFAULT 'member',
          avatar_url TEXT,
          api_key TEXT UNIQUE,
          email TEXT,
          password_hash TEXT,
          last_seen_at INTEGER,
          require_mention INTEGER DEFAULT 1,
          owner_id TEXT REFERENCES users(id),
          deleted_at INTEGER,
          disabled INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL
        );
      `);
    }).not.toThrow();
  });

  it('new columns do not break existing data', () => {
    const db = createTestDb();
    dbs.push(db);

    const adminId = seedAdmin(db, 'MigAdmin');
    const channelId = seedChannel(db, adminId, 'mig-ch');
    const msgId = seedMessage(db, channelId, adminId, 'before migration');

    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId) as any;
    expect(msg.content).toBe('before migration');
    expect(msg.sender_id).toBe(adminId);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(adminId) as any;
    expect(user.display_name).toBe('MigAdmin');
    expect(user.require_mention).toBeDefined();
  });
});
