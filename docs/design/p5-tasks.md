Now I have the full picture. Here's the task breakdown:

---

## P5 Chat UX Enhancements — Task Breakdown (T0–T4)

### T0: 基础设施改造（前置依赖）
> 所有后续 task 的共享基础

| 项 | 内容 |
|---|---|
| **改动文件** | `server/src/ws.ts`、`client/src/hooks/useWebSocket.ts`、`client/src/context/AppContext.tsx` |
| **预估行数** | ~60 行 |
| **具体内容** | 1) `broadcastToChannel` 增加 `excludeWs` 参数<br>2) `useWebSocket` 暴露 `sendWsMessage` 方法（通过 Context 传递）<br>3) `ADD_MESSAGE` reducer 增加 `message.id` 去重逻辑 |
| **验证方式** | 单元测试：broadcastToChannel 排除指定 ws；手动验证 sendWsMessage 可从组件调用；重复 id 消息不重复渲染 |
| **依赖** | 无（最先做） |

---

### T1: Typing Indicator（正在输入提示）
> 依赖 T0（需要 `excludeWs` + `sendWsMessage`）

| 项 | 内容 |
|---|---|
| **改动文件** | `server/src/ws.ts`（+15 行 typing case）、`client/src/hooks/useWebSocket.ts`（+10 行 typing handler）、`client/src/context/AppContext.tsx`（+30 行 typingUsers state + SET_TYPING/CLEAR_EXPIRED_TYPING + setInterval）、`client/src/components/MessageInput.tsx`（+15 行节流 emitTyping）、**新建** `client/src/components/TypingIndicator.tsx`（~30 行）、`client/src/components/MessageList.tsx`（+5 行集成）、`client/src/index.css`（+15 行动画样式） |
| **预估行数** | ~120 行 |
| **验证方式** | 双浏览器窗口：A 输入 → B 看到 "A 正在输入…"；停止输入 3 秒后消失；连续打字只有每 2 秒一次 WS 事件（DevTools Network 验证）；4 人同时输入显示"多人正在输入…" |
| **依赖** | T0 |

---

### T2: Emoji Picker（表情选择器）
> 与 T1 无依赖，但建议串行以控制 review 粒度

| 项 | 内容 |
|---|---|
| **改动文件** | `client/package.json`（+3 依赖 `@emoji-mart/react` `@emoji-mart/data` `emoji-mart`）、`client/src/components/MessageInput.tsx`（+60 行：emoji 按钮、Picker 弹窗、insertEmojiAtCursor、click-outside 关闭）、`client/src/index.css`（+20 行 `.emoji-picker-popover` 定位样式） |
| **预估行数** | ~80 行（不含 node_modules） |
| **验证方式** | 点击 😊 按钮弹出 picker → 搜索 emoji → 选择后插入光标位置且光标正确 → 点击外部关闭 → 常用 emoji 面板显示（localStorage 持久化） |
| **依赖** | 无（可与 T1 并行，但建议在 T0 之后） |

---

### T3: Message Reactions（消息反应）
> 依赖 T2（复用 emoji-mart Picker）

| 项 | 内容 |
|---|---|
| **改动文件** | `server/src/db.ts`（+10 行 CREATE TABLE + INDEX）、`server/src/queries.ts`（+60 行 addReaction/removeReaction/getReactionsByMessageId/getReactionsForMessages）、**新建** `server/src/routes/reactions.ts`（~80 行 PUT/DELETE/GET + WS 广播）、`server/src/index.ts`（+2 行注册路由）、`server/src/routes/messages.ts`（+10 行附带 reactions）、`client/src/types.ts`（+3 行 reactions 字段）、`client/src/context/AppContext.tsx`（+15 行 UPDATE_REACTIONS action）、`client/src/hooks/useWebSocket.ts`（+10 行 reaction_update handler）、**新建** `client/src/components/ReactionBar.tsx`（~80 行 pills + tooltip + add/remove）、`client/src/components/MessageItem.tsx`（+15 行集成 ReactionBar + hover ➕ 按钮）、`client/src/index.css`（+30 行 reaction 样式） |
| **预估行数** | ~315 行 |
| **验证方式** | API 测试（curl PUT/DELETE/GET reactions）；双浏览器：A 加 reaction → B 实时看到 pill；点击已有 pill 切换 add/remove；hover tooltip 显示参与者；消息列表 API 返回 reactions 字段；同 user+message+emoji 幂等不重复 |
| **依赖** | T0 + T2（复用 Picker 组件） |

---

### T4: 消息已送达标记
> 独立功能，放最后因涉及发送流程核心改造

| 项 | 内容 |
|---|---|
| **改动文件** | `server/src/ws.ts`（+25 行 client_message_id 支持 + message_ack/nack + excludeWs 广播）、`client/src/types.ts`（+10 行 PendingMessage 接口）、`client/src/context/AppContext.tsx`（+40 行 pendingMessages state + ADD/ACK/FAIL/REMOVE_PENDING_MESSAGE actions）、`client/src/components/MessageInput.tsx`（+30 行改为 WS 发送 + clientMessageId 生成 + 超时）、`client/src/hooks/useWebSocket.ts`（+15 行 message_ack/message_nack handler）、`client/src/components/MessageList.tsx`（+15 行合并 pending 消息渲染）、`client/src/components/MessageItem.tsx`（+20 行 ⏳/✓/❌ 图标 + 重试按钮）、`client/src/index.css`（+10 行状态图标样式） |
| **预估行数** | ~165 行 |
| **验证方式** | 发送消息 → 短暂显示 ⏳ → 收到 ack 后变为 ✓；断开 WS 后发送 → 10 秒后显示 ❌；点击重试正常恢复；DevTools 验证发送者不收到自己的 new_message 广播；快速连续发送不产生重复消息 |
| **依赖** | T0（excludeWs + sendWsMessage + 去重） |

---

### 依赖关系图

```
T0 (基础设施)
├── T1 (Typing Indicator)
├── T2 (Emoji Picker)
│     └── T3 (Reactions)  ← 复用 Picker
└── T4 (送达标记)
```

### 总预估

| Task | 行数 | 新文件数 | 改动文件数 |
|------|------|---------|-----------|
| T0 | ~60 | 0 | 3 |
| T1 | ~120 | 1 | 5 |
| T2 | ~80 | 0 | 2 |
| T3 | ~315 | 2 | 7 |
| T4 | ~165 | 0 | 6 |
| **合计** | **~740** | **3** | — |
