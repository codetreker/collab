# Acceptance Template — DM-2: mention (@user / @agent / @channel)

> 蓝图: `concept-model.md` §4 (agent 代表自己 — mention 只 ping 目标, 不抄送 owner) + §4.1 (agent 离线 fallback — owner 系统 DM + 节流 5 分钟/channel + ❌ 不转发原始内容) + 野马 #211 ADM-0 反查 (mention 路由按 sender_id, 不展开到 owner)
> Implementation: `docs/implementation/modules/dm-2-spec.md` _(待 战马B 落, 当前蓝图行 + #211 反查表锚)_
> 拆 PR (拟): **DM-2.1** mention parse + 持久化 + 通知路由 (server) + **DM-2.2** offline fallback system DM + 节流 + **DM-2.3** client SPA mention 渲染 (display name / 不漏 UUID)
> Owner: 战马B 实施 (待 spawn) / 烈马 验收

## 验收清单

### 数据契约 (蓝图 §4 — mention 路由按 sender_id)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 1.1 message 落库时, server 解析 body 中 `@<user_id>` token → 写入 `message_mentions(message_id, target_user_id)` (一行一目标, 重复 mention 同 target dedup) | unit + migration test | 战马B / 烈马 | _(待 DM-2.1 PR)_ |
| 1.2 mention 解析对 user / agent **同表同语义** (`users.role` 不影响 parse — 立场 ⑥ agent=同事) | unit (table-driven) | 战马B / 烈马 | _(待 DM-2.1 PR)_ |
| 1.3 反向断言: mention 路由**永不**写 `target_user_id = agent.owner_id` (除非 §4.1 offline fallback 触发, 走独立 `system` message) | unit + grep | 飞马 / 烈马 | _(待 DM-2.1 PR)_; `grep -nE 'mention.*owner_id\|owner_id.*mention' packages/server-go/internal/api/messages.go` count==0 |

### 行为不变量 (蓝图 §4 / §4.1 — 路由 + 离线 fallback)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 2.1 `@<agent_id>` 在线 → 仅 agent 收到 WS frame (不抄送 owner); owner WS sniff count==0 | e2e | 战马B / 烈马 | _(待 DM-2.1 PR)_ |
| 2.2 `@<agent_id>` 离线 (无 WS / plugin / poll) → owner 收到 1 条 `type=system` message 到 owner↔agent 内置 DM, 文案锁: `{agent_name} 当前离线，#{channel} 中有人 @ 了它，你可能需要处理` (byte-identical grep) | e2e + grep | 战马B / 烈马 | _(待 DM-2.2 PR)_; `grep -nE '当前离线，#.*中有人 @ 了它' packages/server-go/internal/api/messages.go` count≥1 |
| 2.3 节流: 同一 (agent, channel) 5 分钟窗口内只推 1 次 system DM (第 2 次 mention 在窗口内 → owner DM 行数不变) | unit (clock fixture) | 战马B / 烈马 | _(待 DM-2.2 PR)_ |
| 2.4 反约束 — 离线 fallback **不转发原消息内容**: system DM body grep 不含原 message body 字符串 (text-lock 反向) | e2e + grep | 飞马 / 烈马 | _(待 DM-2.2 PR)_; system DM payload 仅含 `{agent_name}` + `{channel_name}` 占位, 不含 raw `body` |
| 2.5 跨 org `@<agent_id>` 合法 (蓝图 §4 — agent 代表自己, 任何 org 成员可直接 mention); **责任语义**走 §4.2 邀请审批, mention 路由本身不拒 | e2e | 战马B / 烈马 | _(待 DM-2.1 PR)_ |

### 用户感知 (DM-2.3 client SPA — UI 文案 / 反 UUID 漏)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 3.1 mention render: `@<user_id>` token 在消息流渲染为 `@{display_name}` 蓝色高亮, 反向断言 — DOM grep 不含原始 UUID 字符串 (`data-mention-id` attr 可有, 文本节点不可有) | e2e + DOM assert | 战马B / 烈马 | _(待 DM-2.3 PR)_ |
| 3.2 mention 发送 UX: 输入 `@` → 候选列表含 channel members (人 + agent 同列, agent 加 🤖 badge); 选中后 textarea 回填 `@<user_id>` token (不是 display name, 防同名歧义) | e2e | 战马B / 烈马 | _(待 DM-2.3 PR)_ |
| 3.3 离线 agent 被 mention 时, 发送方 UI **无任何离线提示** (体感: 跟在线一样发, fallback 是 owner 后台事, 不污染 mention 发送方流) | e2e (反向断言, sniff DOM 无 toast/inline 提示) | 飞马 / 烈马 | _(待 DM-2.3 PR)_ |

### 蓝图行为对照 (反查锚, 每 PR 必带)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 4.a `grep -rEn 'cc.*owner\|notify.*owner_id' packages/server-go/internal/api/messages.go` count==0 (mention 路由不抄送 owner, 立场 ⑥) | CI grep | 飞马 / 烈马 | _(每 DM-2.* PR 必跑)_ |
| 4.b `grep -rEn '@channel\b' packages/server-go/ packages/client/src/` 命中行需带 `// TODO: DM-3` 或 `unsupported` 注释 (DM-2 范围只锁 `@user/@agent`, `@channel` 留 DM-3) | CI grep | 飞马 / 烈马 | _(待 DM-2.1 PR)_ |

## 退出条件

- 数据契约 3 项 + 行为不变量 5 项 + 用户感知 3 项**全绿** (一票否决)
- 反查锚 4.a-b 每 PR 必跑 0 命中 / 全注释
- 登记 `docs/qa/regression-registry.md` REG-DM2-001..010 (3 server + 5 行为 + 3 client + 1 ⏸️ `@channel` 留 DM-3)
- 蓝图行 §4.2 跨 org 邀请审批 (`agent_invitations` 表) 由 ADM-1/CHN-2 落, 不挡 DM-2 闭合; DM-2 仅锁 mention 路由本身 (蓝图 §4 / §4.1)
