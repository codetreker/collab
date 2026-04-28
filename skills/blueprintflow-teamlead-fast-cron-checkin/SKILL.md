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
- ❌ 假设 "并行会冲突" 就不并行 (临时 clone 解决, 一个 dev 一个 worktree)

## 调用方式

cron prompt 改成:
```
[自动巡检 · 15 min]
follow skill blueprintflow-teamlead-fast-cron-checkin
```

## 配套

- 慢节奏偏差 audit 走 `blueprintflow:teamlead-slow-cron-checkin`, 不重叠
