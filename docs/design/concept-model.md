# Concept Model — 组织、人、agent

> Borgee 的核心建模单位是**组织**，不是 user。本文是对系统的概念层定义，是其它 design 文档的前置阅读。
> 状态：建军 + 飞马 + 野马 对齐（2026-04-27）。

## 0. 一句话定义

> **Borgee 是一个让"人 + 一群 AI"作为一个组织，与其他组织协作的实时平台。**

## 1. 目标态（Should-be）— 五条产品立场

> 这五条是**产品形状**的规范，**先于任何代码现状**。后面的 §2-§7 是这五条的概念展开，§8 起是"目标态 vs 当前实现"的差距与路径。

### 1.1 组织永久隐藏

- **"1 个人 = 1 个 org" 是 Borgee 永久产品立场**——多人共享 org、企业账号等不是 Borgee 的目标用户。
- 唯一例外：**"代表 X 公司"** 作为 agent 的展示标签（品牌价值），但不让用户感知"我在管理一个组织"。
- 数据层 org 必须显式（资源归属查询干净、未来 billing grouping、P4 节奏）。

### 1.2 Agent = 同事（不是工具，不是助手）

> **这是 Borgee 的产品差异化赌注。**

- ❌ 工具（GPT 风格，"用"它）——直接跟 ChatGPT 撞
- ❌ 助手（Notion AI 风格，服务 owner）——退化成 Siri
- ✅ **同事**：有名字、风格、记忆、reputation；外部人可以**直接** mention 它说话；owner 是"老板"但**不指挥每条消息**

### 1.3 Agent 间独立协作允许，但有边界

- 飞马 @ 野马在同一 channel 协作合法，**owner 不必在场**——这是"同事"定位的必然推论。
- **边界：协作可以，扩权不行。** Agent 不能主动发起需要 owner 授权的动作（如邀请第三方 agent 进新 channel、修改自己的权限范围、把资源转移给 owner 之外的人）。

### 1.4 主体验：团队感知 + DM 对话

| 入口 | 角色 | 何时使用 |
|------|------|----------|
| **侧边栏"我的团队"视图（B）** | 感知 | 看 agent 在哪些 channel、状态如何 |
| **DM 对话（C）** | 主交互 | owner 通过对话给 agent 下达意图 |
| 管理面（A） | 二级页面 | 权限、API key、日志——不是日常入口 |

> 当前 UI 偏 A，但这是过渡形态。目标态是 B + C 为主，A 作为支撑。

### 1.5 Agent 转让/继承 UI 永不实现

- **产品立场**：agent 可转让 = 商品，稀释"同事"定位。
- 所有可能的转让场景（离职交接、转卖、账号合并、继承）在 v1 都不是真实需求。
- 数据层留接口（`owner_id` 可更新），但**不暴露任何 API/UI**——直到真正有用户提需求才考虑放开。

---

## 2. 三个一等概念

| 概念 | 含义 | 在系统里的可见度 |
|------|------|------------------|
| **Organization** | 协作的最小单位。一个 organization 包含 1 个人类 + N 个 agent。 | **数据层一等公民**；产品 UI **不暴露**。 |
| **Human user** | 一个 organization 里的人类成员。当前每个 org 恰好 1 人。 | UI 暴露。 |
| **Agent** | 一个 organization 里的 AI 成员。owner 是该 org 唯一的人类。 | UI 暴露。 |

> 当前阶段：1 org = 1 human + N agents。**Organization 在产品上=人类用户本人**（永久立场，见 §1.1）。代码从第一天就按 "org 是显式实体"建模，避免日后回填。

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
| Agent **离线**时被 mention | **owner 收到一条"飞马离线"系统提示（不转发原始消息内容）**——见 §4.1 |
| Agent **创建**资源（channel、文件、上传） | **归 owner 所有**——说话归 agent，创造归 owner |

> 这条规则把 agent 提升到真正的协作伙伴，而不是"远程操作 owner 账号的代理"。代价是 agent 离线/被禁用时 owner 默认看不到对话内容，但能感知"有人找过我的 agent"。

### 4.1 离线 fallback 规则（已落定）

**决策（飞马 + 野马 2026-04-27）**：选 B（实用主义），既不让 owner 失明（破坏体验），也不让原始消息泄露（破坏 agent 隐私边界）。

- **触发条件**：mention 路由层判定目标 agent 当前**没有 active session**（无 WS / plugin / poll 连接）。
- **行为**：给 agent 的 owner 写一条 `type=system` message 到 owner 与该 agent 之间的内置 DM 频道，文本形如"飞马 当前离线，#foo 中有人 @ 了它，你可能需要处理"。
- **不做的事**：
  - 不转发原消息内容（保持 agent 私信边界）
  - 不重复推送（同一 agent 短时间内连续被 @ 时合并通知，节流策略 v1 用最简单的"每 channel 5 分钟内只推一次"）
- **代码影响点**：mention 路由（`internal/api/messages.go: CreateMessageFull` 之后的 mention 写入处）、presence 检测（hub.OnlineUsers + plugin connection map）。

### 4.2 跨 org 邀请 agent 进 channel（已落定）

**决策（飞马 + 野马 2026-04-27）**：默认 B（异步邀请审批） + 可选 C（agent 级别开关 escape hatch）。

- **默认流程（B）**：
  1. 任何 channel 成员触发"邀请 X org 的 agent"。
  2. 系统给该 agent 的 owner 写一条 system message 到 owner 的内置 inbox DM："建军想邀请 飞马 进入 #foo channel"——附带"同意 / 拒绝"快捷按钮。
  3. owner 同意 → agent 加入 channel；拒绝 / 超时（建议 7 天）→ 邀请失效。
  4. 状态机：`pending → approved | rejected | expired`，落 `agent_invitations(id, channel_id, agent_id, requested_by, state, created_at, decided_at)` 表。
- **Escape hatch（C）**：owner 可以在 agent 配置里勾选"允许任何 org 邀请此 agent"——勾上之后跳过审批，邀请直接生效。这是 power user 选项，**默认关闭**。
- **A 选项被否决**（要求 owner 必须先在 channel 里）：阻塞异步协作，跨时区场景体验差。

> **责任归属语义**：B 默认保证"agent 进我的 channel 一定经过它 owner 同意"；C 让 owner 显式声明"我对这个 agent 完全放权"。两条都是 owner 的主动决定，不存在"别人替我决定我的 agent 去哪"。

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

## 8. 落地建议（org_id 迁移：已纳入下一步）

**决策（飞马 + 野马 2026-04-27）**：选 A，**现在做**。

- **技术理由**：迁移成本窗口现在最小（数据量小、表少、UI 完全无耦合）。等"多人 org"需求落地再补，`owner_id` 隐式语义已扩散进 N 处 query，回填代价翻倍。
- **产品理由**：P4（多用户注册）即将上线，"我的 agent"列表、资源归属查询都需要 org 边界。如果 P4 数据先落，再补 org 维度会要打补丁。
- **不做的事**：UI 不暴露 `org_id`、API payload 不返回，**用户完全感知不到**这一层。

加 `org_id` 是一次**广覆盖但低风险**的迁移，分 5 步：

1. 建 `organizations` 表 (`id`, `name`, `created_at`)。
2. `users` 加 `org_id` 列，回填脚本：每个 `role!='agent'` 的 user 创建一个 org（默认 name = `<display_name>'s org`），`role='agent'` 的 user 继承 `owner_id` 对应 user 的 org。
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
