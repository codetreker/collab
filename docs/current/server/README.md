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
| `ADMIN_USER` / `ADMIN_PASSWORD` | 空 | **已废弃**（ADM-0.1+ 用 `BORGEE_ADMIN_LOGIN` + `BORGEE_ADMIN_PASSWORD_HASH`），保留供过渡期日志参考 |
| `BORGEE_ADMIN_LOGIN` | — | ADM-0.1：admin bootstrap 登录名，缺 → fail-loud |
| `BORGEE_ADMIN_PASSWORD_HASH` | — | ADM-0.1：bcrypt hash，缺 → fail-loud |

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

**Admin auth 完全独立**（ADM-0.1 + ADM-0.2 stance）：

- 凭证表：`admins` 表（ADM-0.1），bcrypt hash；bootstrap 由 `BORGEE_ADMIN_LOGIN` + `BORGEE_ADMIN_PASSWORD_HASH` 环境变量 fail-loud 注入（缺一启动失败）。
- Cookie：`borgee_admin_session`，值是 32 字节随机 hex token，**不**是 admin id。`admin_sessions(token PK, admin_id, created_at, expires_at)` 表反查（ADM-0.2 §1）。
- 中间件 `admin.RequireAdmin` 只解 `borgee_admin_session` cookie / Bearer，找不到 session 或过期 → 401。
- 二轨完全隔离：user-rail (`borgee_token`) **永远不**授权 `/admin-api/*`；admin-rail (`borgee_admin_session`) **永远不**授权 `/api/v1/*`。`/api/v1/admin/*` 这条 god-mode 旧挂载在 ADM-0.2 已删除，无任何 user-API 路径上需要 admin 权限。
- 字段白名单：`/admin-api/v1/{stats,users,invites,channels}` response 只回元数据（id / created_at / role / counts），**禁止**出现 `body|content|text|artifact` 等业务正文字段（`internal/admin/handlers_field_whitelist_test.go` 反射扫描守门）。

**权限**（PRD F1 + AP-0 Phase 1 立场）：

- `user_permissions(user_id, permission, scope)`，UNIQUE。
- **AP-0 默认权限**（Phase 1 起）+ **AP-0-bis**（Phase 2 R3 决议 #1, 2026-04-28）：
  - 注册新 human (`role=member`) → 一行 `(*, *)`，全权。
  - 创建 agent (`role=agent`) → **两行** `(message.send, *)` + `(message.read, *)`（AP-0-bis 锁定; agent 摄取频道 context 需 read，发送是另一面）。
  - admin (`role=admin`) → 不写默认行，admin 权威只活在 `/admin-api/*` 一轨。
- **AP-0-bis backfill**（migration v=8 `ap_0_bis_message_read`）：现网既有 `role='agent' AND deleted_at IS NULL` 的用户在升级时 idempotent 地补一行 `(message.read, *)`；`WHERE NOT EXISTS` 守门，重跑无副作用。
- 频道创建者迁移时回填 `channel.delete / channel.manage_members / channel.manage_visibility`，scope=`channel:<id>`。
- 中间件 `auth.RequirePermission(perm)`：**ADM-0.2 起**统一查 `user_permissions`，`(*, *)` / `(perm, *)` / `(perm, scope)` 任一命中即放行；`users.role == "admin"` **不再**短路（admin 权威只活在 `/admin-api/*` 一轨）。
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
| POST | `/api/v1/auth/register` | 邀请码注册；副作用：自动建 1 个 org（CM-1.2）+ 1 个 `type=system` #welcome 频道（CM-onboarding，含一条 sender_id='system' 的欢迎消息 + quick_action 按钮 JSON）。频道是硬契约；系统消息插失败仅日志告警，注册仍成功。 |
| POST | `/api/v1/auth/logout` | 清 cookie |
| GET | `/api/v1/users/me` | 当前 user + permissions |
| GET | `/api/v1/me/permissions` | 列出自己所有权限 |
| GET | `/api/v1/online` | 当前在线用户列表 |

### Channels
| Method | Path | 用途 |
|--------|------|------|
| GET | `/api/v1/channels` | 列出（含未读数；CHN-1.2 起 public 发现限定 `c.org_id = u.org_id`，且过滤 archived） |
| POST | `/api/v1/channels` | 创建（需 `channel.create`；**CHN-1.2 立场 ②**: 默认仅 creator 是成员，count==1） |
| GET | `/api/v1/channels/{id}` | 详情 |
| GET | `/api/v1/channels/{id}/preview` | 公开 metadata（公开频道无需认证） |
| PUT | `/api/v1/channels/{id}` | 改名/topic/visibility/archive（**CHN-1.2 立场 ⑤**: `archived: true` 由 server 戳 `archived_at` 并 fanout system DM `channel #{name} 已被 {owner_name} 关闭于 {ts}`） |
| PUT | `/api/v1/channels/{id}/topic` | 单独改 topic |
| POST | `/api/v1/channels/{id}/join` | 加入公开频道 |
| POST | `/api/v1/channels/{id}/leave` | 离开 |
| POST | `/api/v1/channels/{id}/members` | 加成员（需 `channel.manage_members`；**CHN-1.2 立场 ⑥**: agent 自动 `silent=true` 并发出 system message `{agent_name} joined`。CHN-1.3 fix: agent 创建时的 `AddUserToPublicChannels` 自动入 channel 路径也走 `AddChannelMember`，确保 silent 标志在 fan-out 路径上同样落到 `channel_members.silent`） |
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
| GET | `/api/v1/channels/{id}/messages` | 历史，cursor 分页（before/after）；**AP-0-bis 起**需 `message.read`（channelScope） |
| GET | `/api/v1/channels/{id}/messages/search` | 全文搜；**AP-0-bis 起**需 `message.read`（channelScope） |
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

`sanitizeAgentInvitation` 自 bug-029 修起 JOIN `users` + `channels` 解析三个 label 字段：`agent_name`（agent 所属 user 的 display_name，agent 本身没 name 列）、`channel_name`、`requester_name`。lookup miss → 字段输出空串（key 始终在，UI 端 `name || id` fallback）。store 为 `nil` 时（白盒测试径）三字段全部空串。改 sanitizer 字段集 = 同步改 `agent_invitations_test.go::TestAgentInvitations_SanitizerKeys` 白名单（red line）。

### Commands
`GET /api/v1/commands` — 当前所有 plugin 注册过的 slash command，按 agent 分组。

### Remote Nodes
`/api/v1/remote/nodes`（CRUD）、`/api/v1/remote/nodes/{id}/bindings`（CRUD）、`/api/v1/channels/{id}/remote-bindings`、`/api/v1/remote/nodes/{id}/{status,ls,read}`（代理到 `remote-agent`）。

### Realtime endpoints
- `POST /api/v1/poll` — 长轮询，详见 §6。
- `GET /api/v1/stream` — SSE。
- `HEAD /api/v1/stream` — 探活，plugin auto-transport 用来探测 SSE 可用性。
- `GET /api/v1/events?since=<cursor>&limit=<N>` — **RT-1.2 (#290 follow)** 同步 backfill：客户端 WS 重连后用 `last_seen_cursor` 跟 server 对账, 拉断线期间漏掉的 event。`since` 必填、非负 int64；`limit` 默认 200、上限 500；server 只返回 `cursor > since` 的事件 (按 cursor ASC), 已 user-channel filter。**反约束**: server 不返回 `cursor <= since` 的事件 (`TestEventsBackfillSinceCursor/returns_events_strictly_after_since` 锁); cold start 客户端不调本接口 (`since=0` 不 default 拉全 history, 与 RT-1.3 BPP `session.resume{full}` 区别)。
- `GET /ws`、`/ws/plugin`、`/ws/remote` — WebSocket，详见 §6。

### Admin (`/admin-api/v1/`，全部走 `admin.RequireAdmin` 中间件 / `borgee_admin_session` cookie)
- `auth/login`、`auth/logout`、`auth/me`（同时挂在 `/admin-api/auth/*` 与 `/admin-api/v1/auth/*` 两条 path，admin SPA 0-改）
- `users` 列表 / CRUD + `users/{id}/agents`、`users/{id}/api-key`、`users/{id}/permissions`
- `invites` CRUD
- `channels` 列表、`channels/{id}/force` 硬删
- `stats` 大盘（含 `by_org[]`，CM-1.3）
- 字段白名单守门：response 只回元数据，禁止 `body|content|text|artifact` 等业务正文（`internal/admin/handlers_field_whitelist_test.go`）

> ADM-0.2 砍掉的旧 `/api/v1/admin/*` god-mode 路径已移除（`auth_isolation_test.go` 反向断言 → 404）。

### Health
- `GET /health` — 无鉴权，返回 `{"status":"ok"}`，给负载均衡 / k8s liveness probe 用。`server.go::handleHealth`。

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
- 频道/分组类：`channel_created`、`channel_added`、`channel_removed`、`channel_deleted`、`channel_updated`、`channels_reordered`、`group_created`、`group_updated`、`group_deleted`、`groups_reordered`（注意是复数前缀）。CHN-1.3 fix: `channel_added` 现在 carry 完整 `{channel}` 对象（与 `channel_created` 一致），不再仅 `{channel_id}` —— 否则前端 reducer 会因 `action.channel === undefined` 而 crash AppProvider。
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
