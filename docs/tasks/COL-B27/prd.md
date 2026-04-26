# COL-B27 Admin 控制面板拆分 — PRD

日期：2026-04-26 | 状态：Draft

## 背景

- 当前 `/api/v1/users` 接口无 admin 权限校验，任何已登录用户（包括 member）都能获取全部用户列表，包含 admin 信息——这是 **P0 安全漏洞**
- Admin 管理接口（`/api/v1/admin/*`）虽然有 admin role 校验，但和普通用户接口混在同一个 `/api/v1/` 路径下，没有从路由层面做隔离
- 前端 Admin 管理后台（用户管理、频道管理、设置）和用户聊天页面混在同一个 SPA 中，没有独立入口
- `@mention` picker 和 DM sidebar 依赖 `/api/v1/users` 获取全部用户列表，权限修复后需要适配

## 目标用户

- **Admin**（workspace 管理员）：管理用户、频道、邀请码、权限，有全量数据视图
- **Member**（普通成员）：只能看到和自己相关的数据（同频道成员、可 DM 的人），不应接触任何 admin 能力

## 核心需求

### 需求 1: API 权限拆分

- 所有 admin 专属接口从 `/api/v1/admin/*` 迁移到 `/admin-api/v1/*`
- `/admin-api/v1/` 路径统一加 admin role 中间件校验，非 admin 一律返回 403
- `/api/v1/users`（全量用户列表）移除或仅限 admin 可用——普通 member 不应有任何途径获取全量用户列表
- 梳理所有现有接口，明确 admin vs member 分类（见下方接口分类表）

### 需求 2: 前端 Admin 后台独立

- Admin 管理后台（用户管理、频道管理、邀请码管理、设置）与用户聊天页面分开，有独立入口
- 非 admin 用户看不到 Admin 后台入口
- Admin Create User 表单禁止创建 agent 类型用户（agent 由用户自己创建，关联 COL-BUG-022）
- Admin User 列表不显示 agent（agent 有独立管理页面）

### 需求 3: 前端 @mention / DM 适配

- `@mention` picker 改用频道 members API（`GET /api/v1/channels/{channelId}/members`），不再依赖 `/api/v1/users`
- DM sidebar 改用 DM 列表 API（`GET /api/v1/dm`）或频道 members 数据，不再依赖全量用户列表
- DM 创建（`POST /api/v1/dm/{userId}`）保持不变，用户 ID 可从频道成员列表或 DM 列表中获得

---

## 接口分类表（核心产出）

### Auth 接口（公开，无需登录）

| 当前路径 | 方法 | 说明 | 目标分类 | 变更 |
|---------|------|------|---------|------|
| `/api/v1/auth/login` | POST | 用户登录 | 公开 | 不变 |
| `/api/v1/auth/register` | POST | 用户注册（需邀请码） | 公开 | 不变 |
| `/api/v1/auth/logout` | POST | 用户登出 | 公开 | 不变 |

### Member 接口（登录用户可用）

| 当前路径 | 方法 | 说明 | 目标分类 | 变更 |
|---------|------|------|---------|------|
| `/api/v1/users/me` | GET | 获取当前用户信息 | Member | 不变 |
| `/api/v1/me/permissions` | GET | 获取当前用户权限 | Member | 不变 |
| `/api/v1/online` | GET | 获取在线用户 ID 列表 | Member | 不变 |
| `/api/v1/channels` | GET | 获取用户可见的频道列表 | Member | 不变 |
| `/api/v1/channels/{channelId}` | GET | 获取单个频道详情 | Member | 不变 |
| `/api/v1/channels/{channelId}/preview` | GET | 频道预览（公开频道） | Member | 不变 |
| `/api/v1/channels` | POST | 创建频道 | Member | 不变（需 channel.create 权限） |
| `/api/v1/channels/{channelId}` | PUT | 更新频道 | Member | 不变（需权限） |
| `/api/v1/channels/{channelId}/topic` | PUT | 设置频道 topic | Member | 不变（需频道成员） |
| `/api/v1/channels/{channelId}/join` | POST | 加入频道 | Member | 不变 |
| `/api/v1/channels/{channelId}/leave` | POST | 离开频道 | Member | 不变 |
| `/api/v1/channels/{channelId}/members` | POST | 添加频道成员 | Member | 不变（需权限） |
| `/api/v1/channels/{channelId}/members/{userId}` | DELETE | 移除频道成员 | Member | 不变（需权限） |
| `/api/v1/channels/{channelId}/members` | GET | 获取频道成员列表 | Member | 不变 |
| `/api/v1/channels/{channelId}/read` | PUT | 标记频道已读 | Member | 不变 |
| `/api/v1/channels/{channelId}` | DELETE | 删除频道 | Member | 不变（需 channel.delete 权限） |
| `/api/v1/channels/reorder` | PUT | 频道排序 | Member | 不变（需权限） |
| `/api/v1/channel-groups` | GET | 获取频道分组 | Member | 不变 |
| `/api/v1/channel-groups` | POST | 创建频道分组 | Member | 不变 |
| `/api/v1/channel-groups/{groupId}` | PUT | 更新频道分组 | Member | 不变 |
| `/api/v1/channel-groups/{groupId}` | DELETE | 删除频道分组 | Member | 不变 |
| `/api/v1/channel-groups/reorder` | PUT | 频道分组排序 | Member | 不变 |
| `/api/v1/channels/{channelId}/messages` | GET | 获取频道消息 | Member | 不变 |
| `/api/v1/channels/{channelId}/messages/search` | GET | 搜索频道消息 | Member | 不变 |
| `/api/v1/channels/{channelId}/messages` | POST | 发送消息 | Member | 不变（需 message.send 权限） |
| `/api/v1/messages/{messageId}` | PUT | 编辑消息 | Member | 不变（仅自己的消息） |
| `/api/v1/messages/{messageId}` | DELETE | 删除消息 | Member | 不变（自己或 admin） |
| `/api/v1/messages/{messageId}/reactions` | PUT | 添加 reaction | Member | 不变 |
| `/api/v1/messages/{messageId}/reactions` | DELETE | 移除 reaction | Member | 不变 |
| `/api/v1/messages/{messageId}/reactions` | GET | 获取 reactions | Member | 不变 |
| `/api/v1/dm/{userId}` | POST | 创建 DM | Member | 不变 |
| `/api/v1/dm` | GET | 获取 DM 列表 | Member | 不变 |
| `/api/v1/agents` | POST | 创建 Agent | Member | 不变（owner 自己创建） |
| `/api/v1/agents` | GET | 获取我的 Agent 列表 | Member | 不变（admin 看全部，member 看自己的） |
| `/api/v1/agents/{id}` | GET | 获取 Agent 详情 | Member | 不变（owner 或 admin） |
| `/api/v1/agents/{id}` | DELETE | 删除 Agent | Member | 不变（owner 或 admin） |
| `/api/v1/agents/{id}/rotate-api-key` | POST | 轮换 Agent API Key | Member | 不变（owner 或 admin） |
| `/api/v1/agents/{id}/permissions` | GET | 获取 Agent 权限 | Member | 不变（owner 或 admin） |
| `/api/v1/agents/{id}/permissions` | PUT | 设置 Agent 权限 | Member | 不变（owner 或 admin） |
| `/api/v1/agents/{id}/files` | GET | 获取 Agent 文件 | Member | 不变（owner 或 admin） |
| `/api/v1/upload` | POST | 上传图片 | Member | 不变 |
| `/api/v1/commands` | GET | 获取可用命令 | Member | 不变 |
| `/api/v1/channels/{channelId}/workspace` | GET | 获取频道 workspace 文件 | Member | 不变 |
| `/api/v1/channels/{channelId}/workspace/upload` | POST | 上传 workspace 文件 | Member | 不变 |
| `/api/v1/channels/{channelId}/workspace/files/{id}` | GET | 下载 workspace 文件 | Member | 不变 |
| `/api/v1/channels/{channelId}/workspace/files/{id}` | PUT | 更新 workspace 文件 | Member | 不变 |
| `/api/v1/channels/{channelId}/workspace/files/{id}` | PATCH | 重命名 workspace 文件 | Member | 不变 |
| `/api/v1/channels/{channelId}/workspace/files/{id}` | DELETE | 删除 workspace 文件 | Member | 不变 |
| `/api/v1/channels/{channelId}/workspace/mkdir` | POST | 创建 workspace 目录 | Member | 不变 |
| `/api/v1/channels/{channelId}/workspace/files/{id}/move` | POST | 移动 workspace 文件 | Member | 不变 |
| `/api/v1/workspaces` | GET | 获取全部 workspace 文件 | Member | 不变 |
| `/api/v1/remote/nodes` | GET | 获取 Remote Nodes | Member | 不变 |
| `/api/v1/remote/nodes` | POST | 创建 Remote Node | Member | 不变 |
| `/api/v1/remote/nodes/{id}` | DELETE | 删除 Remote Node | Member | 不变 |
| `/api/v1/remote/nodes/{nodeId}/bindings` | GET | 获取 Node Bindings | Member | 不变 |
| `/api/v1/remote/nodes/{nodeId}/bindings` | POST | 创建 Node Binding | Member | 不变 |
| `/api/v1/remote/nodes/{nodeId}/bindings/{id}` | DELETE | 删除 Node Binding | Member | 不变 |
| `/api/v1/channels/{channelId}/remote-bindings` | GET | 获取频道 Remote Bindings | Member | 不变 |
| `/api/v1/remote/nodes/{nodeId}/status` | GET | 获取 Node 在线状态 | Member | 不变 |
| `/api/v1/remote/nodes/{nodeId}/ls` | GET | Remote Node 目录列表 | Member | 不变 |
| `/api/v1/remote/nodes/{nodeId}/read` | GET | Remote Node 读文件 | Member | 不变 |
| `/api/v1/poll` | POST | 长轮询事件 | Member | 不变 |
| `/api/v1/stream` | HEAD | SSE 流 HEAD 检查 | Member | 不变 |
| `/api/v1/stream` | GET | SSE 事件流 | Member | 不变 |

### Admin 接口（迁移到 `/admin-api/v1/`）

| 当前路径 | 方法 | 说明 | 目标路径 | 变更 |
|---------|------|------|---------|------|
| `/api/v1/admin/users` | GET | 管理员列出所有用户（含详细信息） | `/admin-api/v1/users` | **迁移** |
| `/api/v1/admin/users` | POST | 管理员创建用户 | `/admin-api/v1/users` | **迁移** |
| `/api/v1/admin/users/{id}` | PATCH | 管理员编辑用户 | `/admin-api/v1/users/{id}` | **迁移** |
| `/api/v1/admin/users/{id}` | DELETE | 管理员删除用户 | `/admin-api/v1/users/{id}` | **迁移** |
| `/api/v1/admin/users/{id}/api-key` | POST | 管理员为用户生成 API Key | `/admin-api/v1/users/{id}/api-key` | **迁移** |
| `/api/v1/admin/users/{id}/api-key` | DELETE | 管理员删除用户 API Key | `/admin-api/v1/users/{id}/api-key` | **迁移** |
| `/api/v1/admin/users/{id}/permissions` | GET | 管理员查看用户权限 | `/admin-api/v1/users/{id}/permissions` | **迁移** |
| `/api/v1/admin/users/{id}/permissions` | POST | 管理员授权 | `/admin-api/v1/users/{id}/permissions` | **迁移** |
| `/api/v1/admin/users/{id}/permissions` | DELETE | 管理员撤销权限 | `/admin-api/v1/users/{id}/permissions` | **迁移** |
| `/api/v1/admin/invites` | POST | 管理员创建邀请码 | `/admin-api/v1/invites` | **迁移** |
| `/api/v1/admin/invites` | GET | 管理员列出邀请码 | `/admin-api/v1/invites` | **迁移** |
| `/api/v1/admin/invites/{code}` | DELETE | 管理员删除邀请码 | `/admin-api/v1/invites/{code}` | **迁移** |
| `/api/v1/admin/channels` | GET | 管理员列出所有频道 | `/admin-api/v1/channels` | **迁移** |
| `/api/v1/admin/channels/{id}/force` | DELETE | 管理员强制删除频道 | `/admin-api/v1/channels/{id}/force` | **迁移** |

### 需要处理的问题接口

| 当前路径 | 方法 | 说明 | 问题 | 处理 |
|---------|------|------|------|------|
| `/api/v1/users` | GET | 获取全量用户列表 | member 可获取全部用户（含 admin），P0 安全漏洞 | **移除或迁移到 `/admin-api/v1/users`**，前端 @mention/DM 改用频道 members API |

### WebSocket 接口（不在本次范围内）

| 路径 | 说明 | 变更 |
|------|------|------|
| `/ws` | 客户端 WebSocket | 不变 |
| `/ws/plugin` | Plugin WebSocket | 不变 |
| `/ws/remote` | Remote Node WebSocket | 不变 |

### 静态资源（不在本次范围内）

| 路径 | 说明 | 变更 |
|------|------|------|
| `/uploads/*` | 上传文件静态服务 | 不变 |
| `/health` | 健康检查 | 不变 |
| `/*` | SPA 静态文件 | 不变 |

---

## 不在 v1 范围

- WebSocket 连接的权限拆分（当前 WS 连接基于认证 token，不区分 admin/member）
- 细粒度 RBAC 权限模型重构（当前只有 admin/member/agent 三种 role）
- Admin 后台作为独立部署的服务（本次仅前端路由分离，仍然是同一个后端）
- Agent 管理接口迁移到 admin-api（Agent 属于用户自己管理，admin 通过 admin 用户管理接口间接管理）
- 审计日志（admin 操作记录）

## 验收标准

- [ ] member 调 `/admin-api/v1/*` 任何接口返回 403
- [ ] `/api/v1/users`（全量用户列表）不存在或仅 admin 可用
- [ ] member 无法通过任何 API 获取全量用户列表
- [ ] `@mention` picker 使用频道 members API，功能正常
- [ ] DM sidebar 使用 DM 列表 API，功能正常
- [ ] Admin 后台入口独立，非 admin 用户看不到入口
- [ ] Admin Create User 不能选择 agent 类型
- [ ] Admin User 列表不显示 agent
- [ ] 所有原有 admin 功能在新路径下正常工作
- [ ] Go server 和 TS server 两套实现保持一致

## 开放问题

1. **`/api/v1/users` 是直接移除还是保留给 admin？** 建议移除——admin 用 `/admin-api/v1/users`，member 用频道 members API，没有中间地带
2. **`/api/v1/online` 是否需要限制？** 当前返回在线用户 ID 列表（不含详细信息），安全风险较低，暂不处理
3. **频道 members 返回的用户信息是否足够支撑 @mention picker？** 需要确认返回字段包含 display_name、avatar_url、role 等
4. **Admin 后台是前端路由分离还是完全独立页面？** 建议前端路由分离（如 `/admin/*`），降低改动成本
5. **老版 TS server 是否需要同步修改？** Go server 重写（COL-R01）进行中，需确认两边是否都需要改
