I've read both design docs and explored the codebase. Here's the full task breakdown:

---

## P1 Task List — Agent 归属与权限系统

### T1 — 数据库迁移：P1 schema 扩展

- **文件**：`packages/server/src/db.ts`
- **改动**：
  - `users` 表加 `owner_id` 列 + 索引
  - 新建 `user_permissions` 表 + 索引
  - 新建 `invite_codes` 表 + 索引
  - 回填现有用户默认权限（`INSERT OR IGNORE`）
  - 回填现有频道 Creator 权限
- **预估行数**：~120 行（SQL + 幂等检查逻辑）
- **验证**：启动 server，`PRAGMA table_info(users)` 确认 `owner_id`；查 `user_permissions` 表确认回填数据；重复启动不报错（幂等）
- **依赖**：无

---

### T2 — 权限中间件 `requirePermission`

- **文件**：
  - 新建 `packages/server/src/middleware/permissions.ts`（或直接放 `auth.ts`）
  - `packages/server/src/routes/channels.ts`（挂载中间件）
- **改动**：
  - 实现 `requirePermission(permission, scopeResolver?)` Fastify preHandler
  - admin 短路通过；其余查 `user_permissions` 表
  - 在 channel create/delete/update/manage_members 路由挂载
- **预估行数**：~60 行（中间件）+ ~30 行（路由改造）
- **验证**：单测覆盖 admin 短路 / member 有权 / member 无权 / scope 通配 vs 精确匹配；无权限用户请求返回 403
- **依赖**：T1

---

### T3 — 默认权限授予 + Creator 权限 helper

- **文件**：
  - `packages/server/src/queries.ts`（新增 helper 函数）
  - `packages/server/src/routes/channels.ts`（创建频道后调用 Creator 权限授予）
- **改动**：
  - `grantDefaultPermissions(userId, role)` — 注册/Agent 创建时插入默认权限
  - `grantCreatorPermissions(creatorId, creatorRole, channelId, ownerIdIfAgent?)` — 频道创建后授 `channel.delete/manage_members/manage_visibility`
  - member 创建 → 权限归 member；agent 创建 → 权限归 owner
- **预估行数**：~80 行
- **验证**：单测：member 创建频道得 3 项 scoped 权限；agent 创建频道 owner 得权限、agent 不得
- **依赖**：T1

---

### T4 — 邀请码 CRUD + 注册端点

- **文件**：
  - `packages/server/src/auth.ts`（新增 `POST /api/v1/auth/register`）
  - `packages/server/src/routes/admin.ts`（邀请码 CRUD）
  - `packages/server/src/queries.ts`（邀请码查询）
- **改动**：
  - `POST /api/v1/admin/invites` — 生成 16 字符随机码
  - `GET /api/v1/admin/invites` — 列表
  - `DELETE /api/v1/admin/invites/:code` — 作废
  - `POST /api/v1/auth/register` — 校验邀请码+邮箱唯一，事务内注册+授权+消费码+加入 #general
  - 注册端点速率限制（IP 10/min）
- **预估行数**：~200 行
- **验证**：集成测试：生成码→注册成功→码作废→重复注册失败；过期码拒绝；并发同码只成功一个
- **依赖**：T1, T3

---

### T5 — Agent CRUD API

- **文件**：
  - 新建 `packages/server/src/routes/agents.ts`
  - `packages/server/src/index.ts`（注册路由）
  - `packages/server/src/queries.ts`（Agent 查询）
- **改动**：
  - `POST /api/v1/agents` — 创建 agent（设 `owner_id`、`role=agent`、生成 api_key、默认权限）
  - `GET /api/v1/agents` — 列出 owner 的 agents（admin 可查全部）
  - `DELETE /api/v1/agents/:id` — owner 或 admin 删除
  - `POST /api/v1/agents/:id/rotate-api-key` — 轮换密钥
  - `GET /api/v1/agents/:id/permissions` — 查看 agent 权限
  - `PUT /api/v1/agents/:id/permissions` — 全量覆盖 agent 权限
- **预估行数**：~250 行
- **验证**：单测：member 创建 agent 成功、agent 有 owner_id、api_key 只返回一次；非 owner 删除返回 403；rotate 后旧 key 失效
- **依赖**：T1, T2, T3

---

### T6 — Agent 入频道校验

- **文件**：
  - `packages/server/src/routes/channels.ts`（修改 create + add member）
  - `packages/server/src/queries.ts`（`validateAgentMembership` helper）
- **改动**：
  - 抽取 `validateAgentMembership(caller, agentUser, channelId, memberIds)`
  - `POST /channels` 创建时：遍历 `member_ids`，对 `role=agent` 用户校验
  - `POST /channels/:id/members` 添加时：同样校验
  - 校验规则：caller 必须是 agent 的 owner（或 admin）；owner 必须已在频道内或同批加入
- **预估行数**：~60 行
- **验证**：单测：非 owner 拉 agent → 403；owner 不在频道 → 409；owner 同批加入 → 成功
- **依赖**：T5

---

### T7 — 频道删除端点权限化 + 读取端 `deleted_at` 过滤核查

- **文件**：
  - `packages/server/src/routes/channels.ts`
  - `packages/server/src/queries.ts`
- **改动**：
  - DELETE 端点改用 `requirePermission('channel.delete', scopeResolver)` 替代现有 creator/admin 硬编码
  - 核查所有 channel list/get/message 查询确保 `WHERE deleted_at IS NULL`
  - 删除事务内清理该频道的 `user_permissions`（避免孤儿权限）
- **预估行数**：~40 行
- **验证**：删频道后 GET 返回 404；list 不含已删频道；#general/DM 删除返回 409；幂等（重复删返回 204）
- **依赖**：T2（可与 T5 并行）

---

### T8 — Admin API 扩展

- **文件**：
  - `packages/server/src/routes/admin.ts`
- **改动**：
  - `GET /api/v1/admin/channels` — 全部频道含 deleted_at
  - `DELETE /api/v1/admin/channels/:id/force` — 强制删除（#general 除外）
  - `POST /api/v1/admin/permissions` — 授予权限
  - `DELETE /api/v1/admin/permissions/:id` — 撤销权限
  - `PATCH /api/v1/admin/users/:id` — 改 role（现有 PUT 改为支持 role 变更）
- **预估行数**：~150 行
- **验证**：admin 可列全部频道（含已删）；非 admin 403；权限增删立即生效
- **依赖**：T2（可与 T5/T7 并行）

---

### T9 — 前端权限 hook `useCan`

- **文件**：
  - 新建 `packages/client/src/hooks/usePermissions.ts`
  - `packages/client/src/lib/api.ts`（新增获取当前用户权限 API 调用）
  - `packages/client/src/context/AppContext.tsx`（state 加 `permissions`）
  - `packages/client/src/components/ChannelMembersModal.tsx`（按钮条件渲染）
  - `packages/client/src/components/Sidebar.tsx`（按钮条件渲染）
- **改动**：
  - 登录后拉取当前用户权限列表缓存到 context
  - `useCan(permission, scope?)` hook：admin 恒 true，其余查本地权限
  - 删除按钮、管理成员按钮等根据 `useCan` 显示/隐藏
- **预估行数**：~100 行
- **验证**：member 无 `channel.delete` 权限时看不到删除按钮；creator 能看到；admin 恒看到；点击后端 403 时优雅提示
- **依赖**：T2（API 稳定后）

---

### T10 — 前端 `/admin` 路由 + 4 个管理页面

- **文件**：
  - `packages/client/src/components/AdminPage.tsx`（重构/扩展）
  - 新建 `packages/client/src/components/admin/AdminLayout.tsx`
  - 新建 `packages/client/src/components/admin/UsersPage.tsx`
  - 新建 `packages/client/src/components/admin/InvitesPage.tsx`
  - 新建 `packages/client/src/components/admin/ChannelsPage.tsx`
  - 新建 `packages/client/src/components/admin/PermissionsPage.tsx`
  - `packages/client/src/App.tsx`（路由切换逻辑）
  - `packages/client/src/lib/api.ts`（admin API 调用）
- **改动**：
  - AdminLayout 带侧边 tab 导航（Users / Invites / Channels / Permissions）
  - 非 admin 访问重定向回主页
  - 每个页面：表格 + 操作按钮（CRUD）
  - 用户页：列表、改 role、禁用
  - 邀请码页：生成、列表、作废
  - 频道页：全部频道（含已删）、强制删除
  - 权限页：按用户查看/授予/撤销
- **预估行数**：~500 行
- **验证**：浏览器中 admin 登录 → 进入 /admin → 四个 tab 均可操作；非 admin 看不到入口
- **依赖**：T8（可与 T9 并行）

---

### T11 — 前端邀请码注册页

- **文件**：
  - 新建 `packages/client/src/components/RegisterPage.tsx`
  - `packages/client/src/components/LoginPage.tsx`（加"注册"链接）
  - `packages/client/src/App.tsx`（路由切换）
  - `packages/client/src/lib/api.ts`（register API）
- **改动**：
  - 注册表单：invite_code + email + password + display_name
  - 成功后自动登录跳转主页
  - Login 页面加 "有邀请码？去注册" 入口
- **预估行数**：~120 行
- **验证**：用有效邀请码注册成功并自动登录；无效码报错；已用码报错
- **依赖**：T4（可与 T10 并行）

---

### T12 — 前端 Agent 管理页面

- **文件**：
  - 新建 `packages/client/src/components/AgentManager.tsx`
  - `packages/client/src/components/Sidebar.tsx`（入口）
  - `packages/client/src/lib/api.ts`（agent API 调用）
- **改动**：
  - Agent 列表（当前用户拥有的）
  - 创建 Agent（display_name, avatar_url）→ 显示一次性 api_key
  - 删除 Agent
  - 轮换 API key
  - 查看/编辑 Agent 权限
- **预估行数**：~200 行
- **验证**：member 创建 agent → 列表显示 → api_key 只展示一次 → 删除后消失；拉 agent 入频道后可发消息
- **依赖**：T5（可与 T10/T11 并行）

---

### T13 — E2E 冒烟测试 + 集成测试补全

- **文件**：
  - `packages/server/src/__tests__/` 下新建/扩展测试文件
  - 可选：Playwright e2e 脚本
- **改动**：
  - 集成测试：完整注册流、Agent 完整流、频道删除流、迁移幂等性
  - 手动冒烟：Agent API key 流、#general 删除 409、DM 删除 409
- **预估行数**：~300 行
- **验证**：`npm test` 全部通过
- **依赖**：T1-T12 全部

---

## 依赖关系图

```
T1 (DB migration)
├── T2 (permission middleware)
│   ├── T5 (Agent CRUD) ←── T3
│   │   └── T6 (Agent channel validation)
│   ├── T7 (channel delete + filter) ── 可与 T5 并行
│   ├── T8 (Admin API) ── 可与 T5/T7 并行
│   └── T9 (frontend useCan)
├── T3 (default + creator permissions)
│   └── T4 (invite codes + register) ── T1+T3
└──────────────────────────────────────────
    T10 (admin UI) ← T8       ┐
    T11 (register UI) ← T4    ├─ 可并行
    T12 (agent mgmt UI) ← T5  ┘
                                 └── T13 (E2E tests) ← all
```

**关键路径**：T1 → T2 → T5 → T6 → T13（~12h）。双人协作可将 T7/T8/T9 和 T10/T11/T12 分两条线并行推进，总工期压到 2-3 天。
