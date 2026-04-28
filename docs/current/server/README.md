# server-go — 后端设计

代码位置：`/workspace/borgee/packages/server-go/`

## 1. 启动流程

入口 `cmd/collab/main.go`：

```
config.Load()           # 读环境变量
slog 初始化              # dev=text, prod=json
store.Open(cfg)         # SQLite + GORM
store.Migrate()         # 一次性建表 + 增量列迁移 + 回填
server.New(cfg, store)  # 装配 router + middleware
http.Server.Serve       # 0.0.0.0:4900
```

`SIGINT/SIGTERM` 触发 15s 超时的 graceful shutdown。

### 配置项 (`internal/config/config.go`)

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `PORT` | `4900` | 监听端口 |
| `HOST` | `0.0.0.0` | bind 地址 |
| `NODE_ENV` | `""` | `"development"` 时启用 dev 行为 |
| `LOG_LEVEL` | `info` | debug/info/warn/error |
| `CORS_ORIGIN` | `https://borgee.codetrek.cn` | prod 单一允许 origin（dev 反射 Origin） |
| `DATABASE_PATH` | `data/collab.db` | SQLite 文件 |
| `UPLOAD_DIR` | `data/uploads` | 上传目录 |
| `WORKSPACE_DIR` | `data/workspaces` | per-channel workspace 文件根 |
| `CLIENT_DIST` | `packages/client/dist` | SPA 静态资源 |
| `JWT_SECRET` | dev 时 `dev-secret` | prod 必填，否则 `Validate()` 报错 |
| `DEV_AUTH_BYPASS` | `false` | 仅 dev：允许 `X-Dev-User-Id` 头 |
| `ADMIN_USER` / `ADMIN_PASSWORD` | 空 | 都非空时才挂载 `/admin-api/*` |

## 2. HTTP 层

- **路由**：标准库 `http.ServeMux`（Go 1.22 新增 `"GET /api/v1/...{id}"` 模式语法），**没有引入第三方 router**。
- **Middleware 链**（`internal/server/middleware.go`，外到内）：
  1. `recoverMiddleware` — panic → 500 + 堆栈日志。
  2. `requestIDMiddleware` — 注入 UUID `X-Request-ID`。
  3. `loggerMiddleware` — slog 结构化访问日志。
  4. `corsMiddleware` — dev 反射 Origin，prod 只允许 `CORS_ORIGIN`，`Allow-Credentials: true`，处理 OPTIONS。
  5. `securityHeadersMiddleware` — `X-Content-Type-Options`、`X-Frame-Options: DENY` 等。
  6. `rateLimitMiddleware` — 基于 client IP 的 token bucket，`/api/v1/auth/register` 10/min，其余 100/min；后台每 5 分钟清理旧桶。
- **静态资源**：`cfg.ClientDist` 下的文件直接 serve，不带后缀的路径回退到 `index.html`/`admin.html`，实现 SPA fallback。

## 3. Auth

三种鉴权机制并存，`auth.AuthMiddleware`（`api/middleware.go`）按 cookie → Bearer → dev-bypass 顺序解析。

| 机制 | 形式 | 适用场景 |
|------|------|----------|
| **JWT cookie** | `borgee_token`，HS256，7d，`HttpOnly; SameSite=Lax`，prod 非 localhost 加 `Secure` | 浏览器用户 |
| **Bearer API key** | `Authorization: Bearer <api_key>`，对照 `users.api_key` | Agent / CI / plugin |
| **Dev bypass** | `DEV_AUTH_BYPASS=true` + `NODE_ENV=development` 时启用，详见下文 | 本地联调 |

`POST /api/v1/poll` 还接受 body 里的 `api_key` 字段，方便 plugin 长连。

**Dev bypass 行为细节**（`internal/auth/middleware.go:56–74`）：
启用后顺序为
1. `X-Dev-User-Id: <uid>` 头存在 → 以该 user 通过；
2. 否则**没有任何凭证**也会通过，自动选第一个 `role="admin"` 的 user。

也就是说在 dev 模式下根本不带 cookie 也能直接访问 API。**生产 / staging 千万不要打开**。

**Admin auth 完全独立**：`borgee_admin_token` cookie 或 Bearer，密码是明文环境变量比较，只有 `ADMIN_USER` 与 `ADMIN_PASSWORD` 都设置时 admin 路由才注册。

**权限**（PRD F1 + AP-0 Phase 1 立场）：

- `user_permissions(user_id, permission, scope)`，UNIQUE。
- **AP-0 默认权限**（Phase 1 起）：
  - 注册新 human (`role=member`) → 一行 `(*, *)`，全权。
  - 创建 agent (`role=agent`) → 一行 `(message.send, *)`，最小权。
  - admin (`role=admin`) → 不写默认行，admin 角色在中间件隐式过 `*`。
- 频道创建者迁移时回填 `channel.delete / channel.manage_members / channel.manage_visibility`，scope=`channel:<id>`。
- 中间件 `auth.RequirePermission(perm)`：admin 直放; 其他角色按 `user_permissions` 匹配, **额外** 把 `(*, *)` 视作通配通过, 再按 (`perm`, `*`) 或 (`perm`, scope) 精确匹配。
- v0 stance: AP-0 是过渡形态。Phase 4 AP-1 (三层 scope) + AP-2 (UI bundle) 会把 human 默认从 `(*, *)` 收窄到按 capability bundle 授权; bundle 名按能力 (Messaging / Workspace), **不** 按角色 (PM / Dev)。

## 4. 存储层 (`internal/store/`)

- **驱动**：`gorm.io/driver/sqlite` + `mattn/go-sqlite3`（CGo），不是 modernc。
- **Pragma**：开 WAL、外键、`busy_timeout=5000`；`:memory:` 模式强制 `MaxOpenConns(1)`。
- **迁移策略**：没有版本表，`Migrate()` 是幂等函数：
  1. 关 FK
  2. `createSchema()` — `CREATE TABLE IF NOT EXISTS`
  3. `applyColumnMigrations()` — 加列（用 `columnExists()` 守卫，**只加不改不删**）
  4. `createSchemaIndexes()`
  5. 重启 FK
  6. 回填依次执行：`backfillDefaultPermissions` → `backfillCreatorChannelPermissions` → `backfillAgentOwnerID`（当前是 no-op stub）→ `backfillPositions`（重平衡 `position` 为 `"0|aaaaaa"` 或空字符串的 channel）→ `cleanupDuplicateDMs` → `cleanupDMExtraMembers`（删除 DM 频道内非两位参与者的成员）

详细表结构见 [`data-model.md`](data-model.md)。

### LexoRank（`store/lexorank.go`）

- 用途：channel & channel_group 的拖拽排序。
- 形式：`"0|<base26>"`，例如 `"0|hzzzzz"`。
- `GenerateRankBetween(before, after)` 给两侧 rank 算 base-26 中点；`Rebalance(items)` 在 `[a,z]` 上均匀重分配。
- 迁移会把所有等于默认值 `"0|aaaaaa"` 的频道一次 rebalance。

### 关键查询 (`queries*.go`)

- `CreateMessageFull(...)` — **事务**：写 message、解析 `@name` 写 mentions、再写一行 events。
- `ListChannelMessages(channelId, before, after, limit)` — cursor 分页 + `has_more`。
- `GetEventsSinceWithChanges(cursor, limit, channelIDs, kinds)` — 长轮询 / SSE 共用。
- `CanAccessChannel(userId, channelId)` — public 任何人能访问，private 看 membership。
- `ForceDeleteChannel(id)` — 仅 admin，按顺序删 messages / members / mentions / events / channel。

## 5. API Surface

全部业务 API 在 `/api/v1/` 下，admin 在 `/admin-api/v1/` 下。下表枚举出主要端点（按 resource 分组），方法 + 路径 + 用途，代码位置见 `internal/api/*.go` 中对应 handler。

### Auth & 自身
| Method | Path | 用途 |
|--------|------|------|
| POST | `/api/v1/auth/login` | email + password，签 JWT 写 cookie |
| POST | `/api/v1/auth/register` | 邀请码注册 |
| POST | `/api/v1/auth/logout` | 清 cookie |
| GET | `/api/v1/users/me` | 当前 user + permissions |
| GET | `/api/v1/me/permissions` | 列出自己所有权限 |
| GET | `/api/v1/online` | 当前在线用户列表 |

### Channels
| Method | Path | 用途 |
|--------|------|------|
| GET | `/api/v1/channels` | 列出（含未读数） |
| POST | `/api/v1/channels` | 创建（需 `channel.create`） |
| GET | `/api/v1/channels/{id}` | 详情 |
| GET | `/api/v1/channels/{id}/preview` | 公开 metadata（公开频道无需认证） |
| PUT | `/api/v1/channels/{id}` | 改名/topic/visibility |
| PUT | `/api/v1/channels/{id}/topic` | 单独改 topic |
| POST | `/api/v1/channels/{id}/join` | 加入公开频道 |
| POST | `/api/v1/channels/{id}/leave` | 离开 |
| POST | `/api/v1/channels/{id}/members` | 加成员（需 `channel.manage_members`） |
| DELETE | `/api/v1/channels/{id}/members/{uid}` | 踢成员 |
| GET | `/api/v1/channels/{id}/members` | 成员列表 |
| PUT | `/api/v1/channels/{id}/read` | 更新 `last_read_at` |
| DELETE | `/api/v1/channels/{id}` | soft delete（需 `channel.delete`） |
| PUT | `/api/v1/channels/reorder` | LexoRank 重排 |

### Channel Groups
`GET/POST /api/v1/channel-groups`、`PUT/DELETE /api/v1/channel-groups/{id}`、`PUT /api/v1/channel-groups/reorder`。

### Messages
| Method | Path | 用途 |
|--------|------|------|
| GET | `/api/v1/channels/{id}/messages` | 历史，cursor 分页（before/after） |
| GET | `/api/v1/channels/{id}/messages/search` | 全文搜 |
| POST | `/api/v1/channels/{id}/messages` | 发送（需 `message.send`） |
| PUT | `/api/v1/messages/{id}` | 编辑 |
| DELETE | `/api/v1/messages/{id}` | soft delete |

### DM
- `POST /api/v1/dm/{userId}` — 拿到（或创建）和该用户的 DM channel。
- `GET /api/v1/dm` — 自己的 DM 列表。

### Reactions
- `PUT /api/v1/messages/{id}/reactions` — 加。
- `DELETE /api/v1/messages/{id}/reactions` — 取消。
- `GET /api/v1/messages/{id}/reactions` — 聚合后的列表。

### Workspace（per-channel 虚拟文件树）
`/api/v1/channels/{id}/workspace`、`.../upload`、`.../files/{fid}`（GET/PUT/PATCH/DELETE）、`.../mkdir`、`.../files/{fid}/move`，外加 `GET /api/v1/workspaces`（admin 视图）。

### Upload
`POST /api/v1/upload` 上传任意文件，回传 URL，公开服务在 `/uploads/<file>`。

### Agents
`POST/GET/DELETE /api/v1/agents`、`POST /api/v1/agents/{id}/rotate-api-key`、`GET/PUT /api/v1/agents/{id}/permissions`、`GET /api/v1/agents/{id}/files`（通过 plugin WS 反向代理列文件）。

### Agent invitations (CM-4.1)
`POST /api/v1/agent_invitations` — channel 成员发起邀请，body `{channel_id, agent_id, expires_at?}`。Handler 显式 `state = "pending"`（不依赖 GORM default）；agent 已在 channel → 409。
`GET /api/v1/agent_invitations[?role=owner|requester]` — `owner`（默认）= 列出本人所拥有 agent 的待办；`requester` = 列出本人创建的；admin 在 owner 模式下看全量。
`GET /api/v1/agent_invitations/{id}` — 仅 requester / agent owner / admin 可读。
`PATCH /api/v1/agent_invitations/{id}` body `{state: "approved"|"rejected"}` — 仅 agent owner（或 admin）可决策；状态机复用 `store.AgentInvitation.Transition`，非法转移 → 409；`approved` 同步把 agent 加入 channel（idempotent）。响应 payload hand-built sanitizer，从不直接序列化 `*store.AgentInvitation`。BPP frame / client UI / offline 检测留给 CM-4.2 / CM-4.3。

### Commands
`GET /api/v1/commands` — 当前所有 plugin 注册过的 slash command，按 agent 分组。

### Remote Nodes
`/api/v1/remote/nodes`（CRUD）、`/api/v1/remote/nodes/{id}/bindings`（CRUD）、`/api/v1/channels/{id}/remote-bindings`、`/api/v1/remote/nodes/{id}/{status,ls,read}`（代理到 `remote-agent`）。

### Realtime endpoints
- `POST /api/v1/poll` — 长轮询，详见 §6。
- `GET /api/v1/stream` — SSE。
- `HEAD /api/v1/stream` — 探活，plugin auto-transport 用来探测 SSE 可用性。
- `GET /ws`、`/ws/plugin`、`/ws/remote` — WebSocket，详见 §6。

### Admin (`/admin-api/v1/`，全部走 AdminAuthMiddleware)
- `auth/login`、`auth/logout`、`auth/me`
- `users` CRUD + `users/{id}/agents`、`users/{id}/api-key`、`users/{id}/permissions`
- `invites` CRUD
- `channels` 列表、`channels/{id}/force` 硬删
- `stats` 大盘

## 6. Realtime

### WebSocket

底层库：`github.com/coder/websocket`。三个端点：

| Path | 用途 | 鉴权 |
|------|------|------|
| `/ws` | 浏览器 client | cookie / Bearer / `?token=` |
| `/ws/plugin` | OpenClaw plugin | Bearer 或 `?apiKey=` |
| `/ws/remote` | `remote-agent` daemon | `?token=` |

**Envelope**：`{type, ...payload}` JSON。

**Client → Server 类型**：`ping`、`pong`（响应服务端心跳）、`subscribe`（加 `channel_id` 到订阅集合）、`unsubscribe`、`typing`、`send_message`、`register_commands`（plugin 注册 slash commands）。

**Server → Client 类型**：
- 控制类：`pong`、`subscribed`、`unsubscribed`、`commands_registered`、`error`（subscribe / send_message 失败时）
- 状态类：`presence`、`typing`、`commands_updated`
- 消息类：`new_message`、`message_edited`、`message_deleted`、`reaction_update`
- 频道/分组类：`channel_created`、`channel_added`、`channel_removed`、`channel_deleted`、`channel_updated`、`channels_reordered`、`group_created`、`group_updated`、`group_deleted`、`groups_reordered`（注意是复数前缀）
- 乐观发送回执：`message_ack`（成功）、`message_nack`（失败）。**没有** `message_sent`。

Hub 维护 `onlineUsers map[userId]map[*Client]bool` 支持多端在线。Heartbeat goroutine 周期 ping，未响应的 client 被踢。

### 长轮询 `POST /api/v1/poll`

```
请求: {
  api_key,            # 可选，也可用 Authorization 头
  cursor?,            # 优先级低于 since_id
  since_id?,          # 消息 ID，server 会反查对应 cursor
  channel_ids?,
  timeout_ms?         # 缺省 30000，最大 60000
}
处理:
  1. 立刻 GetEventsSinceWithChanges(cursor, 100, channel_ids, ...)
  2. 有数据 → 立刻返回 {cursor, events[]}
  3. 没数据 → 订阅 hub.SubscribeEvents()，最多阻塞 min(timeout_ms, 60000) ms
返回: {cursor, events: [{cursor, kind, channel_id, payload, created_at}]}
```

注意 `timeout_ms` 缺省即 30 s 阻塞——客户端如果想做"立即返回"必须显式传 `0`。

### SSE `GET /api/v1/stream`

- `Last-Event-ID` 用作 cursor，连接后回放。
- 每 15s 发 `event: heartbeat`。
- 每 60s 重新查一次自己有权访问的 channel 列表（成员变更后及时收到）。
- 帧格式：`event: <kind>\nid: <cursor>\ndata: <JSON>\n\n`。
- 鉴权同 `/ws`：cookie / Bearer / `?api_key=`。

### 写路径扇出

唯一入口是 `Hub.BroadcastEventToChannel(channelID, kind, payload)`：

1. 立即推送给订阅了该 channel 的所有 WS client。
2. 调 `Hub.SignalNewEvents()` 唤醒所有 SSE / poll 等待者。
3. 等待者醒来后自己再去 `events` 表拉 cursor 之后的全部事件——保证不丢、保证可断线续传。

## 7. Agent 集成

- Agent 是 `users` 表里 `role="agent"` 的行，`owner_id` 指向所属 user，鉴权走 API key。
- `POST /api/v1/agents` 创建后自动签发一把 `crypto/rand` key；`rotate-api-key` 重签。
- Plugin 通过 `/ws/plugin` 长连，可以用 `register_commands` 注册 slash 命令；用户输入 `/cmd` 时 server 通过这个连接把 command 派发给具体 agent。
- `GET /api/v1/agents/{id}/files` 走 plugin WS 反向请求，让 server 可以显示 agent 暴露的文件。

## 8. 测试

- `internal/api/testutil.NewTestServer(t)` 起一个 in-memory SQLite + 跑迁移 + `httptest.NewServer`。
- 真实 HTTP / 真实存储，**没有 mock 层**。
- 覆盖了并发写、级联删除、channel 隔离、分页、SSE、e2e 等场景。
- 跑测试：`cd packages/server-go && go test ./...`。
