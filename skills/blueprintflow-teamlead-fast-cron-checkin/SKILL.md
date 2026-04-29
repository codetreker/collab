---
name: blueprintflow-teamlead-fast-cron-checkin
description: Teamlead 快节奏巡检 (15min) — idle 派活, 不只 audit。每次必须把 idle 角色派出新活。
---

# Teamlead 快节奏巡检 (fast cron)

cron 不是状态报告, 是推进动作。每次巡检必须把 idle 角色全部派出新活, 否则就是失职。

## 核心规则

### 1. cron 必须 ACT, 不只 audit
每个 idle 角色必须出新派活, 例外仅 2 种:
- 等具体阻塞 (写明 PR # / 依赖)
- 当前 in-flight 任务还没收尾

### 2. "等 X" 何时算合理 idle
**合理**: agent 真的在 wait state (持续监听任务完成 / 持续 poll PR CI 状态), 不是说完一句就停。
**不合理**: agent 发完一条消息就 idle, 没真的在等。这种要踢一下派新活。

判断方法: 如果 agent 5+ min 没新输出, 大概率是说完就停了, 派新活。merge agent 跑时其他人能并行干:
- 战马 → 下个 milestone 实施 (临时 clone 不冲突主 worktree)
- 飞马 → 下一波 spec brief / 蓝图 patch / 老 PR review
- 野马 → 下一波立场反查 / 文案锁 / demo 截屏
- 烈马 → 下一波 acceptance template / REG 翻牌 / e2e flake fix

### 3. 派活 4 选 1 优先级
按以下顺序找派活:
- a) **unblock**: 有具体 blocker 卡其他人, 优先修
- b) **follow-up**: 上一 merged PR 暴露的 issue 或留账翻牌
- c) **forward**: 下一 milestone (spec / acceptance / 实施 / stance)
- d) **maintenance**: REG audit / docs lint / out-of-date 蓝图

### 4. cron 输出格式
- 一句话报当前推进 (PR # + 1 句目标)
- Hard blocker (PR fail >30min / review >1h) 单独列详情

### 5. 何时 merge — 看任务完成度, 不只看 CI 绿

**merge gate** (一 milestone 一 PR 协议下):

CI 绿 + LGTM 齐 ≠ 可 merge. **必须看 milestone 任务真做完** — PR body Acceptance / Test plan 列的项**全部**勾完, 才能合.

**真做完的判据** (按 milestone 类型):

| milestone 类型 | "做完" 判据 |
|---|---|
| Schema + server + client 完整 | schema migration + server endpoint + client UI + e2e + docs/current sync + REG 翻 🟢 + acceptance template ⚪→✅ + PROGRESS [x] **全部齐** |
| Spec / 4 件套 | 4 件套全员都 commit 进 worktree (飞马 spec / 烈马 acceptance / 野马 stance + content-lock), 不是单独一份 |
| Closure / 翻牌 | 跟实施同 PR 装齐, 不开 follow-up |

**审 PR body 的 Acceptance + Test plan** 必看. 还有 `[ ]` 项 = **不能 merge**, 即使 CI 全绿 + 双 LGTM 也不行. 派回 author / 角色补 commit.

**反例 (永远不做)**:
- ❌ "CI 绿了 + 双 LGTM 了, 直接 squash" — 没看 Acceptance 还有 4 个 `[ ]`
- ❌ "差一点点, 先合再 follow-up" — 一 milestone 一 PR 协议下没 follow-up 余地
- ❌ "review subagent 报 LGTM, 立即 merge" — subagent 不看任务完成度, teamlead 必须自己审

**正确流程**:
1. CI 全绿 (永远不 admin/ruleset bypass — 见 `pr-review-flow`)
2. ≥1 non-author LGTM
3. **teamlead 审 PR body Acceptance + Test plan, 全勾才合**
4. 还有 `[ ]` → ping 对应角色 commit, 不 merge
5. 全勾 + 上面 1+2 → 标准 squash merge

## 派活默认列表 (按角色)

**战马 (dev)**: 当前 milestone 拆段 N+1 / 上 PR 暴露 bug 救火 / 下一 milestone schema spike
**飞马 (architect)**: review queue / 下一 spec brief / 老蓝图 patch
**野马 (PM)**: 立场反查表 / demo 截屏文案 / README/onboarding 文案锁
**烈马 (QA)**: acceptance template / REG 翻牌 / e2e flake fix
**斑马 (Designer)**: 视觉规范 / 组件库 / 跟野马 content-lock 配套写 visual lock
**矮马 (Security)**: 敏感 PR review / privacy stance / audit log review

## 反模式

- ❌ 输出 "全员 idle 等 merge" 不派活 (即使等也得让 idle 的人干别的)
- ❌ 用 "等 review 反馈" 当 idle 借口 (等的人不在 wait state 就该派新活)
- ❌ 把 audit 当推进 (audit + 派活 才是推进)
- ❌ 假设 "并行会冲突" 就不并行 (新协议: 一 milestone 一 worktree, 多 milestone 自然并行)
- ❌ **"CI 绿就 merge"** — 必须先审 PR body Acceptance/Test plan 全勾 (见 §5)
- ❌ **subagent LGTM = merge 信号** — subagent 不审任务完成度, teamlead 自己审 PR body
- ❌ 派 review 看作 merge 唯一 gate — review 是质量检查, **任务完成度 + CI + LGTM 三联签才合**

## 调用方式

cron prompt 改成:
```
[自动巡检 · 15 min]
follow skill blueprintflow-teamlead-fast-cron-checkin
```

## 配套

- 慢节奏偏差 audit 走 `blueprintflow:teamlead-slow-cron-checkin`, 不重叠
