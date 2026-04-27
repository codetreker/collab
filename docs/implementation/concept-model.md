# Implementation · Concept Model

> 蓝图: [`../blueprint/concept-model.md`](../blueprint/concept-model.md)
> 现状: [`../current/`](../current/) — 当前 `users` 表只有 `id / role / owner_id`, 无 `organizations` 概念
> 阶段: ⚡ v0 (允许删库重建)

## 1. 现状 → 目标 概览

**现状**: organizations 概念**完全不存在**于代码——`users.owner_id` 隐式承担"agent 归属人类"的语义,但跨多个 query 都是 join `owner_id`。

**目标**: blueprint §1.1 + §2 — organizations 是数据层一等公民,UI 不暴露。所有"按 org 聚合"的查询直接 `WHERE org_id = ?`。

**主要差距**:
1. 缺 `organizations` 表
2. 缺 `users.org_id` 列(以及主要业务表的 `org_id` 索引)
3. 注册流程缺"自动建 org"逻辑
4. 跨 org 协作(blueprint §5.1, §5.2): 离线 fallback + 邀请审批 — 完全没实现

## 2. Milestones

---

### CM-1: organizations 表落地

- **目标**: blueprint §2 — organizations 数据层一等公民。
- **范围**:
  - 新建 `organizations(id TEXT PK, name TEXT, created_at INTEGER)` 表
  - `users` 加 `org_id TEXT NOT NULL` 列 + 索引
  - 主要业务表 (`channels`, `messages`, `workspace_files`, `remote_nodes`) 加 `org_id` 索引
  - 注册流程: 新 human user 自动建一个 org, agent user 继承 owner 的 org
  - admin stats endpoint 切换到 `GROUP BY org_id`
- **不在范围**:
  - UI 暴露 org_id ❌(blueprint §1.1 永远不暴露)
  - 多 user 共享 org ❌(blueprint §1.1)
  - 老数据 backfill ❌(v0 阶段, 删库重建)
- **依赖**: INFRA-1 (schema_migrations 框架)
- **预估**: ⚡ v0 阶段 3-5 天 (删库重建省去 backfill 工作)

#### PR 拆分

| PR | 内容 | Acceptance |
|----|------|-----------|
| CM-1.1 | schema: organizations 表 + users.org_id 列 + 索引 | 数据契约: 表/列/索引存在 |
| CM-1.2 | 注册流程: 自动建 org | E2E: 新注册 user 走完后, `organizations` 多一行, user 的 `org_id` 指向它 |
| CM-1.3 | admin stats: GROUP BY org_id | 蓝图行为对照: blueprint §2 "数据层一等公民"的查询路径 |

#### Acceptance spec (CM-1 整体)

- ✅ 启动后 SQLite 存在 `organizations` 表 + `users.org_id` 列 + 索引
- ✅ 新 user 注册 (human) 后, `organizations` 多一行, user.org_id = 该 org.id
- ✅ 通过 admin API 创建 agent 后, agent.org_id = owner.org_id
- ✅ `/admin-api/v1/stats` 返回值能看到"按 org 聚合"的结构
- ✅ 任何 user-facing API 响应中**不**出现 `org_id` 字段

---

### CM-2: 默认权限注册回填

- **目标**: blueprint §3 — 人类全权,agent 默认最小。
- **范围**:
  - 注册新 human user 时,在 `user_permissions` 写入 `(user_id, '*', '*')`
  - 创建 agent 时,在 `user_permissions` 写入 `(agent_id, 'message.send', '*')`
  - 删除注册时不写权限的旧逻辑
- **不在范围**:
  - 权限 UI / bundle / 动态请求 — 见 auth-permissions 模块
- **依赖**: CM-1
- **预估**: ⚡ v0 阶段 1-2 天

#### Acceptance spec
- ✅ 新注册 human, `SELECT permission FROM user_permissions WHERE user_id = ?` 返回 `*`
- ✅ 新创建 agent, 返回 `message.send`
- ✅ 蓝图行为对照: blueprint §3

---

### CM-3: 资源归属切 org_id 直查

- **目标**: blueprint §2 — agent 创建资源归 owner, 查询不绕 owner_id JOIN。
- **范围**:
  - `messages.org_id`, `channels.org_id`, `workspace_files.org_id`, `remote_nodes.org_id` 在写入时填好
  - admin stats 之外的"按 owner 聚合"查询切到 `WHERE org_id = ?`
- **不在范围**:
  - 删 `owner_id` 字段 ❌(v0 阶段也保留, 它是不同语义: agent 归属哪个 user)
- **依赖**: CM-1
- **预估**: ⚡ v0 阶段 1 周

#### Acceptance spec
- ✅ 创建 message/channel/file 时, `org_id` 自动填上 (sender 的 org_id)
- ✅ "我的 channel" 查询: `WHERE org_id = ?` 替代 `JOIN owner_id`
- ✅ 行为对照: blueprint §2 直查

---

### CM-4: 跨 org 协作可见 ⭐

> 这是 concept-model 模块的**产品标志性 milestone**——前 3 个用户无感, CM-4 一次性把"agent 同事感"演示出来。

- **目标**: blueprint §5.1 + §5.2 — 离线 fallback + 跨 org 邀请审批。
- **范围**:
  - 离线检测: presence map (in-process), agent 无 active session 即"离线"
  - 离线 fallback: 给 owner 写 system message 到内置 DM, 5 分钟节流
  - `agent_invitations` 表 + 状态机 (`pending/approved/rejected/expired`)
  - 邀请审批 UI: owner 在 inbox DM 收到带 quick action 的通知
  - 接受邀请后 agent 自动加入 channel
- **不在范围**:
  - "Escape hatch (允许任何人邀请)" 开关 ❌(blueprint §5.2 power user, v1+)
  - 邀请通知的 push notification ❌(等 client-shape 模块)
- **依赖**: CM-1, CM-2, agent-lifecycle 部分(presence)
- **预估**: ⚡ v0 阶段 1-2 周

#### PR 拆分

| PR | 内容 |
|----|------|
| CM-4.1 | 离线检测 + system message 写入 + 5 分钟节流 |
| CM-4.2 | `agent_invitations` 表 + 创建/同意/拒绝 API |
| CM-4.3 | 邀请通知 UI: inbox DM 中的 quick action message |
| CM-4.4 | 接受邀请后 agent join channel 的端到端流 |

#### Acceptance spec (CM-4 整体, E2E)

> **可演示的端到端**:
>
> 1. 用户 A 创建 channel `#foo`
> 2. 用户 A 想邀请用户 B 的 agent (B-bot) 加入
> 3. A 触发邀请 → 系统给 B 写一条 system message "A 想邀请 B-bot 进 #foo"
> 4. B 在他的 inbox DM 看到通知, 点【同意】
> 5. B-bot 自动加入 #foo, 出现在成员列表
> 6. 用户 A 在 #foo 中 @ B-bot, 但 B-bot 离线
> 7. 5 秒内, B 收到 system message "B-bot 当前离线, #foo 中有人 @ 了它"
> 8. A 短时间内再 @ B-bot 5 次, B 不会再收到通知 (5 分钟节流)
>
> 整个 E2E 跑过 = CM-4 完成。

---

## 3. 模块完成判定

CM-1 ~ CM-4 全部 acceptance spec 通过 → concept-model 模块可发版。

完成后:
- `../current/` 中关于 user 身份模型的描述需要更新 (但本文档不维护 current, 由实施时 audit)
- blueprint/concept-model.md 中 §7 差距表中所有"❌"都变成"✅"

## 4. 不在 concept-model 范围

- 跨 org 邀请的 push notification → client-shape
- 权限的 UI bundle → auth-permissions
- agent 状态四态 / 故障态 → agent-lifecycle
- artifact 归属 → canvas-vision
