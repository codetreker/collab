Good — I now have the full picture. Here's the task list:

---

## P6 Slash Commands — Task Breakdown

### Task 1: Command Registry (`CommandRegistry` class + types)
- **文件**: 新建 `packages/client/src/commands/registry.ts`
- **行数**: ~50 行
- **内容**: `CommandDefinition`, `CommandContext`, `CommandError` 接口/类 + `CommandRegistry` 类 (register/get/search/all) + singleton export
- **依赖**: 无
- **验证**: 单元测试 — register、get、search 返回正确结果

### Task 2: 5 个内置命令定义
- **文件**: 新建 `packages/client/src/commands/builtins.ts`
- **行数**: ~80 行
- **内容**: 注册 help/invite/leave/topic/dm 的 `CommandDefinition`，每个命令的 `execute` 函数
- **依赖**: Task 1 (registry)
- **验证**: 导入后 `commandRegistry.all().length === 5`；每个命令的 execute 逻辑可单独测试

### Task 3: `useSlashCommands` hook
- **文件**: 新建 `packages/client/src/hooks/useSlashCommands.ts`
- **行数**: ~90 行
- **内容**: 输入 `/` 检测、命令过滤、selectedIndex、ArrowUp/Down/Tab/Enter/Esc 键盘导航、空状态标记
- **依赖**: Task 1 (registry.search)
- **验证**: hook 测试 — 输入 `/in` 过滤出 invite；空格后关闭 picker；Esc 关闭

### Task 4: `SlashCommandPicker` 组件
- **文件**: 新建 `packages/client/src/components/SlashCommandPicker.tsx`
- **行数**: ~70 行
- **内容**: 弹出面板 UI（参考 `MentionPicker` 样式），显示命令名 + description，高亮选中项，空状态 "没有找到命令"
- **CSS**: 在现有样式文件中添加 `.slash-command-picker` 等 ~30 行
- **依赖**: Task 1 (CommandDefinition 类型)
- **验证**: 手动 — 输入 `/` 看到 5 个命令列表；输入 `/t` 过滤出 topic；无匹配显示空状态

### Task 5: MessageInput 集成 — 触发 + picker 展示
- **文件**: 修改 `packages/client/src/components/MessageInput.tsx`
- **行数**: ~40 行改动
- **内容**:
  - 引入 `useSlashCommands` hook 和 `SlashCommandPicker`
  - `handleChange` 中增加 `/` 触发检测（与 `@` mention 互斥：`/` 优先）
  - `handleKeyDown` 中 slash picker active 时委托给 hook 的 keyboard handler（优先于 mention）
  - JSX 中 MentionPicker 前插入 `<SlashCommandPicker />`
- **依赖**: Task 3, Task 4
- **验证**: 手动 — 输入 `/` 出现 picker，键盘导航正常，Esc 关闭，Tab/Enter 选中命令插入输入框

### Task 6: 命令执行 — handleSubmit 拦截
- **文件**: 修改 `packages/client/src/components/MessageInput.tsx` 的 `handleSend`
- **行数**: ~30 行改动
- **内容**:
  - 检测 `text.startsWith('/')` + 解析 commandName/args
  - `commandRegistry.get(name)` 存在则构建 `CommandContext` 并 execute
  - 成功 → 清空输入；失败 → 显示 inline error
  - 未知命令 → 作为普通消息发送（不拦截）
- **依赖**: Task 1, Task 2, Task 5
- **验证**: 输入 `/help` + Enter 不发送消息，显示系统消息；输入 `/foo` 作为普通消息发送

### Task 7: AppContext — `INSERT_LOCAL_SYSTEM_MESSAGE` action
- **文件**: 修改 `packages/client/src/context/AppContext.tsx`
- **行数**: ~15 行
- **内容**: 新增 `INSERT_LOCAL_SYSTEM_MESSAGE` action type + reducer case（往 channel messages 追加 `{ type: 'system', persisted: false }` 的本地消息）
- **依赖**: 无（可与 Task 1 并行）
- **验证**: dispatch 该 action 后 messages list 中出现 system 消息

### Task 8: `/help` 和 `/dm` 命令端到端
- **文件**: `builtins.ts`（已在 Task 2 定义，此 task 确保端到端可用）
- **行数**: 0（逻辑已在 Task 2，此为集成验证）
- **依赖**: Task 6, Task 7
- **验证**:
  - `/help` → 出现本地系统消息列出 5 个命令
  - `/dm @alice` → 跳转到与 alice 的 DM（复用 `actions.openDm`）

### Task 9: `/invite` 和 `/leave` 命令端到端
- **文件**: `builtins.ts`（execute 中调用 `api.addChannelMember` / `api.leaveChannel`）
- **行数**: 0（API 已存在：`addChannelMember`, `leaveChannel`）
- **依赖**: Task 6
- **验证**:
  - `/invite @bob` → bob 被加入频道（API 200）
  - `/leave` → 弹出确认框 → 确认后离开频道并跳转
- **后端**: 无新增，现有 `POST /channels/:id/members` 和 `POST /channels/:id/leave` 已可用

### Task 10: `/topic` 命令端到端
- **文件**: `builtins.ts` execute 调用 `api.updateChannel`
- **行数**: ~5 行
- **依赖**: Task 6
- **验证**: `/topic New topic` → channel topic 更新（API `PUT /channels/:id` 已存在且接受 topic 字段）
- **后端**: 已有 `updateChannel` API，`Channel` 类型已含 `topic` 字段，**无需后端改动**

### Task 11: 用户参数命令的 MentionPicker 复用
- **文件**: 修改 `MessageInput.tsx`
- **行数**: ~20 行
- **内容**: `/invite ` 和 `/dm ` 后进入参数阶段，触发 MentionPicker（复用现有 `@` 逻辑），选中用户后 `resolvedUser` 存入 hook state
- **依赖**: Task 5, Task 6
- **验证**: 输入 `/invite ` 后弹出用户列表，选择后自动填入 `@username`

### Task 12: 错误处理 + inline error UI
- **文件**: 修改 `MessageInput.tsx`
- **行数**: ~20 行
- **内容**: catch `CommandError`（缺参数）和 `ApiError`（后端失败），在输入框下方显示短暂错误提示（复用 `send-status-error` 样式）
- **依赖**: Task 6
- **验证**: `/invite` 无参数 → "Usage: /invite @user"；API 403 → 显示服务器错误消息

---

## 依赖关系图

```
Task 1 (registry) ──┬── Task 2 (builtins) ──┐
                    ├── Task 3 (hook)       ├── Task 5 (MessageInput集成) ── Task 6 (执行拦截)
                    └── Task 4 (picker)     ┘         │
Task 7 (system msg action) ─────────────────────────  │
                                                       ├── Task 8  (/help, /dm e2e)
                                                       ├── Task 9  (/invite, /leave e2e)
                                                       ├── Task 10 (/topic e2e)
                                                       ├── Task 11 (user-param 参数阶段)
                                                       └── Task 12 (错误处理)
```

## 总结

- **新建文件**: 4 个（registry.ts, builtins.ts, useSlashCommands.ts, SlashCommandPicker.tsx）
- **修改文件**: 2 个（MessageInput.tsx, AppContext.tsx）+ CSS
- **后端改动**: 无（现有 API 全覆盖）
- **总预估**: ~420 行新代码 + ~30 行 CSS
- **关键路径**: Task 1 → 2/3/4 → 5 → 6 → 8/9/10/11/12（Task 7 可并行）
