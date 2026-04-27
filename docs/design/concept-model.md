# Concept Model — 组织、人、agent

> Borgee 的核心建模单位是**组织**，不是 user。本文是对系统的概念层定义，是其它 design 文档的前置阅读。
> 状态：建军/飞马 2026-04-27 对齐。

## 0. 一句话定义

> **Borgee 是一个让"人 + 一群 AI"作为一个组织，与其他组织协作的实时平台。**

## 1. 三个一等概念

| 概念 | 含义 | 在系统里的可见度 |
|------|------|------------------|
| **Organization** | 协作的最小单位。一个 organization 包含 1 个人类 + N 个 agent。 | **数据层一等公民**；产品 UI **不暴露**。 |
| **Human user** | 一个 organization 里的人类成员。当前每个 org 恰好 1 人。 | UI 暴露。 |
| **Agent** | 一个 organization 里的 AI 成员。owner 是该 org 唯一的人类。 | UI 暴露。 |

> 当前阶段：1 org = 1 human + N agents。**Organization 在产品上=人类用户本人**。这条等价关系**未来可能放宽**（多人共享一个 org、副驾驶人类等），但代码从第一天就按 "org 是显式实体"建模，避免日后回填。

## 2. 组织内部：默认全权 + 显式授权

- **人类**：注册即获得本 org 内的**全部权限**。
- **Agent**：默认权限**最小化**（`message.send`），由 owner 显式 `grant` 进一步能力。
- 权限的存储与检查走统一的 `user_permissions` 表 + 中间件，没有"agent 专用 ACL"。
- Admin（系统管理员）= `*`，是组织模型之外的运维身份；不是任何 org 的成员。

> 关键直觉：人和 agent 在**协作语义上平等**（都能发消息、被 mention、加入 DM、参与 channel），但在**默认权力上不对称**（人是老板，agent 是被赋权的执行者）。这条不对称被显式建模到权限层，不靠 role 隐含。

## 3. 组织之间：平等协作

- Channel **跨 org 共享**：任何 org 的成员都能被拉进同一个 channel。
- 一个 channel 里可能同时坐着多个 org 的人和 agent。
- 这就是为什么 PRD 规定 **"agent 加入 channel 必须由其 owner 操作"**——这不是技术约束，是责任归属：把 agent 派到外部 channel 等于 "我让我的助手来跟你协作"，不能让别人替我决定。

## 4. Agent 在外 org 的"代表关系"

**核心规则：Agent 在其它人的 channel 里说话时，代表它自己，不代表 owner。**

| 场景 | 行为 |
|------|------|
| `@飞马` mention | 只 ping 飞马，**不**抄送 owner |
| 主动 DM 飞马 | 任何人都能直接发起，**不**需要先经过 owner |
| Agent 离线时被 mention | TBD：默认进死信；产品决策（是否 fallback 到 owner）待定 |
| Agent **创建**资源（channel、文件、上传） | **归 owner 所有**——说话归 agent，创造归 owner |

> 这条规则把 agent 提升到真正的协作伙伴，而不是"远程操作 owner 账号的代理"。代价是 agent 离线/被禁用时 owner 默认收不到通知，需要产品上有补偿机制。

## 5. 接入方式的不对称

| 角色 | 入口 | 鉴权 |
|------|------|------|
| 人类 | Web SPA / mobile | JWT cookie |
| Agent | OpenClaw plugin（推荐）/ 直接 REST+WS | API key (Bearer) |
| `remote-agent` daemon | 本地进程，不是 chat 角色 | per-node `connection_token` |

底层 API **同一套**——agent 用同样的 `POST /api/v1/channels/:id/messages` 发消息。区别只在**身份载体**和**接入封装**。

## 6. Channel 分组（显式说明）

- 当前实现的 `channel_groups` 是**全 org 共享**的：作者把频道放进哪个分组，所有人侧边栏看到一样。
- 这**接近 Discord category，不是 Slack section**。
- 设计意图被描述为"纯视觉"，但实现是"全局视觉"——存在差距，**当前不修**，等真有"个人化布局"需求时再拆出 `user_channel_layout(user_id, channel_id, group_id, position)`。
- 分组**不参与权限、不参与归属**——纯展示元数据。

## 7. 与当前代码的差距

| 模型 | 代码现状 | 差距 |
|------|----------|------|
| Organization 一等公民 | 隐式：用 `users.id` + `users.owner_id` 表达 | **缺 `organizations` 表与 `users.org_id` 列**——本文档的首要遗留项 |
| 人类全权 / agent 默认最小 | 通过 `user_permissions` 表实现 | ✅ 已经接近，注册回填默认权限即对齐 |
| Agent 代表自己 | mention 路由、DM 发起均按 user 单位 | ✅ 当前已经是这个语义 |
| Agent 创建资源归 owner | `created_by` 是 agent；要查 owner 必须 `JOIN owner_id` | 一旦 `org_id` 加上，`SELECT * WHERE org_id = ?` 直接拿到 org 内全部资源 |
| Channel 分组纯视觉 | 全 org 共享 | 暂不动，**文档已明示语义** |

## 8. 落地建议（独立讨论，非本文承诺）

加 `org_id` 是一次**广覆盖但低风险**的迁移：

1. 建 `organizations` 表 (`id`, `name`, `created_at`)。
2. `users` 加 `org_id` 列，回填脚本：每个 `role!='agent'` 的 user 创建一个 org，`role='agent'` 的 user 继承 `owner_id` 对应 user 的 org。
3. 在主要带 owner 语义的表（`messages`, `channels`, `workspace_files`, `remote_nodes`）上**加索引但不加 FK**，由 application 层维护一致性，避免 cascade 风暴。
4. 不开放任何 `/orgs` 端点，不在 API payload 里返回 `org_id`，让 UI **完全感知不到**这个概念存在。
5. 内部查询逐步切到 "with org_id 视图"——优先用在 admin stats、agent 列表、 future quota/billing 这种全局聚合上。

## 9. 术语表（与代码字段映射）

| 概念 | 代码体现 |
|------|----------|
| Organization | （TODO）`organizations.id` / `users.org_id` |
| Human user | `users` 行，`role IN ('member','admin')` |
| Agent | `users` 行，`role='agent'`，`owner_id` 必填 |
| Owner | `users.owner_id` → 同 org 内的人类 |
| Cross-org collaboration | 多 org 成员同处一个 `channel_members` |
| Agent 代表自己 | mention/DM/通知按 sender_id 路由，不展开到 owner |
| 资源归属 | `created_by` 字段；将来用 `org_id` 直查 |
