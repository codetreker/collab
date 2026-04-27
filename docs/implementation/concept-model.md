# Implementation · Concept Model

> 蓝图: [`../blueprint/concept-model.md`](../blueprint/concept-model.md)
> 现状: [`../current/`](../current/) — 当前 `users` 表只有 `id / role / owner_id`, 无 `organizations` 概念
> 阶段: ⚡ v0 (允许删库重建)
> 所属 Phase: Phase 1 (CM-1, CM-3) + Phase 2 (CM-4) — 见 [`execution-plan.md`](execution-plan.md)

## 1. 现状 → 目标 概览

**现状**: organizations 概念**完全不存在**于代码——`users.owner_id` 隐式承担"agent 归属人类"的语义, 但跨多个 query 都是 join `owner_id`。

**目标**: blueprint §1.1 + §2 + §1.2 + §5.1/§5.2 — organizations 是数据层一等公民 (UI 不暴露), agent = 同事, 跨 org 协作离线 fallback 与邀请审批可见。

**主要差距**:
1. 缺 `organizations` 表
2. 缺 `users.org_id` 列 (以及主要业务表的 `org_id` 索引)
3. 注册流程缺"自动建 org"逻辑
4. 跨 org 协作 (blueprint §5.1, §5.2): 离线 fallback + 邀请审批 — 完全没实现

> **CM-2 (默认权限注册回填) 已挪到 [`auth-permissions.md`](auth-permissions.md) 的 AP-0**, 不在本模块范围。

## 2. Milestones

---

### CM-1: organizations 表落地

- **目标**: blueprint §1.1 + §2 — organizations 数据层一等公民, 1 person = 1 org, UI 不暴露。
- **范围**:
  - 新建 `organizations(id TEXT PK, name TEXT, created_at INTEGER)` 表
  - `users` 加 `org_id TEXT NOT NULL` 列 + 索引
  - 主要业务表 (`channels`, `messages`, `workspace_files`, `remote_nodes`) 加 `org_id` 索引
  - 注册流程: 新 human user 自动建一个 org, agent user 继承 owner 的 org
  - admin stats endpoint 切换到 `GROUP BY org_id`
  - **CM-1.4 visibility checkpoint**: admin 调试页显示当前用户 `org_id + 成员数` (士气可见信号, 不是 acceptance)
- **不在范围**:
  - UI 暴露 org_id ❌(blueprint §1.1 永远不暴露)
  - 多 user 共享 org ❌(blueprint §1.1)
  - 老数据 backfill ❌(v0 阶段, 删库重建 — v0 代码债 audit 已登记)
  - 默认权限回填 ❌(挪到 auth-permissions / AP-0)
- **依赖**: INFRA-1 (schema_migrations 框架, Phase 0 退出 gate)
- **预估**: ⚡ v0 阶段 3-5 天

#### PR 拆分

| PR | 内容 | Acceptance |
|----|------|-----------|
| CM-1.1 | schema: organizations 表 + users.org_id 列 + 索引 | 数据契约: 表/列/索引存在 |
| CM-1.2 | 注册流程: 自动建 org | E2E: 新注册 user 走完后, `organizations` 多一行, user 的 `org_id` 指向它 |
| CM-1.3 | admin stats: GROUP BY org_id | 蓝图行为对照: blueprint §2 "数据层一等公民"的查询路径 |
| CM-1.4 | admin 调试页: 显示当前 user 的 org_id + 成员数 | **visibility checkpoint** (非 acceptance, 早期可见信号) |

#### Acceptance spec (CM-1 整体)

- ✅ 启动后 SQLite 存在 `organizations` 表 + `users.org_id` 列 + 索引
- ✅ 新 user 注册 (human) 后, `organizations` 多一行, user.org_id = 该 org.id
- ✅ 通过 admin API 创建 agent 后, agent.org_id = owner.org_id
- ✅ `/admin-api/v1/stats` 返回值能看到"按 org 聚合"的结构
- ✅ 任何 user-facing API 响应中**不**出现 `org_id` 字段
- 📺 (visibility) admin 调试页能显示自己的 org_id + 成员数 (CM-1.4)

---

### CM-3: 资源归属切 org_id 直查 (Phase 1 后置)

> 顺序说明: CM-3 在 **CM-4 之后** 做。理由: CM-3 是查询路径优化 (蓝图行为对照), demo 不依赖, 不应阻塞 CM-4 的产品标志性 demo。

- **目标**: blueprint §2 — agent 创建资源归 owner, 查询不绕 owner_id JOIN。
- **范围**: 拆 2 个 PR, 各自独立可合 main:
  - **CM-3.1 写路径**: `messages.org_id`, `channels.org_id`, `workspace_files.org_id`, `remote_nodes.org_id` 在创建时填好 (sender 的 org_id)
  - **CM-3.2 读路径**: admin stats 之外的"按 owner 聚合"查询切到 `WHERE org_id = ?`
- **不在范围**:
  - 删 `owner_id` 字段 ❌ (v0 阶段也保留, 它是不同语义: agent 归属哪个 user)
- **依赖**: CM-1 (org_id 列存在), CM-4 (Phase 2 已退出, 协作闭环验证完毕)
- **预估**: ⚡ v0 阶段 1 周 (CM-3.1 + CM-3.2 各 3-4 天)

#### Acceptance spec
- ✅ CM-3.1 (数据契约): 创建 message/channel/file 时, `org_id` 自动填上, NOT NULL 约束跑得过
- ✅ CM-3.2 (蓝图行为对照): 主要 "我的 channel/我的文件" 查询走 `WHERE org_id = ?`, 不再 JOIN `owner_id` (grep 代码可证)
- ✅ 行为对照: blueprint §2 直查

---

### CM-4: agent 同事感首秀 ⭐

> 这是 concept-model 模块的**产品标志性 milestone** (Phase 2 整个 Phase)——前面 CM-1 / CM-3 用户无感, CM-4 一次性把"agent 同事感"演示出来。
> **关闭前必须**: 野马跑 demo + 签字 + 留 3-5 张关键截屏 (闸 4, AI 团队不录视频)。

- **目标**: blueprint §1.2 (agent = 同事) + §5.1 (离线 fallback) + §5.2 (跨 org 邀请审批)。
- **范围**:
  - **`agent_invitations` 表 + 状态机** (`pending/approved/rejected/expired`)
  - **跨 org 邀请 API**: 创建 / 同意 / 拒绝
  - **邀请通知 UI**: owner 在 inbox DM 收到带 quick action 的 system message
  - **接受邀请后 agent 自动加入 channel**
  - **Minimal in-process presence map**: 接口契约 `IsOnline(userID) bool` + agent 连接时 register / 断开时 unregister
  - **离线检测**: agent 无 active session 即"离线"
  - **离线 fallback**: 给 owner 写 system message 到内置 DM
  - **5 分钟节流**: 同 owner+agent+channel 三元组在节流窗口内只发 1 条 system message
- **不在范围**:
  - "Escape hatch (允许任何人邀请)" 开关 ❌(blueprint §5.2 power user, v1+)
  - 邀请通知的 push notification ❌(等 client-shape 模块)
  - 完整 presence (含状态推送 / 多端) ❌(等 agent-lifecycle / realtime 模块, 本 milestone 仅最小集)
- **Presence 接口契约 (锁死, agent-lifecycle 进来时不重做)**:
  - `Presence.IsOnline(userID string) bool` — 唯一查询入口
  - `Presence.Register(userID, sessionID)` — 调用时机: agent 建立 BPP 连接后
  - `Presence.Unregister(userID, sessionID)` — 调用时机: BPP 连接断开 / heartbeat 超时
  - 实现: 进程内 `sync.Map`, 不持久化, 重启即清零 (v0 接受)
- **依赖**: CM-1 (org_id 落地)
- **预估**: ⚡ v0 阶段 2-3 周

#### PR 拆分 (顺序: 邀请 → UI → 离线 → 节流)

| PR | 内容 | Acceptance 类型 |
|----|------|---------------|
| CM-4.1 | `agent_invitations` 表 + 状态机 + 创建/同意/拒绝 API | 数据契约 + 行为不变量 (状态机非法转移单测) |
| CM-4.2 | 邀请通知 UI (inbox DM quick action) + 接受后自动 join channel | E2E: A 邀请 → B 同意 → agent 出现在 channel 成员列表 |
| CM-4.3 | minimal presence map (接口契约) + 离线检测 + system message 写入 | 数据契约 (接口存在) + E2E (离线 → owner 收到通知) |
| CM-4.4 | 5 分钟节流 + 端到端串通 + 用户感知签字 | 行为不变量 4.1 (节流计数) + 4.2 (野马签字 + 关键截屏) |

#### Acceptance spec (CM-4 整体, E2E)

> **可演示的端到端 (野马签字, 留关键截屏)**:
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
> 整个 E2E 跑过 = CM-4 完成。关键截屏 (邀请通知 / 接受后成员列表 / 离线通知 / 节流第 6 次无通知, 共 4 张) 留档 `docs/evidence/cm-4/`。

---

## 3. 模块完成判定

CM-1 + CM-3 + CM-4 全部 acceptance spec 通过 → concept-model 模块可发版。

完成后:
- `../current/` 中关于 user 身份模型的描述需要更新 (但本文档不维护 current, 由实施时 audit)
- blueprint/concept-model.md 中 §7 差距表中所有"❌"都变成"✅"

## 4. 不在 concept-model 范围

- 跨 org 邀请的 push notification → client-shape
- 默认权限注册回填 → [`auth-permissions.md`](auth-permissions.md) AP-0
- 权限的 UI bundle → auth-permissions
- agent 状态四态 / 故障态 / 完整 presence → agent-lifecycle
- artifact 归属 → canvas-vision

## 5. Blueprint 反查表 (闸 3)

| Milestone | Blueprint §X.Y | 立场一句话 |
|-----------|----------------|-----------|
| CM-1 | concept-model §1.1 + §2 | 1 person = 1 org, UI 永久不暴露; 数据层 org first-class |
| CM-3 | concept-model §2 | 资源归 org, 查询直查 org_id 不走 owner_id JOIN |
| CM-4 | concept-model §1.2 + §5.1 + §5.2 | agent 是同事不是工具, 离线 fallback 给 owner, 跨 org 邀请 owner-only |
