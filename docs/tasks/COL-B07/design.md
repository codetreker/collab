# B07/B08 Slash Commands v2 技术设计

## 背景与问题

Collab 当前有 5 个内置 slash commands（`/help /leave /topic /invite /dm`），全部在前端 `CommandRegistry` 中注册并本地执行。无法扩展：Agent 不能注册自定义命令，也缺少 `/status /clear /nick` 等常用命令。

## 目标

1. Agent 通过 API 注册/管理自定义 slash commands（B07）
2. 用户执行 Agent 命令时通过消息通道发给 Agent 处理
3. 新增 `/status /clear /nick` 内置命令（B08）
4. 前端命令面板实时显示所有命令（内置 + Agent）

### 验收标准

- Agent 能注册/删除/列出命令
- 用户输入 Agent 命令后，Agent 收到 `content_type: 'command'` 消息
- `/status /clear /nick` 正常工作
- 命令列表实时同步（WS 事件）

## 设计决策

| 决策 | 结论 | 理由 |
|------|------|------|
| 传输方式 | 消息通道 | Agent 已有 WS/SSE 连接，无需暴露公网端口 |
| 冲突策略 | 同名覆盖 | 简单，后注册覆盖先注册 |
| 命令上限 | 100/Agent | 够用，防滥用 |

## 方案设计

### 1. DB Schema

```sql
CREATE TABLE agent_commands (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  agent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,           -- 命令名（不含 /）
  description TEXT NOT NULL,    -- 命令描述
  usage TEXT NOT NULL,          -- 用法示例，如 '/deploy <env>'
  param_type TEXT NOT NULL DEFAULT 'none', -- none|text|user|number
  placeholder TEXT,             -- 输入框 placeholder
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(agent_id, name)       -- 同一 Agent 内命令名唯一
);
CREATE INDEX idx_agent_commands_agent ON agent_commands(agent_id);
```

### 2. Server API

#### 注册命令

```
POST /api/v1/agents/:id/commands
Authorization: Bearer <agent-api-key>

Request:
{
  "name": "deploy",
  "description": "部署到指定环境",
  "usage": "/deploy <env>",
  "param_type": "text",
  "placeholder": "staging / prod"
}

Response 201:
{
  "command": {
    "id": "a1b2c3",
    "agent_id": "agent-pegasus",
    "name": "deploy",
    "description": "部署到指定环境",
    "usage": "/deploy <env>",
    "param_type": "text",
    "placeholder": "staging / prod",
    "created_at": 1714000000,
    "updated_at": 1714000000
  }
}

Error 409 (同名覆盖时不报错，直接 upsert)
Error 400: { "error": "Command limit exceeded (100)" }
```

#### 列出 Agent 命令

```
GET /api/v1/agents/:id/commands

Response 200:
{
  "commands": [
    { "id": "a1b2c3", "name": "deploy", "description": "...", ... }
  ]
}
```

#### 删除命令

```
DELETE /api/v1/agents/:id/commands/:name

Response 204 (no content)
Error 404: { "error": "Command not found" }
```

#### 列出所有命令（前端用）

```
GET /api/v1/commands

Response 200:
{
  "builtin": [
    { "name": "help", "description": "显示所有可用命令", "usage": "/help", "param_type": "none" },
    { "name": "leave", "description": "离开当前频道", ... },
    { "name": "topic", ... },
    { "name": "invite", ... },
    { "name": "dm", ... },
    { "name": "status", ... },
    { "name": "clear", ... },
    { "name": "nick", ... }
  ],
  "agent": [
    {
      "agent_id": "agent-pegasus",
      "agent_name": "Pegasus",
      "commands": [
        { "name": "deploy", "description": "部署到指定环境", "usage": "/deploy <env>", "param_type": "text" }
      ]
    },
    {
      "agent_id": "agent-warhorse",
      "agent_name": "Warhorse",
      "commands": [
        { "name": "deploy", "description": "部署前端", "usage": "/deploy <branch>", "param_type": "text" }
      ]
    }
  ]
}
```

### 3. 命令执行流程

#### 同名命令解析策略

不同 Agent 可以注册同名命令。前端按 Agent 分组显示：

```
── 内置 ──
/help    显示所有可用命令
/status  显示频道状态
...
── Pegasus ──
/deploy  部署到指定环境
/search  搜索代码
── Warhorse ──
/deploy  部署前端
```

- **唯一命令**：直接输入 `/search args` 回车即执行，不弹选择
- **同名命令**：命令面板显示所有匹配，用户点选确定哪个 Agent
- **内置优先**：内置命令始终优先于 Agent 命令

```
用户输入 "/deploy staging"
    │
    ▼
前端 CommandRegistry.resolve("deploy")
    │
    ├─ 内置命令 → 本地执行（/help /leave /topic /invite /dm /status /clear /nick）
    │
    ├─ 唯一 Agent 命令 → 直接执行
    │
    ├─ 多个 Agent 同名 → 弹面板让用户选择 Agent
    │
    └─ 选定 Agent 后 → POST /api/v1/channels/:channelId/messages
        {
          "content": "{\"command\":\"deploy\",\"args\":\"staging\",\"invoker_id\":\"user-123\"}",
          "content_type": "command",
          "mentions": ["agent-pegasus"]
        }
        │
        ▼
    Server 广播消息（WS/SSE/poll）
        │
        ▼
    Agent 收到 content_type=command 消息
    Agent 解析 JSON，执行逻辑
    Agent 回复普通文本消息（content_type: text）
```

### 4. 前端扩展

#### CommandRegistry 改造

```typescript
// registry.ts 新增
interface RemoteCommand {
  name: string;
  description: string;
  usage: string;
  paramType: 'none' | 'text' | 'user' | 'number';
  placeholder?: string;
  agentId: string;
  agentName: string;
}

class CommandRegistry {
  private builtins: Map<string, CommandDefinition> = new Map();
  private remoteCommands: Map<string, RemoteCommand> = new Map();

  registerBuiltin(cmd: CommandDefinition): void { ... }
  
  setRemoteCommands(commands: RemoteCommand[]): void {
    this.remoteCommands.clear();
    for (const cmd of commands) {
      this.remoteCommands.set(cmd.name, cmd);
    }
  }

  resolve(name: string): 
    | { type: 'builtin', cmd: CommandDefinition } 
    | { type: 'remote', cmd: RemoteCommand }   // 唯一匹配
    | { type: 'ambiguous', cmds: RemoteCommand[] } // 多个 Agent 同名
    | null {
    const builtin = this.builtins.get(name);
    if (builtin) return { type: 'builtin', cmd: builtin };
    const matches = this.remoteByName.get(name) ?? [];
    if (matches.length === 1) return { type: 'remote', cmd: matches[0] };
    if (matches.length > 1) return { type: 'ambiguous', cmds: matches };
    return null;
  }

  search(prefix: string): Array<{ group: string; items: (CommandDefinition | RemoteCommand)[] }> {
    // 按组返回：内置组 + 每个 Agent 一组
  }
}
```

#### 启动加载 + WS 实时同步

```typescript
// App 启动时
const { builtin, agent } = await api.listCommands();
const remoteCommands = agent.flatMap(a => 
  a.commands.map(c => ({ ...c, agentId: a.agent_id, agentName: a.agent_name }))
);
commandRegistry.setRemoteCommands(remoteCommands);

// WS 事件监听
ws.on('command_registered', (data) => { /* 刷新命令列表 */ });
ws.on('command_deleted', (data) => { /* 刷新命令列表 */ });
```

### 5. WS 事件

命令注册/删除时，server 通过 WS 广播事件，前端实时更新命令列表：

```json
{ "type": "command_registered", "agent_id": "agent-pegasus", "command": { "name": "deploy", ... } }
{ "type": "command_deleted", "agent_id": "agent-pegasus", "command_name": "deploy" }
```

### 6. B08 内置命令

#### /status

```typescript
commandRegistry.registerBuiltin({
  name: 'status',
  description: '显示频道状态',
  usage: '/status',
  paramType: 'none',
  execute: async ({ channelId, api, dispatch }) => {
    const channel = await api.getChannel(channelId);
    const members = await api.getChannelMembers(channelId);
    const online = members.filter(m => m.online).length;
    dispatch({
      type: 'INSERT_LOCAL_SYSTEM_MESSAGE',
      payload: {
        channelId,
        text: `**${channel.name}**\n主题: ${channel.topic || '无'}\n成员: ${members.length}\n在线: ${online}`,
      },
    });
  },
});
```

#### /clear

```typescript
commandRegistry.registerBuiltin({
  name: 'clear',
  description: '清除本地聊天记录',
  usage: '/clear',
  paramType: 'none',
  execute: async ({ channelId, dispatch }) => {
    dispatch({ type: 'CLEAR_LOCAL_MESSAGES', payload: { channelId } });
  },
});
```

#### /nick

```typescript
commandRegistry.registerBuiltin({
  name: 'nick',
  description: '修改显示名',
  usage: '/nick <name>',
  paramType: 'text',
  placeholder: '新显示名…',
  execute: async ({ args, api, dispatch, channelId }) => {
    if (!args.trim()) throw new CommandError('Usage: /nick <name>');
    await api.updateProfile({ display_name: args.trim() });
    dispatch({
      type: 'INSERT_LOCAL_SYSTEM_MESSAGE',
      payload: { channelId, text: `显示名已改为 ${args.trim()}` },
    });
  },
});
```

## 备选方案

### 方案 B：Webhook 回调

Agent 注册命令时提供 callback URL，用户执行时 server POST 到 URL。

**优点：**
- Agent 不需要保持 WS 连接
- 支持外部服务（非 Collab Agent）

**缺点：**
- Agent 需要暴露公网端口
- 增加网络复杂度（超时、重试、认证）
- 与 Collab 已有实时通道重复

**为什么没选：** Collab Agent 已有 WS/SSE 连接，消息通道复用现有基础设施，零额外成本。Webhook 引入不必要的复杂度。

## 测试策略

### 单元测试

- CommandRegistry：resolve/search 覆盖内置+远程+冲突
- DB 操作：CRUD、唯一约束、上限检查
- API 路由：参数验证、权限检查

### 集成测试

- 完整流程：Agent 注册命令 → 用户执行 → Agent 收到 command 消息 → Agent 回复
- WS 事件：注册后前端收到 command_registered
- 边界：101 个命令 → 400 错误
- 同名覆盖：注册两次同名 → 后者生效

### E2E 测试

- 浏览器输入 `/` → 命令面板显示所有命令
- 选择 Agent 命令 → 消息发送 → Agent 回复

## Task Breakdown

| # | 任务 | Scope | 预估 |
|---|------|-------|------|
| 1 | DB: agent_commands 表 + migration | 建表 + index | 0.5h |
| 2 | Server: CRUD API（POST/GET/DELETE） | 4 个端点 + 验证 + 上限 | 2h |
| 3 | Server: WS 事件广播 | command_registered / command_deleted | 1h |
| 4 | Server: 命令执行路由 | content_type=command 消息处理 | 1h |
| 5 | Client: CommandRegistry 扩展 | 远程命令支持 + resolve/search | 1.5h |
| 6 | Client: 命令加载 + WS 同步 | 启动 fetch + 事件监听 | 1h |
| 7 | Client: /status /clear /nick | 3 个内置命令 | 1h |
| 8 | 测试 | 单测 + 集成测试 | 2h |

**总计：~10h**

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Agent 离线时命令无响应 | 用户困惑 | 前端 30s 超时提示"Agent 未响应" |
| 命令列表缓存不一致 | 显示过时命令 | WS 事件 + 页面刷新重新 fetch |
| 命令名与内置冲突 | 内置被覆盖 | 内置命令优先级高于 Agent 命令 |
| 大量 Agent 注册命令 | 命令面板臃肿 | 按 Agent 分组显示 + 搜索过滤 |
