# Collab Task Board

> **Owner** = 此刻球在谁手上，随状态流转变化。所有任务必须有 Owner，无主任务不允许存在。
> 对应关系：Backlog/Ready/讨论中→Team Lead，In Progress→Dev，In Review→Team Lead，验收→QA，Done→Team Lead。

## Phase 1：基础 + 部署验证（中国连通性确认）

| ID | 任务 | 状态 | Owner | PR |
|----|------|------|-------|----|
| COL-001 | 技术设计文档 | Done | 飞马 | — |
| COL-T01 | 项目脚手架（Fastify + Vite + React + TS） | Done | 战马 | — |
| COL-T02 | 数据库 schema + 基础 CRUD | Done | 战马 | — |
| COL-T02b | 初始 seed 脚本 | Done | 战马 | — |
| COL-T02c | 骨架部署验证（docker-compose + CF Tunnel） | Done | 战马 | — |

> ⚡ Phase 1 是关键门槛：T02c 部署后让建军从中国测 HTTPS + WebSocket 连通性。通过后才全力推进。

## Phase 2：核心 API + WebSocket

| ID | 任务 | 状态 | Owner | PR |
|----|------|------|-------|----|
| COL-T03 | REST API — 频道 | Done | 战马 | — |
| COL-T04 | REST API — 消息 | Done | 战马 | — |
| COL-T04b | 图片上传 API + 前端 | Done | 战马 | — |
| COL-T05 | REST API — 用户 + 认证 | Done | 战马 | — |
| COL-T06 | WebSocket 服务 | Done | 战马 | — |
| COL-T07 | 长轮询 API（Plugin 用） | Done | 战马 | — |

## Phase 3：前端

| ID | 任务 | 状态 | Owner | PR |
|----|------|------|-------|----|
| COL-T08 | 前端 — 频道侧边栏 | Done | 战马 | — |
| COL-T09 | 前端 — 消息列表 | Done | 战马 | — |
| COL-T10 | 前端 — 消息输入 + @mention | Done | 战马 | — |
| COL-T11 | 前端 — WebSocket 集成 | Done | 战马 | — |
| COL-T12 | 前端 — 响应式布局 | Done | 战马 | — |

## Phase 4：Plugin + 部署 + E2E

| ID | 任务 | 状态 | Owner | PR |
|----|------|------|-------|----|
| COL-T13 | OpenClaw Plugin 骨架 | Done | 战马 | — |
| COL-T14 | Plugin — Gateway + Inbound | Done | 战马 | — |
| COL-T15 | Plugin — Outbound | Done | 战马 | — |
| COL-T16 | 正式部署 | Done | 战马 | — |
| COL-T17 | E2E 测试 + 修复 | In Review | 烈马 | — |
