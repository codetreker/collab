# Borgee 技术设计文档

> Source of truth：本目录文档由 source code 直接梳理而来，遇到代码与文档冲突时以**代码为准**。
> 最近一次同步：2026-04-27（基于 main @ a0b0f51）

Borgee 是一个 Human-Agent 协作平台（前身代号 Collab），从第一天就把 AI agent 当作一等公民。产品愿景见 [`../product-direction.md`](../product-direction.md) 和 [`../PRD-v3.md`](../PRD-v3.md)。

## 仓库结构

```
packages/
├── server-go/          # Go 后端：Fastify-style HTTP + WS + SSE + SQLite
├── client/             # React 18 SPA（用户端 + admin 端，双 Vite 入口）
├── remote-agent/       # 独立 Node 守护进程，对外暴露受限的本地文件系统
└── plugins/openclaw/   # OpenClaw Channel Plugin，让 OpenClaw agent 接入 Borgee
```

## 文档导航

按模块分目录，每个模块的入口是该目录下的 `README.md`：

| 模块 | 内容 |
|------|------|
| [`concept-model.md`](concept-model.md) | **核心概念模型：组织、人、agent**（**最先读这里**） |
| [`channel-model.md`](channel-model.md) | **Channel / DM / Workspace 形状层规范** |
| [`canvas-vision.md`](canvas-vision.md) | **画布 / 文档协作愿景：workspace = artifact 集合** |
| [`agent-lifecycle.md`](agent-lifecycle.md) | **Agent 接入与生命周期 — Borgee 是协作平台不是 agent 平台** |
| [`plugin-protocol.md`](plugin-protocol.md) | **BPP（Borgee Plugin Protocol）—— runtime 接入的中立协议** |
| [`host-bridge.md`](host-bridge.md) | **Borgee Helper：用户机器上的特权进程（信任五支柱）** |
| [`realtime.md`](realtime.md) | **推送 / 状态 / 回放：v1 让用户感到 AI 在工作的最小集** |
| [`auth-permissions.md`](auth-permissions.md) | **权限模型：ABAC 存储 + UI bundle，跨 org 只减不加** |
| [`admin-model.md`](admin-model.md) | **Admin 与隐私契约：元数据可管，内容不可读** |
| [`overview.md`](overview.md) | 系统全景图 + 跨进程消息流 + 关键术语 |
| [`agents.md`](agents.md) | Agent 在系统中的身份模型、API key、接入路径选择 |
| [`server/`](server/README.md) | `server-go`：路由、auth、realtime |
| [`server/data-model.md`](server/data-model.md) | SQLite 表结构、迁移策略、事件日志、LexoRank |
| [`client/`](client/README.md) | React SPA：状态模型、WS 协议、slash command |
| [`client/ui/`](client/ui/README.md) | 用户端线框图：登录 / 主界面 / 消息 / DM / 命令 等 |
| [`admin/`](admin/README.md) | 管理面：双前缀路由、独立 cookie、admin SPA |
| [`admin/ui/`](admin/ui/README.md) | Admin 管理后台线框图 |
| [`plugin/`](plugin/README.md) | OpenClaw plugin：传输自适应、多账号、消息分发 |
| [`remote-agent/`](remote-agent/README.md) | `remote-agent` daemon：协议、沙箱、与 server 的对偶 |
| [`remote-agent/ui/`](remote-agent/ui/README.md) | Remote Explorer 线框图 |

## 进程拓扑（运行时）

```
┌────────────────┐  WS / REST   ┌───────────────────────────────┐
│  Browser SPA   │◀────────────▶│                               │
│  (client)      │              │       server-go               │
└────────────────┘              │  ┌──────────┬──────────────┐  │
                                │  │ HTTP API │ /ws (clients)│  │
┌─────────────────┐  WS         │  │          │ /ws/plugin   │  │
│ OpenClaw plugin │◀────────────│  │  SQLite  │ /ws/remote   │  │
│  (per agent)    │  SSE / poll │  │  events  │ SSE /stream  │  │
└─────────────────┘             │  └──────────┴──────────────┘  │
                                └───────────────────────────────┘
┌─────────────────┐  WS /ws/remote
│  remote-agent   │◀──── token ──────┘
│  (filesystem)   │
└─────────────────┘
```

详细的写路径扇出与 cursor/事件日志机制见 [`overview.md`](overview.md)。
