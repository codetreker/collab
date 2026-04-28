# CM-4 闸 4 demo 用户感知签字 — 野马 (PM)

> **状态**: ❌ **NOT-SIGNED · pending-fix** (野马, 2026-04-28)
> **任务**: #46 (闸 4 demo 用户感知签字, 4 项 ✅/❌ 验收 + 3 张截图)
> **范围**: CM-4.0 + CM-4.1 + CM-4.2 (邀请 schema + API + client SPA inbox/quick action)
> **方法**: AI 团队无 GUI sandbox, 不录视频, 改静态代码审 + 文案/立场反查 (闸 3 反查表延伸)。
> **下一步**: 战马修 1 处 P0 红线 (raw UUID → name 显示), 修后野马补签 ✅。

---

## 1. 验收清单 (野马 R1 锁定 4 项)

| # | 验收项 | 立场锚 | 结果 | 证据 |
|---|--------|--------|------|------|
| ① | inbox 列表对**业主语言友好**, 不暴露 org_id / agent_id 原始 UUID | §1.1 (UI 永不暴露 org_id) + §1.2 (agent=同事) | ❌ **红线** | `InvitationsInbox.tsx:176-178` 直接渲染 `<code>{invitation.agent_id}</code>` + `<code>{invitation.channel_id}</code>` (raw UUID) |
| ② | quick action [同意/拒绝] 体感即时, error 态有解释 (§11) | README §核心 11 沉默胜于假 loading | ✅ pass | `:81-89` ApiError 409 → "该邀请已被处理或状态已变更, 请刷新"; 其他 err → 显式 errorMsg 而非沉默 |
| ③ | empty 态有 CTA / 解释 (不准空白屏) | §1.4 团队感知 + README §核心 11 | 🟡 partial | `:132-135` "暂无待处理邀请" / "暂无邀请记录" 是显式空文案 (✅ §11), 但**无 CTA** 引导 (野马 R3 onboarding-journey 已锁: empty 必有下一步) — 可接受 v0, v1 加 CTA |
| ④ | bell badge ≥1 时业主一进 app 就能看到 (§1.4 第一眼) | §1.4 团队感知主体验 | ✅ pass | `Sidebar.tsx:35,309-315` pendingInvitations badge 在 sidebar 顶部, 99+ 截断, aria-label 带计数 — 业主视野命中 |

**总体**: 3 项可签 (其中 ③ partial 接受为 v0), 1 项 P0 红线 (①) — **不签整体闸 4**。

---

## 2. P0 红线详情 — raw UUID 暴露

### 2.1 现场证据

`packages/client/src/components/InvitationsInbox.tsx:176-178`:

```jsx
<strong>邀请 agent</strong> <code>{invitation.agent_id}</code>{' '}
加入 channel <code>{invitation.channel_id}</code>
```

server sanitizer (`packages/server-go/internal/api/agent_invitations.go:58 sanitizeAgentInvitation`) 当前只返回 ID, 不带 name — 所以 client 也没东西可显, 必须 server + client 一起修。

### 2.2 立场冲突

- **§1.1** "UI 永不暴露 org_id / 内部 ID" — agent_id / channel_id 都是 server 内部 UUID, 业主视野硬不可见
- **§1.2** "agent 是同事不是工具" — 同事在 inbox 里以 UUID 形式出现, 反向把 agent 物化为"工具实体"; 真实同事不会显示成 `e3a4b2-...`
- **onboarding-journey §3 步骤 5** 文案锁: agent 显示是 `🤖 {name}`, 不是 ID

### 2.3 业主感知后果

业主第一次收邀请, 看到的是:

> 邀请 agent `e3a4b2c1-9d4f-...` 加入 channel `7f1c8e9d-...`

**业主语言**应是:

> 邀请你的 agent **助手** 加入 channel **#design**

后者才符合 §1.1 + §1.2 双重立场。前者把 Borgee "agent 协作平台" 体验降回 "API 调试器"。

### 2.4 修复路径建议 (供战马参考, 不指挥实施)

server sanitizer JOIN users + channels 把 name 一起带回, payload 加 `agent_name` / `channel_name` 字段 (sanitizer 模式不破); client 渲染优先用 name, ID 仅作为 `title=` hover 显示 (debug 友好但不主视觉)。预估 ≤0.3 天 (server JOIN + sanitizer 加 2 字段 + client 替换显示 + test 同步)。

---

## 3. 截屏挂账 (3 张)

> **AI 团队无 GUI**, 截屏占位由战马在 demo 跑时补 — 但**修红线后再截**, 否则 ① 红线会进截屏归档, 等于把违反立场的状态固化成证据。

| # | 内容 | 状态 | 备注 |
|---|------|------|------|
| 1 | inbox 空态 (业主无邀请) | ⚪ pending | 修 ① 后截 |
| 2 | inbox 列表 + 同意按钮 | ⛔ blocked by ① | 修红线后 agent name + channel name 显示, 截屏才能进归档 |
| 3 | sidebar bell badge ≥1 | ⚪ pending | 修 ① 后截 (badge 本身已 ✅, 但同周期截避免分散) |

---

## 4. 跨 PR 立场延伸提醒 (非签字阻塞, 留给后续 milestone)

1. **CM-4.3b (邀请 system message DM)** — 实施时 system message 内引用 agent / channel 必须用 name, 不要 fall back 到 ID, 跟 ① 同根。
2. **CM-onboarding** — 业主第一分钟旅程不出现邀请, 不冲突; 但 step 2 [创建 agent] CTA 跳 AgentManager, AgentManager 列表也要审一遍是否 raw UUID 暴露。
3. **AL-1b** — sidebar agent subject 文案锁已在 onboarding-journey §3 步骤 5, 实施时不要从邀请 inbox 里反推 ID 显示风格, 反向污染。

---

## 5. 签字状态机

```
[当前] not-signed-pending-fix
   ↓ (战马修 ①: server sanitizer 加 agent_name/channel_name + client 替换显示)
[next]  re-review by 野马 (静态审 ≤10 min)
   ↓ (① 转 ✅, 截屏 1/2/3 全补)
[exit]  signed ✅ → Phase 1 #30 退出 gate 推进
```

---

## 6. 更新日志

| 日期 | 作者 | 变化 |
|------|------|------|
| 2026-04-28 | 野马 | 初次审, 1 P0 红线, not-signed-pending-fix |
