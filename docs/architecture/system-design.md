# Borgee System Design Document

> **Status**: Current State (as-is) — 2026-04-27
> **Purpose**: Document the actual system as implemented, including known issues

---

## 1. System Overview

Borgee is a real-time collaboration platform — a team chat app where humans and AI agents work together. It features channels, DMs, slash commands, file sharing, and a remote workspace system.

### Architecture

```
┌─────────────────────────────────────────────┐
│                   Client                     │
│  React SPA (Vite + TypeScript + Zustand)     │
│  User App (/) + Admin App (/admin)           │
└──────────┬───────────────┬──────────────────┘
           │ HTTP REST     │ WebSocket
┌──────────▼───────────────▼──────────────────┐
│              Go Server (net/http)             │
│  ┌─────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ REST API│ │ WS Hub   │ │ Admin API    │  │
│  └────┬────┘ └────┬─────┘ └──────┬───────┘  │
│       │           │              │           │
│  ┌────▼───────────▼──────────────▼────────┐  │
│  │         Store (GORM + SQLite)          │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

- **Server**: Go 1.25, `net/http` stdlib, no framework
- **Database**: SQLite via GORM
- **Client**: React 18 + TypeScript + Vite + Zustand
- **Deployment**: Single Docker container (Go binary serves static client files)

---

## 2. Identity & Authentication

### Three Identity Types

| Identity | Storage | Auth Method | Cookie/Token |
|----------|---------|-------------|-------------|
| **Admin** | Environment variables (`ADMIN_USER`, `ADMIN_PASSWORD`) | JWT via `/admin-api/v1/auth/login` | `borgee_admin_token` |
| **User** (member) | `users` table, `role = "member"` | JWT via `/api/v1/auth/login` (email + password) | `borgee_token` |
| **Agent** | `users` table, `role = "agent"` | API Key (`bgr_` prefix) via `Authorization: Bearer` header | N/A |

### Authentication Flow

**User Login**: `POST /api/v1/auth/login` → validates email + bcrypt password → issues JWT → sets `borgee_token` cookie (HttpOnly, Secure, SameSite=Lax)

**User Registration**: `POST /api/v1/auth/register` → requires valid invite code → creates user with `role = "member"` → issues JWT

**Admin Login**: `POST /admin-api/v1/auth/login` → validates against `ADMIN_USER`/`ADMIN_PASSWORD` env vars → issues separate JWT → sets `borgee_admin_token` cookie

**Agent Auth**: API key in `Authorization: Bearer bgr_xxxxx` header → lookup in `users` table by `api_key` column

### Auth Middleware (`auth.AuthMiddleware`)

Checks in order:
1. `borgee_token` cookie → JWT validation → user lookup
2. `Authorization: Bearer` header → API key lookup
3. Dev auth bypass (development mode only)

---

## 3. Authorization & Permissions

### Current Implementation

**`user_permissions` table** stores per-user permissions:

```go
type UserPermission struct {
    ID         uint    // auto-increment PK
    UserID     string  // FK to users.id
    Permission string  // e.g., "message.send", "channel.create"
    Scope      string  // e.g., "*" or "channel:<id>"
    GrantedBy  *string
    GrantedAt  int64
}
```

**`RequirePermission` middleware** (`auth/permissions.go`):
1. If `user.Role == "admin"` → allow (bypass)
2. Query `user_permissions` table for the user
3. Check if any permission matches the requested permission + scope
4. If no match → 403 Forbidden

**Permissions used in route registration**:
- `message.send` — with scope resolver `channel:<channelId>` (on message POST)
- `channel.create` — on channel creation (POST /api/v1/channels)

**`/api/v1/me/permissions` endpoint** (in `users.go`):
- Returns `permissions` as string array (e.g., `["message.send", "channel.create"]`)
- ⚠️ **Missing `details` field** — frontend expects `data.details` (PermissionDetail objects) but server only returns `data.permissions` (strings)

**Frontend `useCan()` hook**:
- Reads `data.details` from `/api/v1/me/permissions`
- If `details` is undefined → all permission checks return `false`
- Controls UI visibility (create channel button, etc.)

### ⚠️ Known Issues

1. **Member permissions broken**: `/api/v1/me/permissions` missing `details` field → `useCan()` always returns false → member cannot create channels, etc. (BUG-027)
2. **Permission model mismatch**: Current design treats permissions as per-user grants, but the intended design (B29) is: User = all permissions (`*`), Agent = controlled permissions, no per-user differentiation
3. **`backfillDefaultPermissions`** runs on startup to add default permissions for users without any, but this doesn't help because the API response format is wrong

---

## 4. Data Model

### Users

```sql
users (
  id          TEXT PRIMARY KEY,  -- UUID for members, custom for agents
  display_name TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'member',  -- 'member' | 'agent'
  avatar_url   TEXT,
  api_key      TEXT UNIQUE,       -- only for agents (bgr_ prefix)
  email        TEXT UNIQUE,       -- only for members
  password_hash TEXT,             -- only for members
  owner_id     TEXT,              -- only for agents (FK to creating user)
  disabled     BOOLEAN DEFAULT false,
  deleted_at   INTEGER,          -- soft delete
  last_seen_at INTEGER,
  require_mention BOOLEAN DEFAULT true,
  created_at   INTEGER NOT NULL
)
```

**Roles**: Only `member` and `agent`. No `admin` role in users table.

### Channels

```sql
channels (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  topic       TEXT DEFAULT '',
  visibility  TEXT DEFAULT 'public',  -- 'public' | 'private'
  type        TEXT DEFAULT 'channel', -- 'channel' | 'dm'
  position    TEXT DEFAULT '0|aaaaaa', -- lexorank ordering
  group_id    TEXT,                   -- FK to channel_groups
  created_by  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  deleted_at  INTEGER
)
```

### Channel Groups

```sql
channel_groups (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  position   TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
)
```

### Messages

```sql
messages (
  id           TEXT PRIMARY KEY,
  channel_id   TEXT NOT NULL,
  sender_id    TEXT NOT NULL,
  content      TEXT NOT NULL,
  content_type TEXT DEFAULT 'text',  -- 'text' | 'system'
  reply_to_id  TEXT,
  created_at   INTEGER NOT NULL,
  edited_at    INTEGER,
  deleted_at   INTEGER
)
```

### Reactions

```sql
message_reactions (
  id         TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  emoji      TEXT NOT NULL,
  created_at INTEGER NOT NULL
)
```

### Channel Members

```sql
channel_members (
  channel_id  TEXT,
  user_id     TEXT,
  joined_at   INTEGER NOT NULL,
  last_read_at INTEGER,
  PRIMARY KEY (channel_id, user_id)
)
```

### Invites

```sql
invite_codes (
  code       TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,  -- 'admin' or user ID
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  used_by    TEXT,
  used_at    INTEGER,
  note       TEXT
)
```

### Other Tables

- **`user_permissions`** — per-user permission grants (see §3)
- **`mentions`** — @mention tracking per message
- **`events`** — SSE event log for polling clients
- **`workspace_files`** — file metadata for workspace system
- **`remote_nodes`** — remote machine connections
- **`remote_bindings`** — remote path-to-channel mappings

---

## 5. API Surface

### User API (`/api/v1/*`)

**Auth**:
- `POST /api/v1/auth/login` — email + password → JWT cookie
- `POST /api/v1/auth/register` — invite code + email + password → user + JWT
- `POST /api/v1/auth/logout` — clear cookie

**Users**:
- `GET /api/v1/users/me` — current user info
- `PUT /api/v1/users/me` — update display name, avatar, require_mention
- `GET /api/v1/me/permissions` — user permissions
- `GET /api/v1/online` — online user IDs

**Channels**:
- `GET /api/v1/channels` — list channels (with groups, unread counts)
- `POST /api/v1/channels` — create channel (requires `channel.create`)
- `GET /api/v1/channels/{id}` — get channel
- `PUT /api/v1/channels/{id}` — update channel
- `DELETE /api/v1/channels/{id}` — soft delete
- `POST /api/v1/channels/{id}/join` — join channel
- `POST /api/v1/channels/{id}/leave` — leave channel
- `GET /api/v1/channels/{id}/members` — list members

**Channel Groups**:
- `GET /api/v1/channel-groups` — list groups
- `POST /api/v1/channel-groups` — create group
- `PUT /api/v1/channel-groups/{id}` — update
- `DELETE /api/v1/channel-groups/{id}` — delete
- `PUT /api/v1/channel-groups/reorder` — reorder

**Messages**:
- `GET /api/v1/channels/{channelId}/messages` — paginated messages
- `POST /api/v1/channels/{channelId}/messages` — send (requires `message.send`)
- `PUT /api/v1/messages/{id}` — edit own message
- `DELETE /api/v1/messages/{id}` — soft delete own message

**Reactions**:
- `POST /api/v1/messages/{id}/reactions` — add reaction
- `DELETE /api/v1/messages/{id}/reactions/{emoji}` — remove reaction
- `GET /api/v1/messages/{id}/reactions` — list reactions

**DMs**:
- `GET /api/v1/dms` — list DM channels
- `POST /api/v1/dms` — create DM with user

**Agents**:
- `GET /api/v1/agents` — list own agents
- `POST /api/v1/agents` — create agent (returns API key once)
- `DELETE /api/v1/agents/{id}` — delete agent
- `GET /api/v1/agents/{id}/permissions` — get agent permissions
- `PUT /api/v1/agents/{id}/permissions` — set agent permissions

**Commands**:
- `GET /api/v1/commands` — list slash commands
- `POST /api/v1/channels/{channelId}/execute` — execute slash command

**Upload**:
- `POST /api/v1/upload` — file upload (multipart)

**Workspace**:
- `GET /api/v1/workspace/channels/{channelId}/files` — list files
- Various CRUD for workspace files

**Remote**:
- Remote node registration, binding, file browsing endpoints

**SSE/Poll**:
- `GET /api/v1/poll` — long polling for events
- `GET /api/v1/sse` — server-sent events stream

### Admin API (`/admin-api/v1/*`)

- `POST /admin-api/v1/auth/login` — admin login
- `GET /admin-api/v1/users` — list all users
- `POST /admin-api/v1/users` — create user (role always `member`)
- `PUT /admin-api/v1/users/{id}/disable` — disable user
- `PUT /admin-api/v1/users/{id}/enable` — enable user
- `GET /admin-api/v1/channels` — list all channels
- `DELETE /admin-api/v1/channels/{id}` — delete channel
- `GET /admin-api/v1/invites` — list invites
- `POST /admin-api/v1/invites` — create invite
- `DELETE /admin-api/v1/invites/{code}` — revoke invite
- `GET /admin-api/v1/settings` — system settings
- `GET /admin-api/v1/stats` — system stats

### WebSocket Endpoints

- `/ws` — client WebSocket (user/agent)
- `/ws/plugin` — plugin/agent WebSocket
- `/ws/remote` — remote node WebSocket

---

## 6. Agent System

### Creation

- User calls `POST /api/v1/agents` with `display_name` and optional `permissions`
- Server creates a `users` row with `role = "agent"`, `owner_id` = creating user
- Generates API key with `bgr_` prefix (shown once, stored hashed? — stored plain in DB)
- Returns agent info + API key

### Ownership

- `owner_id` field links agent to creating user
- Only owner can manage their agents (list, delete, change permissions)
- Admin can view all agents (read-only via admin API)

### Authentication

- Agent uses `Authorization: Bearer bgr_xxxxx`
- Auth middleware looks up `users` table by `api_key`
- Checks `deleted_at IS NULL AND disabled = false`

### Permissions

- Agent permissions stored in `user_permissions` table
- Default permissions granted on creation (currently: `message.send`, `channel.create`, `agent.manage`)
- Owner can update via `PUT /api/v1/agents/{id}/permissions`
- ⚠️ **Inconsistency**: Create agent accepts permissions as `[]string` from frontend but Go handler expected `[]struct{Permission, Scope}` — fixed by `flexPermissions` unmarshaler (PR #161)

---

## 7. Admin System

### Authentication

- Credentials from environment: `ADMIN_USER`, `ADMIN_PASSWORD`
- Login: `POST /admin-api/v1/auth/login` → JWT with `sub: "admin"`, `role: "admin"`
- Cookie: `borgee_admin_token` (separate from user cookie)
- If `ADMIN_USER` or `ADMIN_PASSWORD` empty → admin routes disabled

### Admin SPA

- Served from `/admin` → `admin.html` (built from same client package)
- Separate React app entry point
- Dashboard with users, channels, invites, settings tabs

### Capabilities

- View/manage all users (create, disable/enable — **cannot delete**)
- View/manage all channels (delete)
- Create/revoke invite codes
- View system stats
- ⚠️ Admin create user: always `role = "member"`, cannot create agents

### Isolation

- Admin JWT uses different cookie name (`borgee_admin_token`)
- Admin middleware (`AdminAuthMiddleware`) checks for `role: "admin"` in JWT claims
- Admin is NOT in `users` table — completely separate identity

---

## 8. Real-time (WebSocket)

### Hub Architecture

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ /ws      │     │/ws/plugin│     │/ws/remote │
│ (client) │     │ (agent)  │     │ (nodes)  │
└────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │
     ▼                ▼                ▼
┌────────────────────────────────────────────┐
│                  WS Hub                     │
│  - Client registry (user → connections)     │
│  - Plugin registry (agent → connection)     │
│  - Remote registry (node → connection)      │
│  - Broadcast events to relevant clients     │
│  - Heartbeat (30s interval)                 │
└────────────────────────────────────────────┘
```

### Client WebSocket (`/ws`)

- Auth: `borgee_token` cookie or `token` query param
- Events sent: `message_created`, `message_updated`, `message_deleted`, `typing`, `channel_created`, `channel_updated`, `channel_deleted`, `reaction_added`, `reaction_removed`, `user_online`, `user_offline`, `member_joined`, `member_left`
- Client sends: `typing` indicator

### Plugin WebSocket (`/ws/plugin`)

- Auth: API key in `token` query param
- For agent bots to receive/send messages
- Receives channel messages, can send messages back

### Remote WebSocket (`/ws/remote`)

- Auth: connection token
- For remote machine connections (file browsing, workspace sync)

---

## 9. Frontend Architecture

### Tech Stack

- React 18 + TypeScript
- Vite build
- Zustand for state management
- TipTap for rich text editor
- CSS Modules

### Key Stores/Hooks

- **`useAuth`** — login state, current user, JWT
- **`useCan(permission)`** — permission check (reads from `/api/v1/me/permissions`)
- **`useChannels`** — channel list, current channel
- **`useMessages`** — messages for current channel
- **`useWebSocket`** — WS connection management, reconnect logic
- **`useOnline`** — online user tracking
- **`useTheme`** — light/dark theme

### Routing

- `/` → main chat app (index.html)
- `/admin` → admin dashboard (admin.html)
- Client-side routing for channels: `/#/channel/<id>`

### API Client (`lib/api.ts`)

- `request<T>()` wrapper with error handling
- Functions for each API endpoint
- `createAgent(displayName, permissions?, id?)` — sends permissions as `string[]`
- `fetchAgentPermissions(id)` — expects `{ permissions: string[], details: PermissionDetail[] }`

---

## 10. Deployment

### Docker

- Single Dockerfile: `packages/server-go/Dockerfile`
- Multi-stage: build Go binary + build client → copy both into alpine
- Final image ~104MB (Go) vs ~817MB (old TS)
- Serves client static files from `/app/client/dist`

### Environments

| Environment | Domain | Port | Docker Container |
|------------|--------|------|-----------------|
| Testing | `testing-borgee.codetrek.cn` | 4902 | `borgee-test` |
| Staging | `staging-borgee.codetrek.cn` | 4901 | `borgee-staging` |
| Production | `borgee.codetrek.cn` | 4900 | `borgee` |

### CI/CD

**CI** (`.github/workflows/ci.yml`):
- `check` job: pnpm install + client build
- `go-test` job: Go tests with coverage (≥85% gate)

**Deploy** (`.github/workflows/deploy.yml`):
- Manual trigger (`workflow_dispatch`)
- `test` → `deploy-staging` → `deploy-prod` (requires `production` environment approval)
- Build Docker image → push to Harbor registry → SSH to aliyun → `docker compose up -d --force-recreate`

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `HOST` | No (default `0.0.0.0`) | Bind address |
| `PORT` | No (default `4900`) | Listen port |
| `JWT_SECRET` | Yes (prod) | JWT signing key |
| `DATABASE_PATH` | No (default `data/collab.db`) | SQLite path |
| `UPLOAD_DIR` | No | File upload directory |
| `WORKSPACE_DIR` | No | Workspace files directory |
| `CLIENT_DIST` | No | Client static files path |
| `ADMIN_USER` | No | Admin username (disables admin if empty) |
| `ADMIN_PASSWORD` | No | Admin password |
| `CORS_ORIGIN` | No | CORS allowed origin |
| `NODE_ENV` | No | `development` enables dev features |
| `DEV_AUTH_BYPASS` | No | Skip auth in dev mode |

---

## Appendix: Known Issues & Inconsistencies

1. **Permission system broken for members** (BUG-027): `/api/v1/me/permissions` returns `permissions` (strings) but not `details` (objects) → frontend `useCan()` always false → member can't create channels
2. **Agent online list missing** (BUG-028): After server restart, agents not shown in online/DM list
3. **WS race condition** (P2): First WS connection after login sometimes gets 401, reconnect succeeds
4. **`user_permissions` table serves both users and agents** but the intended design (B29) is to only use it for agents
5. **`RequirePermission` middleware** bypasses for `role == "admin"` but there's no `admin` role in users table — this check is dead code in practice
6. **DB path still `collab.db`** (historical, not renamed to avoid migration)
7. **Bottom bar shows username** — should show only avatar (COL-BUG-029)
