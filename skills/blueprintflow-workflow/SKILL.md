---
name: blueprintflow-workflow
description: Borgee 工作流总览 — 多 agent 协作做产品的方法论。何时用 + 角色 + 阶段 + skill 索引。从 Borgee 项目跑通的通用工作流, 不限单一项目。
---

# Borgee Workflow

从 Borgee 项目跑通的多 agent 协作工作流, 适合**做产品**: 从模糊概念到可发布软件, 6 角色 + Teamlead 协议推进。

## 何时用

适合:
- 一个新产品 / 大功能 / 大 refactor 从概念开始
- 多 agent 协作 (≥3 角色), 单 agent 跑不完
- 需要立场 / 蓝图 / 实施 / 验收 分轨且互锁的场景
- 跨 milestone 漂移控制要求高 (立场不能随实施漂)

不适合:
- 单 agent / 小任务 (overhead 太重)
- 纯 bug fix (走 PR review + admin merge 即可)
- 已有产品的运维 / oncall

## 4 层结构

```
┌─ 概念层 (蓝图) ───────── blueprintflow:brainstorm + blueprintflow:blueprint-write
│      ↓
├─ 计划层 (Phase 拆) ──── blueprintflow:phase-plan
│      ↓
├─ milestone 层 (实施) ── blueprintflow:milestone-fourpiece + blueprintflow:pr-review-flow
│      ↓
└─ 协调层 (持续推进) ──── blueprintflow:teamlead-fast-cron-checkin (15min idle)
                          blueprintflow:teamlead-slow-cron-checkin (2-4h audit)
                          blueprintflow:phase-exit-gate (Phase 收尾)
```

## 6 角色 + Teamlead

| 代号 | 中文 | 职责 |
|---|---|---|
| **Teamlead** | 协调 | facilitator, 派活 / 监督 / 协议守门, 不写代码 |
| **飞马** | 架构师 (Architect) | spec brief / 蓝图引用 / 闸 1+2 (模板自检 + grep 锚) / PR 架构 review |
| **野马** | 产品 (PM) | 立场反查表 / 文案锁 / 闸 3 反查表 / 闸 4 标志性 milestone 签字 |
| **战马** | 开发 (Developer) | 实施代码 / migration / 单测 / 主 worktree (一次只一个 in-flight) |
| **烈马** | 测试 (QA) | acceptance template / E2E + 行为不变量单测 / current 同步审 / 闸 4 跑 acceptance |
| **斑马** | 设计 (Designer) | UI/UX/视觉, milestone 涉及 client UI 时 spawn (跟野马文案锁互锁) |
| **矮马** | 安全 (Security) | auth/privacy/admin god-mode/cross-org 路径 review, 涉敏感写动作时 spawn |

完整角色 prompt 模板见 `blueprintflow:team-roles`。

## 阶段 + Skill 索引

### 阶段 1: 概念锁定
**目标**: 模糊 idea → 可写蓝图的核心立场 + 概念模型 + 反约束

1. **blueprintflow:brainstorm** — Teamlead 主持多轮讨论 (PM + Architect 主), 锁立场 / 概念 / 反约束
2. **blueprintflow:blueprint-write** — Architect + PM 落 `docs/blueprint/*.md`

产出: `docs/blueprint/` ready, 概念 freeze, 后续 PR 必引 §X.Y

### 阶段 2: 实施计划
**目标**: 蓝图 → Phase 拆 + 退出 gate + 4 道防偏离闸门

3. **blueprintflow:phase-plan** — Architect 主, 落 `docs/implementation/PROGRESS.md` + execution-plan + Phase 退出 gate

产出: PROGRESS.md ready, Phase 1/2/3+ 拆段清晰

### 阶段 3: milestone 实施 (主战场)
**目标**: 每 milestone 落 4 件套 → 拆段实施 ≤3 PR → 全 merged 闭环

4. **blueprintflow:milestone-fourpiece** — 4 件套并行 (spec / stance / acceptance / content-lock)
5. **blueprintflow:pr-review-flow** — PR open 后双 review + admin merge + follow-up 翻牌

产出: milestone 全 merged + acceptance template ⚪→🟢 翻牌 + REG-* 寄存

### 阶段 4: 持续推进 + Phase 退出
**目标**: idle 派活 + 偏差纠正 + Phase 退出 gate

6. **blueprintflow:teamlead-fast-cron-checkin** — 15 min cron, idle 角色派活
7. **blueprintflow:teamlead-slow-cron-checkin** — 2-4h cron, 偏差 audit
8. **blueprintflow:phase-exit-gate** — Phase 收尾联签 + closure announcement

## 关键协议

- **Worktree 隔离**: 主 worktree 给战马 in-flight (一次只一个), 其他用 `/tmp/<name>-<topic>` 临时 clone
- **PR template 顶部 4 行裸 metadata**: `Blueprint: §X.Y` / `Touches:` / `Current 同步:` / `Stage: v0|v1`
- **Migration v 号串行发号** (如适用): 分配前先 grep 确认
- **规则 6 (current 同步)**: 代码改 → docs/current 必同步, PR 级 lint 强制
- **立场漂移 5 层防御**: spec grep + acceptance 反查锚 + stance 黑名单 + content-lock byte-identical + PR 跨文件 cross-check
- **author=lead-agent 不能 self-approve**: 用 `gh pr comment <num> --body "LGTM"` 等同批准

## 反模式

- ❌ 跳过 4 件套直接实施 (立场漂移无法抓)
- ❌ 一个角色多 milestone 并行 (worktree 冲突)
- ❌ 把 audit 当推进 (audit + 派活才是)
- ❌ ruleset 兜底跑 e2e 真 fail PR (掩盖 bug)
- ❌ idle 不派活 (cron 必须 ACT)

## 起步

```
1. blueprintflow:team-roles      — spawn 6 角色 (按需)
2. blueprintflow:brainstorm      — 锁概念 + 立场
3. blueprintflow:blueprint-write — 落蓝图
4. blueprintflow:phase-plan      — 拆 Phase
5. (循环) blueprintflow:milestone-fourpiece + blueprintflow:pr-review-flow + blueprintflow:teamlead-fast-cron-checkin
6. (定期) blueprintflow:teamlead-slow-cron-checkin
7. (Phase 收尾) blueprintflow:phase-exit-gate
```

## 跨项目使用

虽叫 `blueprintflow:`, 但这套 workflow 通用:
- 角色名 (X马) 可保留作 ergonomic 提醒, 也可改成 architect/pm/dev/qa/designer/security
- 路径 / 文档结构 (`docs/blueprint/`, `docs/implementation/`, `docs/qa/`) 是约定俗成, 项目可调
- worktree / migration / lint 协议是核心, 不动
