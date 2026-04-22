# COL-B24: 集成测试覆盖 — 技术设计

日期：2026-04-22 | 状态：Draft

## 1. 概述

为所有非 UI 业务逻辑构建集成测试，覆盖完整业务流程（不只是单 API）。覆盖率目标 85%+。

## 2. 测试架构

### 2.1 框架

- Vitest（已有）
- Fastify inject（已有）
- `ws` 包做 WS 客户端测试（已有依赖）

### 2.2 目录结构

```
packages/server/src/__tests__/
├── integration/                    # 集成测试（跨 API 业务流程）
│   ├── auth-flow.test.ts           # 场景 1
│   ├── channel-lifecycle.test.ts   # 场景 2
│   ├── permission-flow.test.ts     # 场景 3
│   ├── message-system.test.ts      # 场景 4
│   ├── mention-filter.test.ts      # 场景 5
│   ├── slash-commands.test.ts      # 场景 6
│   ├── workspace-flow.test.ts      # 场景 7
│   ├── plugin-ws.test.ts           # 场景 8
│   └── remote-explorer.test.ts     # 场景 9
├── core.test.ts                    # 现有单测（保留）
├── auth.test.ts                    # 现有 API 测试（保留）
├── ...

packages/plugin/src/__tests__/      # Plugin 单元测试（场景 10）
├── outbound.test.ts
├── ws-client.test.ts
├── file-access.test.ts
└── accounts.test.ts
```

### 2.3 测试基础设施

复用现有 `buildTestApp()` + in-memory SQLite。每个集成测试文件独立 DB。

多用户模拟：

```typescript
async function setupMultiUser(app) {
  // admin 注册
  const admin = await registerUser(app, { role: 'admin' });
  // member 注册
  const member = await registerUser(app, { role: 'member' });
  // agent 注册（通过 admin API）
  const agent = await createAgent(app, admin.token, { name: 'test-bot' });
  return { admin, member, agent };
}
```

## 3. 场景详细设计

### 场景 1: 认证流程 (auth-flow)
1. 注册 admin → 获取 JWT
2. 生成邀请码 → 注册 member
3. 创建 agent → 获取 API key
4. 用 JWT 调 API → 200
5. 用 API key 调 API → 200
6. 无效 token → 401
7. 过期/篡改 JWT → 401
8. 邀请码并发消费 → 只有一个成功

### 场景 2: 频道生命周期 (channel-lifecycle)
1. Admin 创建频道（公开 + 私有）
2. 添加 member 到频道
3. Member 发消息 → 消息出现在频道
4. Member 编辑自己的消息
5. Member 删除自己的消息
6. Member 不能删别人的消息 → 403
7. Admin 可以删任何消息
8. Admin 软删频道 → 频道不可见
9. 频道软删后消息不可访问

### 场景 3: 权限 (permission-flow)
1. Admin 全权限
2. Member 无 admin 权限 → 403
3. 非成员不能访问私有频道 → 404
4. 公开频道预览（非成员可见但受限）
5. Agent 只能操作自己的消息

### 场景 4: 消息系统 (message-system)
1. 发消息 + 验证入库
2. 编辑消息 + 验证更新
3. 删除消息 + 验证软删（content masking）
4. Reaction 添加/删除/幂等/20 种限制
5. 分页加载（limit + before + hasMore）
6. 消息附件自动存入 workspace

### 场景 5: requireMention 过滤 (mention-filter)
1. requireMention=true 时，非 @ 消息被过滤
2. requireMention=true 时，@ 消息通过
3. DM 消息不受 requireMention 影响
4. **三条路径都测**：SSE dispatchSSEEvent / WS onEvent / Poll 事件处理

### 场景 6: Slash Commands (slash-commands)
1. /topic 更新频道 topic
2. 权限校验

### 场景 7: Workspace (workspace-flow)
1. 上传文件 → 列表 → 下载
2. 创建文件夹 → 嵌套
3. 移动文件到文件夹
4. 重命名 + 冲突处理（自动后缀）
5. 删除（含递归删文件夹）
6. 10MB 限制
7. 权限隔离（A 不能访问 B 的文件）

### 场景 8: Plugin WS 通信 (plugin-ws)
1. WS 连接 + API key 认证
2. 无效 key → close 4001
3. 事件推送（新消息 → WS 客户端收到）
4. Server → Plugin request + response
5. Plugin apiCall（发消息/reaction）
6. 连接断开 → pending requests reject

### 场景 9: Remote Explorer (remote-explorer)
1. 创建 node → 生成 token
2. Remote agent WS 连接 + token 认证
3. 绑定目录到 channel
4. ls / read / stat 代理请求
5. Owner only 权限校验
6. Node 离线 → 404

### 场景 10: Plugin 单元测试
- outbound: HTTP fallback 当 WS 不可用
- ws-client: 重连逻辑、apiCall 超时
- file-access: 白名单、大文件拒绝
- accounts: 配置解析、默认值

## 4. CI 集成

- `vitest.config.ts` 的 include 加 `integration/` 目录
- 覆盖率阈值 80% → 85%
- 测试超时加大（集成测试可能慢）：`testTimeout: 30000`

## 5. Task Breakdown

### T1: 测试基础设施升级
- `setupMultiUser` helper
- integration/ 目录
- vitest 配置更新

### T2: 认证 + 权限集成测试 (场景 1+3)
### T3: 频道 + 消息集成测试 (场景 2+4)
### T4: requireMention 三路径测试 (场景 5)
### T5: Workspace 集成测试 (场景 7)
### T6: Plugin WS + Remote Explorer 集成测试 (场景 8+9)
### T7: Slash Commands + Plugin 单元测试 (场景 6+10)
### T8: 覆盖率调优到 85%+

## 6. 验收标准

- [ ] 10 个场景全部有对应测试文件
- [ ] 所有测试通过
- [ ] 覆盖率 ≥ 85%
- [ ] CI 通过
