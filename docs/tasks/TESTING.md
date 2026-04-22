# Collab 测试指南

## 环境

| 环境 | URL | 说明 |
|------|-----|------|
| Staging | `https://staging-collab.codetrek.cn` | 自动部署（pipeline），手动重启容器 |
| Prod | `https://collab.codetrek.cn` | 建军 approve 后部署 |
| Admin | `jianjun@codetrek.work` | 管理员账号 |
| 测试邮箱 | `oc-test@codetrek.work` | himalaya config `collab-test` |

## 前置条件

- Playwright: `/usr/bin/google-chrome-stable`
- Node ws: `/workspace/collab/node_modules/.pnpm/ws@8.20.0/node_modules/ws`
- API key: 从 `/api/v1/admin/users` 获取（staging 和 prod 不同）
- **每次登录用新 cookie，不复用**

## E2E 测试清单

### 基础功能

| ID | 功能 | 验证方法 | 期望 |
|----|------|----------|------|
| T-001 | 登录 | POST /auth/login | 200 + set-cookie |
| T-002 | 注册（邀请码） | POST /auth/register | 201 + 新用户在 #general |
| T-003 | 邀请码复用 | 二次注册同一 code | 400/404 |
| T-004 | 频道列表 | GET /channels | 200 + 含 general |
| T-005 | 发消息 | POST /channels/:id/messages | 201 |
| T-006 | DM | POST /dm/:userId + 发消息 | 200/201 |
| T-007 | @mention | 消息含 `<@user_id>` | mentions 数组正确 |
| T-008 | 在线状态 | GET /online | user_ids 包含在线用户 |

### 权限系统 (P1)

| ID | 功能 | 验证方法 | 期望 |
|----|------|----------|------|
| T-101 | Admin 短路 | Admin 做任何操作 | 200 |
| T-102 | Member 默认权限 | channel.create | 201 |
| T-103 | Member 无权 | 访问 /admin | 403 |
| T-104 | Agent 权限 | agent 创建频道 | 403 |
| T-105 | Agent 归属 | POST /agents | 201 + owner_id |
| T-106 | 非 owner 拉 agent | 别人拉你的 agent | 403 |
| T-107 | 频道删除幂等 | DELETE 两次 | 200 → 204 |
| T-108 | #general 保护 | DELETE #general | 403 |

### 频道成员管理

| ID | 功能 | 验证方法 | 期望 |
|----|------|----------|------|
| T-201 | 创建公开频道 | visibility=public | 201 + 自动加入 |
| T-202 | 创建私有频道 | visibility=private | 201 + 只有成员 |
| T-203 | 非成员访问私有 | GET 私有频道 | 404 |
| T-204 | 添加成员 | POST /members | 201 |
| T-205 | 移除成员 | DELETE /members/:id | 200 |
| T-206 | 可见性切换 | PUT visibility | 200 |
| T-207 | 自助 join | POST /join | 200 |
| T-208 | 自助 leave | POST /leave | 200 |
| T-209 | 公开频道预览 | 非成员看 24h 消息 | 可见但不能发 |

### 消息功能

| ID | 功能 | 验证方法 | 期望 |
|----|------|----------|------|
| T-301 | 编辑消息 | PUT /messages/:id | 200 + edited_at |
| T-302 | 删除消息 | DELETE /messages/:id | 204 + 软删除 |
| T-303 | 非作者编辑 | agent 编辑别人消息 | 403 |
| T-304 | 编辑已删消息 | PUT 已删消息 | 400 |
| T-305 | Reactions | PUT /messages/:id/reactions | 200 + emoji |
| T-306 | 删 Reaction | DELETE /messages/:id/reactions | 200 |
| T-307 | **文件路径链接** | 消息含 /workspace/path | ⚠️ BUG: 不可点击 |
| T-308 | **Markdown 渲染** | 发送 markdown 内容 | ⚠️ BUG: 渲染不对 |

### Workspace (B20)

| ID | 功能 | 验证方法 | 期望 |
|----|------|----------|------|
| T-401 | 创建目录 | POST /workspace/mkdir | 201 |
| T-402 | 上传文件 | POST /workspace/upload | 201 |
| T-403 | 列出文件 | GET /workspace | files 数组 |
| T-404 | 下载文件 | GET /workspace/files/:id | 200 |
| T-405 | 重命名 | PATCH /workspace/files/:id | 200 |
| T-406 | 移动 | POST /workspace/files/:id/move | 200 |
| T-407 | 删除 | DELETE /workspace/files/:id | 204 |

### UX

| ID | 功能 | 验证方法 | 期望 |
|----|------|----------|------|
| T-501 | Emoji Picker | 点击弹出 | emoji-mart 网格 |
| T-502 | Slash Commands | 输入 / | 5 个命令列表 |
| T-503 | 消息送达 ✓ | 发送后 | ⏳ → ✓ |
| T-504 | 移动端布局 | 390x844 视口 | hamburger + 响应式 |
| T-505 | PWA manifest | link[rel=manifest] | name="Collab" |
| T-506 | Tiptap 编辑器 | ProseMirror 检测 | 替换 textarea |
| T-507 | 格式工具栏 | B/I/code 按钮 | 7 个按钮 |
| T-508 | **Enter 发送** | Enter 键 | ⚠️ BUG: 应为 Enter 发送 |
| T-509 | **亮色主题** | 切换亮色 | ⚠️ BUG: 侧边栏仍暗色 |

### SSE / WS

| ID | 功能 | 验证方法 | 期望 |
|----|------|----------|------|
| T-601 | SSE 连接 | GET /stream | :connected |
| T-602 | SSE 实时推送 | 发消息后 SSE 收到 | < 1s |
| T-603 | Last-Event-ID | 断线续传 | 补发事件 |
| T-604 | Poll 兼容 | POST /poll | cursor + events |
| T-605 | WS Plugin | wss://host/ws/plugin | 连接保持 |

## 已知 Bug

| ID | 描述 | 来源 | 状态 |
|----|------|------|------|
| BUG-001 | 删除消息不限制只能删自己的 | 建军 04-22 | 战马在修 |
| BUG-002 | 文件路径没有变成可点击链接 | 建军 04-22 | 待修 |
| BUG-003 | 亮色主题下侧边栏仍暗色 | 建军 04-22 | 待修 |
| BUG-004 | Enter/Ctrl+Enter 行为反了 | 建军 04-22 | 待修 |
| BUG-005 | Markdown 渲染不对 | 建军 04-22 | 待修 |

## 清理

测试完清理创建的频道、用户、文件（staging 共享环境）。
