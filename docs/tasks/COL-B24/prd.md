# COL-B24: 集成测试覆盖 — PRD

日期：2026-04-22 | 状态：Draft

## 背景
当前测试以单 API endpoint 为单位，覆盖了 CRUD 但没有覆盖完整的跨 API 业务流程。04-22 一天踩了多个 regression（requireMention 丢失、代码块渲染、亮色主题、Plugin 入口），根因是缺少流程级集成测试。需要补齐所有非 UI 业务逻辑的集成测试。

## 目标
所有非 UI 业务逻辑通过集成测试覆盖，覆盖率目标 ≥ 85%。

## 核心场景（必须覆盖）

### 1. 认证流程
- 注册 → 登录 → 获取 JWT → 用 JWT 访问 API
- API Key 生成 → 用 API Key 访问（Agent 场景）
- 过期/无效 token 拒绝
- 邀请码注册流程

### 2. 频道生命周期
- 创建公开/私有频道 → 加成员 → 发消息 → 编辑 → 删除消息 → 软删频道
- 公开频道预览（24h 消息，未加入用户）
- 频道成员管理（加入/离开/踢出）

### 3. 权限体系
- Admin vs Member 权限边界（admin 能做、member 不能做的全测）
- Agent 权限（通过 API Key，scope 限制）
- 消息删除权限：只能删自己的（admin 除外）
- 频道删除权限：只有 admin

### 4. 消息系统
- 发送 → 编辑 → 删除（软删除）
- @mention 解析 + 存储
- Reaction 增删
- 系统消息注入（编辑/删除通知）
- 分页加载（limit + before cursor + hasMore）
- 多页加载 cursor 正确性

### 5. requireMention 过滤
- SSE 路径：requireMention=true + 未被 @ → 不推送
- WS 路径：同上
- Poll 路径：同上
- DM 频道不受 requireMention 限制
- 三条路径行为一致

### 6. Slash Commands
- /help /invite /leave /topic /dm 解析执行
- 无效命令错误处理

### 7. Workspace 完整流程
- 上传文件 → 列表 → 下载 → 重命名 → 移动到文件夹 → 冲突处理（同名后缀）→ 删除
- 文件夹 CRUD（创建/删除/嵌套）
- 附件自动存入 Workspace
- 10MB 大小限制
- 权限隔离（不同用户的文件互不可见）

### 8. Plugin 通信
- SSE 连接 + 事件推送
- WS 连接 → 认证 → 事件推送 → request/response
- Plugin 通过 WS apiCall 发消息/reaction/编辑/删除
- 断连重连 + 心跳
- API Key 无效拒绝（close 4001）

### 9. Remote Explorer
- Node 注册 → 生成 token → WS 连接 → 认证
- 目录绑定到频道
- 文件代理读取（list/read/stat）
- Node 离线处理
- Owner only 权限

### 10. Plugin 单元测试
- outbound 逻辑（sendMessage/addReaction/editMessage/deleteMessage）
- WS client（连接/重连/apiCall/超时）
- SSE client（事件解析/cursor 管理）
- file-access（白名单校验/readFile）
- accounts（配置解析/requireMention 默认值）

## 验收标准
- [ ] 所有 10 个场景有对应的测试文件
- [ ] 每个场景的子项全部有测试用例
- [ ] 覆盖率 ≥ 85%
- [ ] CI 通过
- [ ] 现有 API 测试保留不删除

## 不在范围
- UI/前端测试（Playwright/Cypress）
- 性能测试
- 压力测试

## 成功指标
- Regression bug 数量下降
- 新功能上线前集成测试全过
