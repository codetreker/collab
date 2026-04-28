# Admin — 后台管理面

Borgee 的 admin 面是一个**独立子系统**：不同的 SPA 入口（`admin.html`）、不同的 cookie（`borgee_admin_token`）、不同的鉴权中间件（`AdminAuthMiddleware`）。本文档把 server 与 client 两侧的 admin 实现一并讲清楚。

## 0. 两套并存的 admin 入口

代码里实际存在两条 admin 路由：

| 前缀 | 鉴权 | 谁用 |
|------|------|------|
| `/admin-api/v1/*` | `AdminAuthMiddleware`（`borgee_admin_token` cookie / Bearer） | admin SPA（`admin.html`） |
| `/api/v1/admin/*` | 普通用户 JWT + 内联 `user.Role == "admin"` 检查 | 任何 `role=admin` 的"普通用户"会话直接复用 |

两条路由**共用同一份** handler（`admin.go: registerRoutes`）。区别只在外层中间件——前者要 admin-only session，后者把 admin role 当做"超级用户的普通登录"对待。

> 服务端启动时只有 `ADMIN_USER` 与 `ADMIN_PASSWORD` **都非空**才会挂载这两组路由（`server/server.go:97`），否则只打个 warning。

## 1. Server 鉴权（`internal/api/admin_auth.go`）

### 登录

`POST /admin-api/v1/auth/login` 提交 `{username, password}`：

- 比对方式是**普通字符串 `!=`**（不是 `subtle.ConstantTimeCompare`），存在理论上的 timing side-channel。
- 用户名/密码来自环境变量 `ADMIN_USER` / `ADMIN_PASSWORD`，明文比较。
- 通过后签 JWT：HS256（与普通用户共用 `JWT_SECRET`）、`exp = now + 7d`、claims 仅含 `role: "admin"`（**不带 user id**——admin session 没绑某行 `users`）。
- 写 cookie `borgee_admin_token`：`HttpOnly; SameSite=Lax; MaxAge=604800; Path=/`，prod 非 localhost 加 `Secure`。
- 同时把 raw token 放 JSON body 返回，方便非浏览器客户端走 Bearer。

### 中间件

`AdminAuthMiddleware`（`admin_auth.go:101`）：

1. 先看 cookie `borgee_admin_token`；
2. 没有再看 `Authorization: Bearer <token>`；
3. `validateAdminJWT` 解析后还要断言 `claims.Role == "admin"`，普通用户的 JWT 即使签名一致也会被拒。

### 与普通用户 session 的关系

- 完全独立的两块 cookie（`borgee_token` vs `borgee_admin_token`），同一浏览器可以同时有两个身份。
- admin SPA 永远不读普通 cookie，反之亦然。
- 实务上：用 admin SPA 管理时走 `borgee_admin_token`；想直接以 admin 身份"使用产品"则走普通登录 + `role=admin`。

## 2. Server 路由 (`internal/api/admin.go`)

| Method | Path | 行为要点 |
|--------|------|----------|
| GET | `/stats` | 用户数 / 频道数 / 在线数；后者来自 `Store.GetOnlineUsers()`。CM-1.3 起额外返回 `by_org: [{org_id, user_count, channel_count}, ...]` (按 org 聚合, 见 `server/data-model.md`)。CM-1.4 dashboard 用它做 visibility checkpoint |
| GET | `/users` | 全量列表（含 soft-deleted），暴露 `email/disabled/last_seen` |
| POST | `/users` | bcrypt 哈希密码；**role 硬锁为 `member`**——admin 不能从这里造另一个 admin；自动授默认权限并加入公开频道 |
| PATCH | `/users/{id}` | 改 `display_name/password/role/require_mention/disabled`。`role` 仍只接受 `member`。**禁用会级联禁用名下所有 agent**（`cascadeDisableAgents`），重新启用同样级联 |
| DELETE | `/users/{id}` | **只软删**（设 `deleted_at`），不级联消息/频道，没有硬清退口子 |
| GET | `/users/{id}/agents` | 列出 `role=agent && owner_id=user.id` |
| POST | `/users/{id}/api-key` | 生成 32 字节随机 key（前缀 `bgr_`），通过 `Store.SetAPIKey` 入库；返回体只有 `{ok:true}`，**明文 key 不回传** |
| DELETE | `/users/{id}/api-key` | 清空 |
| GET | `/users/{id}/permissions` | 列 `user_permissions`；如果 user 是 admin 角色，返回合成的 `["*"]` 并附 note |
| POST | `/users/{id}/permissions` | 授权：`{permission, scope?}`，scope 缺省 `*`；插入前去重 |
| DELETE | `/users/{id}/permissions` | 按 `(permission, scope)` 精确删 |
| POST | `/invites` | 创建邀请码，`expiresAt` 可选，`note` 可选，`created_by="admin"` |
| GET | `/invites` | 列出全部邀请码 |
| DELETE | `/invites/{code}` | 删 |
| GET | `/channels` | 全部频道（含 deleted） |
| DELETE | `/channels/{id}/force` | 走 `Store.ForceDeleteChannel` 硬删（消息/成员/mentions/events 一并清）；**`#general` 与 DM 频道有守卫，删不掉** |

> 注意 server `POST /users/{id}/api-key` 只返回 `{ok:true}`，不返回明文 key。E2E 测试 (`admin_e2e_test.go`) 检查 `data["api_key"]` 看上去与实现不一致，是个待澄清的点（也许 `SetAPIKey` 在某条路径下会回填）。

## 3. Client SPA (`packages/client/src/admin/`)

### 入口与构建

- `admin.html` 是 Vite 的第二个入口（`vite.config.ts` Rollup `input.admin`），与用户 SPA 共构建，不共享 React 树。
- `main.tsx` 把 `<AdminAuthProvider>` 包 `<AdminApp/>` mount 到 `#root`。无 Redux / 无 query client。
- `server.go` 对 `/admin` 与 `/admin/*` 的请求 fallback 到 `dist/admin.html`，支持 client-side routing。

### 顶层 (`AdminApp.tsx`)

`<BrowserRouter>` + 一个守卫层：

- `useAdminAuth()` 给出 `{checked, session}`；`checked=false` 时显示 spinner（首次拉 `/auth/me`）。
- `/admin` → 未登录显示 `LoginPage`，已登录跳 `/admin/dashboard`。
- `/admin/*` → `AdminLayout`，左侧 sidebar + nested `<Routes>`，五个 nav：Dashboard / Users / Channels / Invites / Settings。

### Auth (`auth.ts`)

- `AdminAuthProvider` 把 `session` 与 `checked` 放在 React state——**不写 localStorage / sessionStorage**。真正的凭证就是 HttpOnly 的 `borgee_admin_token` cookie，JS 看不到。
- `login(username, password)` POST 后立刻 `fetchAdminMe()` 拿 session；`logout()` 调 `adminLogout()` 并清 state。
- `fetchAdminMe()` 401 即把 session 清空。

### REST 客户端 (`api.ts`)

- `BASE = '/admin-api/v1'`，所有请求 `credentials: 'include'`，**不手动加 Authorization 头**。
- 错误抛 `AdminApiError(status, message)`。

### Pages

| 文件 | 路由 | 调用的端点 |
|------|------|------------|
| `LoginPage.tsx` | `/admin` | `POST /auth/login` |
| `DashboardPage.tsx` | `/admin/dashboard` | `GET /stats`. 渲染 4 个 stat card (Users/Channels/Online/**Orgs**) + "Organizations (debug)" 表格列出 `by_org[]` 每行 `org_id / user_count / channel_count`. CM-1.4 visibility checkpoint, admin-only, blueprint §1.1 不向终端用户暴露 org_id |
| `UsersPage.tsx` | `/admin/users` | `GET /users`、`PATCH /users/{id}`、`DELETE /users/{id}`、`POST /users`（modal） |
| `UserDetailPage.tsx` | `/admin/users/:id` | `GET /users` 后 `.find()`、`GET /users/{id}/agents` —— 只读 |
| `ChannelsPage.tsx` | `/admin/channels` | `GET /channels`、`DELETE /channels/{id}/force`；UI 镜像 server 守卫，`#general` 与 DM 不显示 force 按钮 |
| `InvitesPage.tsx` | `/admin/invites` | `GET/POST/DELETE /invites` |
| `SettingsPage.tsx` | `/admin/settings` | 不打 API，展示当前 session 信息 + logout 按钮 |

### Admin SPA 缺失/有意为之的能力

- 没有"创建 admin"——admin 永远只能由环境变量决定。
- 用户改密只能 PATCH 改本人的 `password` 字段，没有"发重置链接"流程。
- `UserDetailPage` 是只读视图，所有修改都从 `UsersPage` 发起。
- 没有 admin-only WebSocket 通道；admin SPA 不订阅 `/ws`。

## 4. 与产品 PRD 的对应

PRD 把 admin 定义为 `permissions = ["*"]` 的"超级 user"，admin 既能管理别人也能聊天、有自己的 agent。代码里这件事有两层实现：

- **作为 admin 的"管理面"**：`/admin-api/v1/*` + `borgee_admin_token`，没有 user id，纯环境变量身份；用来给运维做操作。
- **作为"role=admin 的 user"**：在普通登录里，`role=admin` 的人 `permissions` 系统返回合成的 `["*"]`，并享受 `/api/v1/admin/*` 这条 backdoor 路由。

这两条不冲突，但**是两种鉴权域**——审计、限流、登录体验都各走各的，理解时要分清。

## 5. 风险与注意

- `ADMIN_PASSWORD` 是明文环境变量比较。建议外面套 KMS / Sealed Secret，并定期轮换。
- 字符串 `!=` 的 timing 风险实际上很小（密码长度短、暴露面小），但有意识比没有强。
- 普通用户表里若有 `role=admin` 行，且其密码被攻破，就同时拿到 `/api/v1/admin/*` 全部权限——admin role 在 user 表是高权限种子，要谨慎授予。
- `ForceDeleteChannel` 不可撤回；admin 误操作没有 undo。
