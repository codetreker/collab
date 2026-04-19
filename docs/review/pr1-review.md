# PR #1 Code Review — feat: Collab v1

**Reviewer**: Code Review Bot  
**Date**: 2026-04-18  
**Branch**: `feat/collab-v1` → `main`  
**Verdict**: **REQUEST CHANGES**

---

## P0 — Must Fix (阻塞合并)

### P0-1. 硬编码 API Key（安全）
- **文件**: `packages/server/src/seed.ts:28-31`
- **问题**: Agent API key 硬编码在源码中（`col_pegasus_key_001` 等），提交到 Git 仓库。任何有仓库访问权限的人都可以冒充 agent 发送消息。
- **建议**: 从环境变量或首次启动时随机生成 API key，打印到 stdout 或写入 data 目录，不进源码。

### P0-2. `/api/v1/poll` 绕过认证中间件
- **文件**: `packages/server/src/index.ts:57`
- **问题**: Poll 端点在 `onRequest` hook 中被跳过认证（`url === '/api/v1/poll'`），虽然 poll handler 内部自行校验 `api_key`，但这意味着 poll 端点在 body 里传 api_key 而非标准 `Authorization` header。这是与其他 API 不一致的认证模式，且 body 中的 api_key 会出现在请求日志中。
- **建议**: 统一使用 `Authorization: Bearer` header 认证 poll 端点，移除 body 中的 `api_key` 字段。

### P0-3. SQL 注入风险 — `searchMessages` LIKE 参数未转义
- **文件**: `packages/server/src/queries.ts:235`
- **问题**: `searchMessages` 使用 `%${query}%` 构建 LIKE 条件。虽然使用了参数化查询（不是字符串拼接），但用户可以注入 LIKE 通配符 `%` 和 `_` 进行模式匹配攻击，匹配到不应看到的内容。
- **建议**: 转义 `query` 中的 `%`、`_` 和 `\` 字符。

### P0-4. 零测试
- **文件**: 项目全局
- **问题**: 整个项目没有任何单元测试、集成测试文件。设计文档要求新代码覆盖率 ≥85%，关键路径 100%。
- **建议**: 添加测试，至少覆盖：DB CRUD、认证中间件、WebSocket 消息处理、Markdown XSS 过滤、长轮询逻辑。

### P0-5. WebSocket `send_message` 未校验 channel 成员身份
- **文件**: `packages/server/src/ws.ts:149-184`
- **问题**: 通过 WebSocket `send_message` 发送消息时，只检查 channel 是否存在，没有检查发送者是否是该 channel 的成员。而 `subscribe` 操作（line 124）有成员校验。
- **建议**: 在 `send_message` handler 中添加 `isChannelMember` 检查。

### P0-6. 生产环境 Dev 模式后门未禁用
- **文件**: `packages/server/src/ws.ts:86-93`, `packages/client/src/components/UserPicker.tsx`
- **问题**: WebSocket 认证在 `NODE_ENV !== 'production'` 时允许通过 `user_id` 参数伪造身份，但前端 UserPicker 组件始终渲染（没有环境判断），且 REST API 的 `X-Dev-User-Id` header 在 dev 模式下也无条件接受。如果 `NODE_ENV` 未设置（默认 undefined），dev bypass 将生效。
- **建议**: 
  1. 前端 UserPicker 只在开发环境显示（检查 `import.meta.env.DEV`）
  2. 服务端在 `NODE_ENV` 未显式设置时不启用 dev bypass

---

## P1 — Should Fix（合并前应修复）

### P1-1. WebSocket 连接泄漏 — heartbeat interval 永不清除
- **文件**: `packages/server/src/ws.ts:206-219`
- **问题**: `heartbeatInterval` 在第一次调用 `registerWebSocket` 后设置，但在 graceful shutdown 时未清除。`setInterval` 会阻止进程正常退出。
- **建议**: 在 `app.addHook('onClose', ...)` 中 `clearInterval(heartbeatInterval)`。

### P1-2. 前端 `@mention` 正则不支持中文用户名
- **文件**: `packages/client/src/lib/markdown.ts:31`, `packages/client/src/components/MessageInput.tsx:50`
- **问题**: `@(\w+)` 无法匹配中文字符。设计文档中用户名包含 "建军"、"飞马" 等中文。E2E 报告也确认了此问题。
- **建议**: 使用 `@([\w\u4e00-\u9fff]+)` 或改为 Unicode word boundary 匹配。

### P1-3. CORS 配置过于宽松
- **文件**: `packages/server/src/index.ts:36`
- **问题**: `fastifyCors` 设置 `origin: true` 允许任何 origin。生产环境应限制为 `collab.codetrek.work`。
- **建议**: 生产环境设置 `origin: ['https://collab.codetrek.work']`。

### P1-4. 长轮询 waiter 无上限
- **文件**: `packages/server/src/routes/poll.ts:9-14`
- **问题**: `waiters` 数组无大小限制。恶意或异常客户端可以无限制创建长轮询连接，导致内存增长。
- **建议**: 限制最大 waiter 数量（如 100），超过时返回 503。

### P1-5. 上传文件名路径遍历
- **文件**: `packages/server/src/routes/upload.ts:52-54`
- **问题**: 文件名使用 UUID 生成，安全。但 `ext` 回退到 `path.extname(data.filename)` 可能包含特殊字符。
- **建议**: 仅使用 MIME_TO_EXT 映射，不回退到用户提供的文件名。

### P1-6. 数据模型偏离设计
- **文件**: `packages/server/src/db.ts` vs 设计文档
- **问题**:
  - 设计文档定义了 `events` 表的 `kind` 类型为 `"message" | "message_edited" | "message_deleted"`，实际代码中 `EventKind` 包含更多类型（`mention`, `channel_created`, `member_joined`, `member_left`）——这是合理扩展，但未更新设计文档。
  - `channel_members` 表增加了 `last_read_at` 字段，设计文档中没有。
- **建议**: 更新设计文档以反映实际实现。

### P1-7. `createMessage` 使用动态 import 通知 waiters
- **文件**: `packages/server/src/queries.ts:310`
- **问题**: `import('./routes/poll.js').then((m) => m.signalNewEvents()).catch(() => {})` 用动态 import 打破循环依赖，但 `.catch(() => {})` 静默吞掉错误。如果 import 失败，长轮询客户端将永远收不到通知。
- **建议**: 使用事件发射器（EventEmitter）或回调注入模式解耦，避免动态 import + 静默失败。

### P1-8. `reply.sendFile('index.html')` SPA fallback 未检查静态资源
- **文件**: `packages/server/src/index.ts:107-112`
- **问题**: NotFoundHandler 对所有非 `/api/` 和非 `/ws` 的请求返回 `index.html`，包括 `.js`、`.css` 等静态资源 404。这会导致浏览器把 HTML 当 JS 解析。
- **建议**: 只对不带文件扩展名的请求返回 index.html，有扩展名的返回 404。

---

## P2 — Nice to Have（建议改进）

### P2-1. `listChannels` 查询性能
- **文件**: `packages/server/src/queries.ts:7-22`
- **问题**: 对每个 channel 执行 3 次子查询获取 `last_message_at`。5 用户场景可接受，但查询结构可优化。
- **建议**: 使用 `LEFT JOIN` + `GROUP BY` 替代重复子查询。

### P2-2. `stringToColor` 函数重复
- **文件**: `packages/client/src/components/MessageItem.tsx` 和 `MentionPicker.tsx`
- **问题**: 相同函数在两个文件中重复定义。
- **建议**: 提取到共享 utils 文件。

### P2-3. 前端 Markdown 渲染中 mention 替换逻辑
- **文件**: `packages/client/src/lib/markdown.ts:24-33`
- **问题**: 先替换显式 mentions 为 `<span>` 标签，然后 markdown 解析可能再次转义这些标签。当前依赖 DOMPurify 允许 `span` 标签来保留——逻辑正确但脆弱。
- **建议**: 在 markdown 解析后通过 DOM 操作注入 mention 样式，而非在解析前注入 HTML。

### P2-4. Plugin `openclaw` dev 依赖使用本地路径
- **文件**: `packages/plugin/package.json:15`
- **问题**: `"openclaw": "file:/home/ubuntu/.nvm/versions/node/v24.14.1/lib/node_modules/openclaw"` 硬编码了本地绝对路径，其他开发者无法使用。
- **建议**: 使用 peerDependencies 解析或提供安装说明。

### P2-5. 前端未实现 REST API 重试
- **文件**: `packages/client/src/lib/api.ts`
- **问题**: 设计文档要求 "REST API 超时 3 次重试，间隔 1s/2s/4s"，前端 API 客户端无重试逻辑。
- **建议**: 添加重试 wrapper。

### P2-6. 前端缺少虚拟滚动说明
- **文件**: 设计文档 vs 实际实现
- **问题**: 设计文档 `MessageList.tsx` 注释说 "虚拟滚动"，Task T09 明确写了 "不做虚拟滚动"。实际实现正确（无虚拟滚动），但设计文档组件描述处有矛盾。
- **建议**: 统一设计文档描述。

---

## Spec 对照表

| 设计文档条目 | 实现状态 | 备注 |
|---|---|---|
| Fastify + ws + SQLite 架构 | ✅ 完全匹配 | |
| 数据模型 (channels, users, messages, channel_members, mentions, events) | ✅ 基本匹配 | `channel_members` 增加 `last_read_at`，`EventKind` 扩展 |
| REST API — GET/POST /channels | ✅ | 额外实现了 PUT、members 管理 |
| REST API — GET/POST /messages | ✅ | 额外实现了 search |
| REST API — POST /upload | ✅ | |
| REST API — GET /users, /users/me | ✅ | |
| REST API — POST /poll | ✅ | cursor 机制 + hold-until-event |
| WebSocket 协议 (subscribe/unsubscribe/send_message/ping) | ✅ | 额外实现了 presence |
| CF Access JWT 认证 | ✅ | |
| API key 认证 | ✅ | key 硬编码 (P0-1) |
| 前端 React 18 + Vite + TypeScript | ✅ | |
| 不使用外部 CDN / Google Fonts | ✅ | 使用系统字体栈 |
| DOMPurify XSS 防护 | ✅ | |
| Markdown 渲染 (marked) | ✅ | 未引入 highlight.js（设计文档要求） |
| @mention 高亮 | ⚠️ 部分 | 中文不支持 (P1-2) |
| 指数退避重连 | ✅ | 客户端 + Plugin 均实现 |
| 连接状态 banner | ✅ | |
| 移动端响应式布局 | ✅ | |
| 图片上传（粘贴 + 拖拽） | ✅ | |
| 图片加载失败 fallback | ✅ | |
| OpenClaw Plugin — qa-channel 模式 | ✅ | 结构完整 |
| Plugin — 长轮询 gateway | ✅ | 指数退避 |
| Plugin — inbound dispatch | ✅ | dispatchInboundReplyWithBase |
| Plugin — outbound | ✅ | |
| Plugin — 多账号 | ✅ | |
| Plugin — cursor 持久化 | ❌ 缺失 | 设计文档要求写入 `~/.openclaw/collab-cursor.json`，实际 gateway 从 0 开始 |
| Docker 部署 | ✅ | 两阶段构建 |
| 单元测试 ≥85% | ❌ 缺失 | 零测试 (P0-4) |
| 消息引用 (reply_to_id) | ✅ 后端 / ❌ 前端 | 设计文档注明 v1 前端不做，正确 |
| 消息编辑/删除 | ❌ v1 不做 | 正确 |
| highlight.js 代码高亮 | ❌ 缺失 | 设计文档要求 marked + highlight.js |

---

## 结论

**REQUEST CHANGES**

### Must-fix 清单（合并前必须修复）:

1. **P0-1**: 移除硬编码 API key，改为环境变量或自动生成
2. **P0-4**: 添加测试（至少核心路径：DB、认证、WebSocket、XSS）
3. **P0-5**: WebSocket `send_message` 添加 channel 成员校验
4. **P0-6**: 生产环境禁用 dev 模式后门（前端 + 后端）
5. **P1-1**: 修复 heartbeat interval 泄漏
6. **P1-3**: 生产环境限制 CORS origin
