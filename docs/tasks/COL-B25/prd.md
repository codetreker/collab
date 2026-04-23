# COL-B25: 复杂场景集成测试 — PRD

日期：2026-04-23 | 状态：Ready

## 背景

B24 集成测试 PR 被打回——大部分测试 mock 了 WS broadcast，本质是换了个目录的单测，不算真正的集成测试。建军要求：集成测试必须用真实 server + 真实 WS 连接，零 mock 内部依赖。

同时讨论发现 B24 缺少跨模块、多用户、多连接的复杂交互场景。本任务补齐这些场景。

## 原则

- **真实 server**：`buildFullApp()` + `server.listen({ port: 0 })`
- **真实 WS**：`ws` 包连接真实 WS endpoint
- **零 mock**：不 mock `ws.js`、不 mock `db.js`（用真实 in-memory SQLite）
- **与现有单测不重复**：单 API happy/error path 由单测覆盖，集成测试只测跨模块交互

## 场景（按优先级排序）

### P0 — 核心链路

#### 1. 完整聊天 + WS 推送
Admin 创建频道 → 邀请 Member → Member 发消息 → Admin WS 收到 new_message → Member 编辑 → Admin WS 收到 edit 事件 → Member 删除 → Admin WS 收到 delete 事件 → Member 发 reaction → Admin WS 收到 reaction 事件

#### 2. Agent-Human 完整往返
创建 Agent + API Key → Agent 通过 Plugin WS 连接 → 人发 @agent 消息 → Plugin WS 收到 message + mention 事件 → Agent 通过 apiCall 回复 → 人的 WS 收到 Agent 回复 → 人发不含 @ 的消息 → Agent 仍收到 message 但无 mention 事件（requireMention 过滤验证）

#### 3. 权限动态变化 + WS 隔离
创建私有频道 → 非成员 HTTP 访问被拒 → 非成员 WS 连接不收到该频道事件 → Admin 邀请非成员 → 该成员开始收到 WS 事件 → Admin 踢出 → 该成员不再收到

### P1 — 重要

#### 4. Remote Explorer 端到端
创建 Node + token → Remote Agent WS 连接 → 绑定目录到频道 → 通过 API 列目录 → 读文件内容 → Agent 断开 → 读文件返回 503

#### 5. Workspace + 消息联动
发带附件消息 → 附件自动存入 Workspace → Workspace 列表可见 → 下载内容一致 → 其他用户看不到（多用户隔离）

#### 6. 分页 + 实时消息共存
发 150 条消息 → 初始加载返回 100 条 + hasMore=true → before cursor 加载剩余 → 新消息通过 WS 实时到达 → 分页和实时互不干扰

### P2 — 边界

#### 7. 频道删除级联
删频道 → WS 通知所有成员 → 成员列表清理

#### 8. 成员变更系统消息
加入频道 → 系统消息推送 → 离开 → 系统消息推送

## 与 B24 的关系

- B24 PR #95 需要先重构为真实 server 模式（去掉 WS mock，删除与单测重复的 case）
- B25 在 B24 重构完成后开始，复用 B24 的 TestContext 和 WS helper 基础设施
- B25 的场景是 B24 的补充，不是替代

## 验收标准

- [ ] 所有测试用真实 server + 真实 WS，零 mock 内部依赖
- [ ] P0 三个场景全部通过
- [ ] P1 三个场景全部通过
- [ ] 不与现有单测重复
- [ ] CI 通过
