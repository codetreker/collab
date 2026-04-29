---
name: blueprintflow-workflow
description: Borgee 工作流总览 — 多 agent 协作做产品的方法论。何时用 + 角色 + 阶段 + skill 索引。从 Borgee 项目跑通的通用工作流, 不限单一项目。
---

# Borgee Workflow

从 Borgee 项目跑通的多 agent 协作工作流, 适合**做产品**: 从模糊概念到可发布软件, 6 角色 + Teamlead 协议推进。

## 心智模型: 城市工程

这套 skill 是为**大需求 / 长工作时间项目**设计的 — 跟大型城市工程的协作模式同构:

| 城市工程 | blueprintflow 角色 |
|---|---|
| 总工程师 | 飞马 (架构) — 出蓝图 + spec brief |
| 甲方 | 野马 (产品) — 拍立场 + 反约束 |
| 施工队 | 战马 (开发) — 按 spec 落地, 不改图 |
| 质检 | 烈马 (QA) — acceptance 验收 |
| 设计 / 安全 | 斑马 / 矮马 (装修 / 消防) |
| 总包 | Teamlead — 协调, 不下场砌墙 |

工程方法对应:
- **蓝图先 freeze 再开工** — 不能边建边改图, 改图走 PR + 4 角色 review (= 工程变更单)
- **按价值闭环分期** (Phase 0 地基 / Phase 1 主体 / Phase 2 装修) — 不按工种分期
- **阶段性验收签字** (Phase 退出 4 联签 = 阶段验收报告 + 留账闸)
- **质量门留痕** (规则 6 / migration v 号串行 = 工程档案)
- **甲方代表全程在场** (野马立场反查 = 不让施工偏离需求)

### 不适用场景

- Hackathon / 一次性脚本 / 单 PR fix — 蓝图 + brainstorm + Phase exit gate 是重型基建, 短任务用不上
- 单人快速迭代 — 4 件套 + 双 review 路径假设有多人协作
- 探索阶段没立场 — 先用 `blueprintflow:brainstorm` 锁立场再走这套

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

## tmux 起团窗格排版

用 tmux 起团时, 窗格排版要合理化 — 不能全堆一行扁条, 一眼看不出谁在干什么。

### 推荐布局 (6 角色团 + Teamlead)

```
┌─────────────────┬────────────┬────────────┐
│                 │  飞马      │  野马      │
│   Teamlead      ├────────────┼────────────┤
│   (顶部宽窗)    │  战马A     │  战马B/C   │
│                 ├────────────┼────────────┤
│                 │  烈马      │  斑马/矮马 │
└─────────────────┴────────────┴────────────┘
```

- **Teamlead 占左半屏整列** (协调主线, 视野最大)
- **6 角色右侧 2x3 网格** (每格高度均等, 名字一眼看见)
- 按需 spawn 的斑马/矮马跟战马C 共用底格 (lazy spawn)

### 起团命令骨架

```bash
SESSION=blueprintflow
tmux new-session -d -s $SESSION -x 220 -y 60   # 大画布
# 左半屏 Teamlead
tmux send-keys -t $SESSION:0 'claude' Enter
# 右半屏切 2x3
tmux split-window -h -p 60 -t $SESSION:0
tmux split-window -v -p 66 -t $SESSION:0.1
tmux split-window -v -p 50 -t $SESSION:0.2
tmux split-window -h -t $SESSION:0.1
tmux split-window -h -t $SESSION:0.3
tmux split-window -h -t $SESSION:0.5
for p in 1 2 3 4 5 6; do
  tmux send-keys -t $SESSION:0.$p 'claude' Enter
done
# pane 命名 (status line 显示)
tmux set-option -t $SESSION pane-border-status top
tmux select-pane -t $SESSION:0.0 -T 'teamlead'
tmux select-pane -t $SESSION:0.1 -T 'feima'
# ... feima/yema/zhanma-a/zhanma-c/liema 等
tmux attach -t $SESSION
```

### 窗格反模式

- ❌ 全部左右切 (7 列扁条, 内容看不全)
- ❌ Teamlead 跟角色混排 (协调主线被淹没)
- ❌ pane 不命名 (status line 全 `bash`, 找不到谁是谁)
- ❌ 一个会话开一个窗口 (跨窗口切换慢, 一屏看不到全貌)

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

## 激活协议 (必启 cron)

**workflow 激活的同时, Teamlead 必启动 fast + slow 两个 cron**:

```
CronCreate({
  cron: "7,22,37,52 * * * *",  // 15min, 错峰 :07/:22/:37/:52 避免整点流量
  prompt: "[自动巡检 · 15 min] Phase 进展 + idle 派活检查 (按 blueprintflow:teamlead-fast-cron-checkin 走)",
  durable: false  // session-only, workflow 关停 cron 同步消失
})

CronCreate({
  cron: "17 */2 * * *",  // 每 2h :17, 跟 fast cron :07/:22/:37/:52 错开
  prompt: "[偏差 audit · 2 小时] 蓝图 / docs/current / 翻牌延迟检查 (按 blueprintflow:teamlead-slow-cron-checkin 走)",
  durable: false
})
```

**为什么必启**:
- agent 不打卡, **没 cron 推就 idle**, 长项目主动检查频次降到 0
- 大需求长工作时间下, 非主动派活 = 隐形拖延 (用户问"为什么停下了"= 这条触发)
- fast cron 看 PR 队列 + idle 派活, slow cron 看蓝图/PROGRESS/翻牌延迟, 双轨覆盖

**关停**:
- workflow session 结束 → durable: false 自动消失
- 如需暂停巡检 (e.g. brainstorm 期间不派活) → `CronDelete` 显式删, 别让它无脑派

**反模式**:
- ❌ 只启 fast cron 不启 slow → 长期偏差累计无 audit
- ❌ 启 cron 但 prompt 不引 `blueprintflow:teamlead-{fast,slow}-cron-checkin` → cron 行为不可控
- ❌ durable: true 没用户拍板 → 跨 session 残留, 别项目误派

## 跨项目使用

虽叫 `blueprintflow:`, 但这套 workflow 通用:
- 角色名 (X马) 可保留作 ergonomic 提醒, 也可改成 architect/pm/dev/qa/designer/security
- 路径 / 文档结构 (`docs/blueprint/`, `docs/implementation/`, `docs/qa/`) 是约定俗成, 项目可调
- worktree / migration / lint 协议是核心, 不动
