# client — React SPA 设计

代码位置：`/workspace/borgee/packages/client/`

## 1. 构建与入口

- 包名 `@borgee/client`，纯 ESM，React 18 + TypeScript 5.7 + Vite 6 + Vitest 4。
- 关键运行时依赖：`react-router-dom@7`（仅 admin 用）、`@tiptap/react` + `tiptap-markdown`（消息编辑器）、`@dnd-kit/*`（频道拖拽排序）、`emoji-mart`、`marked` + `highlight.js` + `dompurify`（消息渲染）。
- **双 SPA 单构建**：`vite.config.ts` 配置两个 Rollup 入口
  - `index.html` → `src/main.tsx` → `<App/>`（用户端）
  - `admin.html` → `src/admin/main.tsx` → `<AdminApp/>`（admin 端，用 React Router）
- Dev 时 `/api`、`/admin-api`、`/ws`、`/uploads` 全部 proxy 到 `localhost:4900`。
- `main.tsx` 在 `load` 事件后注册 `/sw.js`（PWA service worker）。

## 2. 顶层结构 (`src/App.tsx`)

```
<ThemeProvider>            # 浅/深色，localStorage 持久化
  <AppProvider>            # useReducer 中央 store
    <ToastProvider>
      <AppInner/>          # 真正的 layout
```

**没有 React Router**——用户端通过 `AppContext.currentChannelId` 这个状态字段做"路由"。`AppInner` 启动时：

1. `useEffect` 里调一次 `fetchMe()` 识别登录态（`waitForAuthReady` 的 500ms 轮询只在登录表单提交后用，不是启动）。
2. 串行加载 user / permissions / channels / online users → `SET_INITIALIZED`。
3. 每 30s `loadOnlineUsers()`。
4. 没选频道时自动选第一个。
5. 已加入的频道挨个 `useWebSocket().subscribe()`。
6. 渲染 `<Sidebar/>` + 当前主面板（`AgentManager` / `InvitationsInbox` / `WorkspaceManager` / `NodeManager` / `ChannelView` / 启动屏）。
7. 768px 以下走移动端布局，hamburger + overlay。

## 3. 目录职责

### `context/`
- `AppContext.tsx` — `useReducer` 中央 store，承载 `channels`/`groups`/`dmChannels`/`currentChannelId`、`messages: Map<channelId, Message[]>`、`hasMore`、`loadingMessages`、`currentUser`、`permissions`、`onlineUserIds`、`connectionState`、`typingUsers`、`pendingMessages`、`channelMembersVersion`、`initialized`。reducer 处理 38 个 action。
  - 通过两个 ref 注入 WS 能力：`sendWsMessageRef`、`registerAckTimerRef`。`AppInner` 在 mount 后从 `useWebSocket()` 拿到函数，再调 context 的 `setSendWsMessage` / `setRegisterAckTimer` 写入 ref，避免循环依赖。
- `ThemeContext.tsx` — 主题切换。

### `lib/`
- `api.ts` — 全部 REST 调用集中在这里。`request<T>()` 用 `fetch` + `credentials: 'include'`（cookie auth）；dev 时塞 `X-Dev-User-Id` 头；非 2xx 抛 `ApiError`。
- `markdown.ts`、`file-links.ts` — `marked + highlight.js + dompurify` 渲染。

### `hooks/`
- `useWebSocket.ts` — 单连接 `/ws`，关键行为：
  - 重连退避 `[1s, 2s, 4s, 8s, 16s, 30s]`。
  - 每 25s `ping`。
  - 重连后重新 `subscribe` 所有频道，并对每个频道用最后已知时间戳调 `fetchMessages({after: lastTs})` 拉漏掉的消息。
  - 把所有服务端 push 类型 dispatch 到 `AppContext`。
- `useSlashCommands.ts` — 跟踪 editor 文本，前缀 `/` + 无空格时激活；委托 `commandRegistry.search(prefix)` 出选项；管理键盘导航。
- `useCommandTracking.ts` — 监听自定义事件 `commands_updated` 重新拉远端命令。
- `useMention.ts`、`usePermissions.ts`、`useLongPress.ts`、`useVisualViewport.ts` — 小工具 hook。

### `components/`
- `Sidebar.tsx`、`ChannelList.tsx`（`@dnd-kit` 拖拽 → `api.reorderChannel`）。
- `ChannelView.tsx` — 频道主区，组合 `MessageList` + `MessageInput` + `TypingIndicator` + 工具栏。
- `MessageList.tsx` — 合并 `messages + pendingMessages` 渲染；scroll 到顶触发 `loadOlderMessages`；新消息自动 scroll 到底。
- `MessageItem.tsx` — 单条消息：avatar、displayName、时间、`marked + dompurify` markdown、edit/delete、`<ReactionBar/>`。
- `MessageInput.tsx` — TipTap 编辑器（`StarterKit + Markdown + MentionExtension`），Enter 发送、Ctrl+Enter 换行、文件拖放、图片粘贴、emoji 选择器、mention 选择器、slash command 选择器。
- `ReactionBar.tsx`、`SlashCommandPicker.tsx`、`AgentManager.tsx`、`InvitationsInbox.tsx`、`WorkspaceManager.tsx`、`NodeManager.tsx`、`ConnectionStatus.tsx`、`Toast.tsx`、`TypingIndicator.tsx`。
  - `InvitationsInbox.tsx`（CM-4.2）— 业主侧 agent 邀请收件箱：`listAgentInvitations('owner')` 拉列表，pending 行带 同意/拒绝 quick action（PATCH `/api/v1/agent_invitations/{id}` `{state}`），同意成功后 `actions.loadChannels()` 然后 `onJumpToChannel(channel_id)` 切到目标频道；409 → "该邀请已被处理或状态已变更，请刷新"。`Sidebar` 右下 🔔 铃铛每 60s 轮询 owner-role 邀请数（agent 角色跳过），CM-4.3 会替换成 BPP push frame。Bug-029 后渲染 `agent_name` / `channel_name`（前缀 `#`）/ `requester_name`，server-resolved label 缺失则 fallback 到 raw id；raw UUID 始终保留在 `title` hover 上（debug / log 引用）。`AgentInvitation` 类型见 `lib/api.ts`：`agent_name?` / `channel_name?` / `requester_name?` 三字段 optional（向后兼容旧 server）。

### `extensions/`
- `mention.ts` — 包装 TipTap 的 mention 扩展，suggestion 用 `<MentionList/>` 渲染。`MessageInput` 发送前用 `extractMentionIds()` 把 mention node 的 `id` 收集出来传给 server。

### `commands/`
- `registry.ts` — 单例 `CommandRegistry`：内置命令 `Map<name, CommandDefinition>`，远端命令 `RemoteCommand[]`。`resolve(name)` 返回 `builtin / remote / ambiguous / null`；`search(prefix)` 输出按 group 分类。
- `builtins.ts` — 内置 8 个 slash command：`/help /leave /topic /invite /dm /status /clear /nick`。每个 `execute(ctx)` 拿到 `{channelId, currentUserId, args, dispatch, api, actions}`。

### `admin/`
- 独立 SPA，用 React Router v7。`useAdminAuth()` 处理 `/admin-api/v1/auth/*` 的 cookie session。
- 页面：`DashboardPage`（统计）、`UsersPage` + `UserDetailPage`（账号、权限、API key）、`ChannelsPage`、`InvitesPage`、`SettingsPage`。
- `admin/api.ts` 镜像 `lib/api.ts`，base URL 为 `/admin-api/v1`。

## 4. 与 server 的通信

- **REST**：同源（dev 走 vite proxy），cookie 即 auth。
- **WebSocket**：单连 `/ws`，事件类型见 [`server` §6](../server/README.md#6-realtime)。
- **乐观发送**（`MessageInput.tsx`）：
  1. `dispatch(ADD_PENDING_MESSAGE)` 生成 `client_message_id`（`crypto.randomUUID()`）。
  2. WS 发 `{type:'chat_message', client_message_id, channel_id, content}`。
  3. `registerAckTimer` 起 10s 计时器；超时 → `dispatch(FAIL_PENDING_MESSAGE)` 把这条消息标记为发送失败（**不会**自动 fallback 到 REST，由用户手动重试）。
  4. `message_ack` → `ACK_PENDING_MESSAGE`，把 pending 替换为已确认行。
  5. `message_nack` → `FAIL_PENDING_MESSAGE`。
- **文件上传**：`api.uploadImage(file)` → `POST /api/v1/upload`，回传 URL，作为 markdown image 嵌入消息内容，`content_type: 'image'`。

## 5. 状态模型

- 全部状态在 `AppContext` 的 `useReducer` 里，**没有 Redux/Zustand/Recoil**。
- 消息按 channel 缓存：`Map<channelId, Message[]>`，进入频道时拉最近 100，向上翻 `PREPEND_MESSAGES` 50 条；`hasMore` 控制"加载更早"按钮。
- pending 消息单独 `Map<channelId, PendingMessage[]>`，`MessageList` 合并后按时间戳排序。
- 未读数：`ADD_MESSAGE` 时如果不是当前频道就 `unread++`，`selectChannel` 时清零。
- typing 指示 3s 过期，`AppProvider` 里 1s 一次 interval 清理。

## 6. 关键用户流

| 流程 | 触发 | 涉及文件 |
|------|------|----------|
| 登录 | `<LoginPage/>` 提交 | `lib/api.login` → cookie，刷新 `fetchMe` |
| 选频道 | Sidebar 点击 | `dispatch(SELECT_CHANNEL)`，懒加载 messages |
| 发消息 | `MessageInput` 回车 | 见 §4 乐观发送 |
| 创建 DM | 点用户名 | `api.openDM(userId)` → 新 channel 出现并选中 |
| 加 reaction | `ReactionBar` 表情 | `api.addReaction/removeReaction` + WS push 同步 |
| 上传图片 | drag/paste/选择 | `api.uploadImage` → markdown 注入编辑器 |
| 拖拽频道 | `ChannelList` dnd-kit | 计算新 LexoRank → `api.reorderChannel` |
| 输入 `/x` | `MessageInput` | `useSlashCommands` 显示 `<SlashCommandPicker/>`，回车 → 内置 `execute()` 或派发到 agent |

## 7. Slash Command 模型

- 内置命令在 `commands/builtins.ts` 注册到 `commandRegistry`。
- 远端命令来自 server `GET /api/v1/commands`（plugin 通过 WS `register_commands` 上报），`commands_updated` 事件触发 `useCommandTracking` 重拉。
- 同名冲突：内置优先；多个 agent 同名 → `ambiguous`，需要用 `/agent:cmd` 限定。

## 8. 测试

`src/__tests__/`，全部 Vitest，**只覆盖纯逻辑模块**：

- `command-registry.test.ts` — resolve 优先级、ambiguous、search 前缀过滤、`setRemoteCommands` 替换语义。
- `channel-sort.test.ts` — position 字符串 lex 排序 + `last_message_at` fallback。
- `channel-groups-ui.test.ts` — 分组展示逻辑。
- `agent-invitations.test.ts` — CM-4.2 client：`createAgentInvitation` / `listAgentInvitations(role)` / `fetchAgentInvitation` / `decideAgentInvitation` 的请求形状、`{invitation}` / `{invitations}` 解包、409 → `ApiError`、`stateToLabel` 4 状态中文映射。

没有组件级 React Testing Library 测试。
