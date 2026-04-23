import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyMultipart from '@fastify/multipart';

const JWT_SECRET = 'test-secret-for-vitest';

export function makeToken(userId: string, email = 'test@test.com'): string {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '1h' });
}

export function authCookie(userId: string, email?: string): string {
  return `collab_token=${makeToken(userId, email)}`;
}

export function seedMessage(db: Database.Database, channelId: string, senderId: string, content = 'hello', createdAt?: number, type = 'text'): string {
  const id = uuidv4();
  db.prepare('INSERT INTO messages (id, channel_id, sender_id, content, content_type, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, channelId, senderId, content, type, createdAt ?? Date.now());
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

    CREATE TABLE IF NOT EXISTS remote_nodes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      machine_name TEXT NOT NULL,
      connection_token TEXT NOT NULL UNIQUE,
      last_seen_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_remote_nodes_user ON remote_nodes(user_id);
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

export class TestContext {
  app!: FastifyInstance;
  db!: Database.Database;
  admin!: { id: string; token: string };
  memberA!: { id: string; token: string };
  memberB!: { id: string; token: string };
  agent!: { id: string; apiKey: string; ownerId: string };
  channel!: { id: string };

  static async create(opts?: {
    routes?: ((app: FastifyInstance) => void) | ((app: FastifyInstance) => void)[];
  }): Promise<TestContext> {
    const ctx = new TestContext();
    ctx.db = createTestDb();

    ctx.app = Fastify({ logger: false });

    const { authMiddleware } = await import('../auth.js');
    ctx.app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/v1/auth/')) return;
      await authMiddleware(request, reply);
    });

    if (opts?.routes) {
      const routeFns = Array.isArray(opts.routes) ? opts.routes : [opts.routes];
      for (const fn of routeFns) {
        fn(ctx.app);
      }
    }

    await ctx.app.ready();

    ctx.admin = { id: seedAdmin(ctx.db), token: '' };
    ctx.admin.token = authCookie(ctx.admin.id);
    ctx.memberA = { id: seedMember(ctx.db, 'MemberA'), token: '' };
    ctx.memberA.token = authCookie(ctx.memberA.id);
    ctx.memberB = { id: seedMember(ctx.db, 'MemberB'), token: '' };
    ctx.memberB.token = authCookie(ctx.memberB.id);
    ctx.agent = { id: seedAgent(ctx.db, ctx.admin.id), apiKey: '', ownerId: ctx.admin.id };
    const row = ctx.db.prepare('SELECT api_key FROM users WHERE id = ?').get(ctx.agent.id) as { api_key: string };
    ctx.agent.apiKey = row.api_key;
    ctx.channel = { id: seedChannel(ctx.db, ctx.admin.id) };
    addChannelMember(ctx.db, ctx.channel.id, ctx.admin.id);
    addChannelMember(ctx.db, ctx.channel.id, ctx.memberA.id);
    addChannelMember(ctx.db, ctx.channel.id, ctx.memberB.id);

    return ctx;
  }

  async inject(method: string, url: string, token: string, body?: unknown) {
    return this.app.inject({
      method: method as any,
      url,
      payload: body as any,
      headers: { cookie: token },
    });
  }

  async close() {
    await this.app.close();
    this.db.close();
  }
}

// Routes obtain DB via `import { getDb } from '../db.js'` — callers must vi.mock('../db.js')
// to inject the test DB before calling this function.
export async function buildFullApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(fastifyWebsocket);
  await app.register(fastifyMultipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  const { authMiddleware, registerAuthRoutes } = await import('../auth.js');
  app.addHook('onRequest', async (request, reply) => {
    const url = request.url;
    if (
      url.startsWith('/api/v1/auth/') ||
      url === '/ws' || url.startsWith('/ws?') ||
      url.startsWith('/ws/plugin') ||
      url.startsWith('/ws/remote')
    ) return;
    await authMiddleware(request, reply);
  });

  const { registerChannelRoutes } = await import('../routes/channels.js');
  const { registerMessageRoutes } = await import('../routes/messages.js');
  const { registerUserRoutes } = await import('../routes/users.js');
  const { registerAdminRoutes } = await import('../routes/admin.js');
  const { registerAgentRoutes } = await import('../routes/agents.js');
  const { registerReactionRoutes } = await import('../routes/reactions.js');
  const { registerDmRoutes } = await import('../routes/dm.js');
  const { registerWorkspaceRoutes } = await import('../routes/workspace.js');
  const { registerRemoteRoutes } = await import('../routes/remote.js');
  const { registerWsPluginRoutes } = await import('../routes/ws-plugin.js');
  const { registerWsRemoteRoutes } = await import('../routes/ws-remote.js');
  const { registerPollRoutes } = await import('../routes/poll.js');
  const { registerStreamRoutes } = await import('../routes/stream.js');
  const ws = await import('../ws.js');

  registerAuthRoutes(app);
  registerChannelRoutes(app);
  registerMessageRoutes(app);
  registerUserRoutes(app);
  registerAdminRoutes(app);
  registerAgentRoutes(app);
  registerReactionRoutes(app);
  registerDmRoutes(app);
  registerWorkspaceRoutes(app);
  registerRemoteRoutes(app);
  registerWsPluginRoutes(app);
  registerWsRemoteRoutes(app);
  registerPollRoutes(app);
  registerStreamRoutes(app);
  if ('registerWebSocket' in ws) {
    (ws as any).registerWebSocket(app);
  }

  await app.ready();
  return app;
}

export async function httpJson(port: number, method: string, path: string, cookie: string, body?: unknown): Promise<{ status: number; json: any; text: string; headers: Headers }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      cookie,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: res.status, json, text, headers: res.headers };
}

export function createTmpDir(prefix = 'collab-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function removeTmpDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}
