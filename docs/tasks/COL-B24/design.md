# COL-B24: 集成测试覆盖 — 技术设计 v3

日期：2026-04-22 | 状态：Draft

## 1. 技术决策

### 1.1 为什么不引入新框架

保留 Vitest + Fastify inject。理由：
- 已有基础（200+ 现有测试）
- Fastify inject 不起真实 HTTP server，零端口冲突
- WS 测试用 `ws` 包 + Fastify 的 `@fastify/websocket`，inject 不支持 WS 需要起真实 server

**WS 测试的端口方案**：每个测试文件用随机端口 `server.listen({ port: 0 })`，OS 自动分配。`afterAll` 关闭 server。

### 1.2 测试数据隔离

**每个测试文件独立 in-memory SQLite DB**。不用 `beforeEach` 清数据——独立 DB 更简单、无残留。

```typescript
// 每个测试文件
let app: FastifyInstance;
let db: Database;

beforeAll(async () => {
  db = new Database(':memory:');
  app = await buildTestApp({ db });
});

afterAll(async () => {
  await app.close();
  db.close();
});
```

### 1.3 多用户模拟

封装 `TestContext` helper，一次性创建多角色 + 获取 token：

```typescript
class TestContext {
  app: FastifyInstance;
  admin: { id: string; token: string; apiKey?: string };
  memberA: { id: string; token: string };
  memberB: { id: string; token: string };
  agent: { id: string; apiKey: string; ownerId: string };
  channel: { id: string };

  static async create(): Promise<TestContext> {
    const ctx = new TestContext();
    ctx.app = await buildTestApp();
    ctx.admin = await ctx.registerAdmin();
    ctx.memberA = await ctx.registerMember('memberA');
    ctx.memberB = await ctx.registerMember('memberB');
    ctx.agent = await ctx.createAgent('test-bot');
    ctx.channel = await ctx.createChannel('test-channel');
    await ctx.addMember(ctx.channel.id, ctx.memberA.id);
    await ctx.addMember(ctx.channel.id, ctx.memberB.id);
    return ctx;
  }

  // 封装常用操作
  async sendMessage(channelId: string, token: string, content: string): Promise<any>;
  async inject(method: string, url: string, token: string, body?: any): Promise<any>;
}
```

## 2. OpenClaw Mock Harness 实现

### 2.1 问题

Plugin 代码 import OpenClaw SDK 类型（`ChannelGatewayContext`、`CoreConfig` 等）。测试环境需要提供这些接口的 mock 实现。

### 2.2 方案

不 mock 整个 OpenClaw runtime。只 mock Plugin 调用的接口：

```typescript
// packages/plugin/src/__tests__/harness/openclaw-mock.ts

import type { ResolvedCollabAccount } from '../../types.js';

interface MockGatewayContext {
  abortSignal: AbortSignal;
  account: ResolvedCollabAccount;
  cfg: Record<string, unknown>;
  setStatus: (status: any) => void;
}

export class OpenClawMockHarness {
  private ctrl = new AbortController();
  public statuses: any[] = [];
  public inboundCalls: any[] = [];

  createAccount(overrides?: Partial<ResolvedCollabAccount>): ResolvedCollabAccount {
    return {
      accountId: 'test',
      enabled: true,
      baseUrl: 'http://localhost:PORT', // 替换为真实测试 server 端口
      apiKey: 'col_test_key',
      botUserId: '',
      botDisplayName: '',
      requireMention: false,
      pollTimeoutMs: 30000,
      transport: 'auto' as const,
      config: { allowFrom: ['*'] },
      configured: true,
      ...overrides,
    };
  }

  createContext(account: ResolvedCollabAccount): MockGatewayContext {
    return {
      abortSignal: this.ctrl.signal,
      account,
      cfg: {},
      setStatus: (s) => this.statuses.push(s),
    };
  }

  shutdown(): void {
    this.ctrl.abort();
  }
}
```

### 2.3 Plugin 测试依赖解决

Plugin 的 `import { ... } from "openclaw/plugin-sdk/..."` 在测试环境需要解决。两个方案：

**A. tsconfig paths alias**（推荐）：
```json
// packages/plugin/tsconfig.test.json
{
  "compilerOptions": {
    "paths": {
      "openclaw/plugin-sdk/*": ["../../node_modules/openclaw/plugin-sdk/*"]
    }
  }
}
```

**B. 如果 A 不 work**：直接在测试里 mock 掉 OpenClaw SDK import，只测 Plugin 自己的逻辑。

### 2.4 完整链路测试

起真实 Collab Fastify server → Plugin 用 mock harness 的 account 连接 → 发消息 → 验证 inbound dispatch：

```typescript
describe('Plugin + Collab e2e', () => {
  let server: FastifyInstance;
  let harness: OpenClawMockHarness;
  let serverPort: number;

  beforeAll(async () => {
    server = await buildTestApp();
    await server.listen({ port: 0 });
    serverPort = (server.server.address() as any).port;
    harness = new OpenClawMockHarness();
  });

  it('Plugin connects and receives events', async () => {
    const account = harness.createAccount({ baseUrl: `http://localhost:${serverPort}` });
    const ctx = harness.createContext(account);
    // 启动 plugin gateway（会连 SSE/WS）
    const gatewayPromise = startCollabGateway('test-channel', 'Test', ctx as any);
    // 等连接建立
    await sleep(2000);
    // 发消息
    await sendTestMessage(server, account.apiKey, 'hello');
    // 验证
    await sleep(1000);
    // ... 检查 harness.inboundCalls 或消息到达
    harness.shutdown();
    await gatewayPromise;
  });
});
```

## 3. SSE/WS/Poll 三路径 requireMention 测试

### 3.1 问题

requireMention 在三条路径都有过滤逻辑，需要统一验证行为一致。

### 3.2 方案

用参数化测试 + 真实 Collab server：

```typescript
describe.each([
  ['SSE', 'sse'],
  ['WS', 'ws'],
  ['Poll', 'poll'],
])('requireMention via %s', (label, transport) => {
  it('filters non-mentioned messages', async () => {
    const account = harness.createAccount({
      transport: transport as any,
      requireMention: true,
    });
    // 启动 plugin
    // 发不含 @bot 的消息
    // 验证 inbound 没收到
  });

  it('passes mentioned messages', async () => {
    // 发含 @bot 的消息
    // 验证 inbound 收到
  });
});
```

## 4. WS 集成测试方案

### 4.1 Plugin WS endpoint 测试

```typescript
describe('WS Plugin endpoint', () => {
  let server: FastifyInstance;
  let port: number;

  beforeAll(async () => {
    server = await buildRealApp(); // 不用 inject，起真实 server
    await server.listen({ port: 0 });
    port = (server.server.address() as any).port;
  });

  it('connects with valid API key', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/plugin?apiKey=${validKey}`);
    await waitForOpen(ws);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('rejects invalid key with 4001', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/plugin?apiKey=bad`);
    const code = await waitForClose(ws);
    expect(code).toBe(4001);
  });
});
```

### 4.2 Remote Explorer WS 测试

同样用真实 server + `ws` 包做 WS 客户端。Remote agent mock 在测试里模拟：

```typescript
it('relays file read request', async () => {
  // 1. 创建 node + 获取 token
  // 2. Mock remote agent WS 连接
  const agent = new WebSocket(`ws://localhost:${port}/ws/remote?token=${token}`);
  agent.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.type === 'request') {
      agent.send(JSON.stringify({
        type: 'response',
        id: msg.id,
        data: { content: 'file content', size: 12, mime_type: 'text/plain' },
      }));
    }
  });
  // 3. HTTP 请求读文件
  const res = await app.inject({ method: 'GET', url: `/api/v1/remote/nodes/${nodeId}/read?path=/test.txt`, headers: { authorization: `Bearer ${token}` } });
  expect(res.statusCode).toBe(200);
});
```

## 5. Plugin 单元测试方案

不需要 OpenClaw mock，纯函数测试：

### outbound.test.ts
```typescript
// mock fetch/WS，验证 sendCollabText 正确调用 API
// 验证 WS 可用时走 apiCall，不可用时走 HTTP
```

### ws-client.test.ts
```typescript
// 起 mock WS server
// 测连接、重连（指数退避）、apiCall（request→response）、超时
```

### file-access.test.ts
```typescript
// 创建临时目录 + 配置文件
// 测白名单校验、readFile、大文件拒绝
```

### accounts.test.ts
```typescript
// 测配置解析、默认值、transport 枚举
```

## 6. Task Breakdown

| Task | 内容 | 预估 |
|------|------|------|
| T1 | TestContext helper + 基础设施 + CI 配置 | 小 |
| T2 | 场景 1+3+12: 认证 + 权限 + 并发 | 中 |
| T3 | 场景 2+4+11: 频道 + 消息 + DM | 中 |
| T4 | 场景 5+6: requireMention 三路径 + Slash | 中 |
| T5 | 场景 7: Workspace | 中 |
| T6 | 场景 8+14: Plugin WS + 文件链接 | 大（需起真实 server） |
| T7 | 场景 9: Remote Explorer | 大（WS mock agent） |
| T8 | 场景 10: OpenClaw mock harness + Plugin 集成 | 大 |
| T9 | 场景 13 + Plugin 单测 + 覆盖率调优 | 中 |

## 7. 验收标准
- [ ] 14 个场景全部有测试
- [ ] OpenClaw mock harness 能跑 startCollabGateway
- [ ] 多用户隔离验证（TestContext）
- [ ] WS 测试用真实 server + 随机端口
- [ ] 覆盖率 ≥ 85%
- [ ] CI 通过
