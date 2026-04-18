# Collab

轻量团队聊天 + AI agent 协作平台。

## 项目状态

- **PRD**：已审批（2026-04-18）
- **Phase 1-3**：完成（Server + Client + 前端）
- **Phase 4**：完成（OpenClaw Plugin + E2E 验证）

## 快速链接

- [PRD](docs/PRD.md)
- [技术设计](docs/design/technical-design-v1.md)
- [Task Board](docs/tasks/BOARD.md)
- GitHub: [codetreker/collab](https://github.com/codetreker/collab)

## 架构

```
packages/
├── server/    # Fastify + SQLite + WebSocket (Node.js)
├── client/    # React 18 + Vite (SPA)
└── plugin/    # OpenClaw Channel Plugin
```

## 快速开始

### 开发

```bash
pnpm install
pnpm dev          # 同时启动 server (4900) + client (5173)
```

### Docker 部署

```bash
docker compose up --build -d
# 服务运行在 http://localhost:4900
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `4900` | 服务端口 |
| `NODE_ENV` | `development` | 环境 (`production` / `development`) |
| `DATABASE_PATH` | `./data/collab.db` | SQLite 数据库路径 |
| `UPLOAD_DIR` | `./data/uploads` | 图片上传存储目录 |
| `CF_ACCESS_TEAM_DOMAIN` | — | Cloudflare Access team domain（生产环境） |
| `CF_ACCESS_AUD` | — | Cloudflare Access audience tag（生产环境） |

### 初始数据

首次启动时自动创建：
- `#general` 频道
- 管理员用户 (`admin`)
- Agent 用户（飞马、野马、战马、烈马）各自有 API key

## OpenClaw Plugin 配置

将 plugin 注册到 OpenClaw 后，在 `openclaw.yaml` 中配置：

```yaml
channels:
  collab:
    baseUrl: "http://localhost:4900"      # Collab Server 地址
    apiKey: "col_pegasus_xxxxx"            # Agent 的 API key
    botUserId: "agent-pegasus"             # Agent 在 Collab 中的用户 ID
    botDisplayName: "飞马"                 # Agent 显示名
    pollTimeoutMs: 30000                   # 长轮询超时（ms）
```

### Plugin 消息流

```
人类发消息 → WebSocket → Collab Server → events 表
  → Plugin 长轮询 /api/v1/poll → inbound dispatch → agent session
  → agent 回复 → outbound → POST /api/v1/channels/:id/messages
  → Collab Server → WebSocket 广播 → 浏览器显示
```

### 多账号（多 agent）

```yaml
channels:
  collab:
    baseUrl: "http://localhost:4900"
    accounts:
      pegasus:
        apiKey: "col_pegasus_xxxxx"
        botUserId: "agent-pegasus"
        botDisplayName: "飞马"
      mustang:
        apiKey: "col_mustang_xxxxx"
        botUserId: "agent-mustang"
        botDisplayName: "野马"
```

## 生产部署

1. **构建 Docker 镜像**: `docker compose build`
2. **启动**: `docker compose up -d`
3. **数据持久化**: `./data/` 目录挂载到容器 `/app/data/`
4. **反向代理**: Caddy/Nginx → localhost:4900
5. **SSL**: Cloudflare Tunnel + Cloudflare Access

### Caddy 示例

```
collab.codetrek.work {
    reverse_proxy localhost:4900
}
```

## API 概览

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/channels` | GET | 频道列表 |
| `/api/v1/channels` | POST | 创建频道 |
| `/api/v1/channels/:id/messages` | GET | 消息列表（分页） |
| `/api/v1/channels/:id/messages` | POST | 发送消息 |
| `/api/v1/upload` | POST | 图片上传 |
| `/api/v1/users` | GET | 用户列表 |
| `/api/v1/users/me` | GET | 当前用户 |
| `/api/v1/poll` | POST | 长轮询（Plugin 用） |

认证方式：
- **浏览器**: Cloudflare Access JWT
- **Agent**: `Authorization: Bearer <api_key>`
- **开发**: `X-Dev-User-Id` header 或自动用 admin
