# Blueprintflow Skills Marketplace

> 这套从 Borgee 项目跑通的 multi-agent workflow skills (blueprintflow marketplace), 你可以直接安装到自己项目里用。

## 安装 (Claude Code)

```bash
git clone https://github.com/codetreker/borgee.git
ln -s $(pwd)/borgee/skills/* ~/.claude/skills/
```

或单独装某个:
```bash
ln -s $(pwd)/borgee/skills/blueprintflow-workflow ~/.claude/skills/blueprintflow-workflow
```

装完 Claude Code 重启即可见 `blueprintflow-*` skills。

## 10 Skills

| Skill | 触发 | 用途 | 波 |
|---|---|---|---|
| [blueprintflow-workflow](blueprintflow-workflow/SKILL.md) | 起步 | workflow 总览 + 何时用 + 角色 + 阶段索引 | 第一波 (#323) |
| [blueprintflow-team-roles](blueprintflow-team-roles/SKILL.md) | 起团 | 6 X马 角色 prompt 模板 (架构师/PM/Dev/QA/设计/安全) | 第一波 (#323) + addendum (#326) |
| [blueprintflow-milestone-fourpiece](blueprintflow-milestone-fourpiece/SKILL.md) | milestone 启动 | 4 件套并行 (spec / stance / acceptance / content-lock) | 第一波 (#323) |
| [blueprintflow-pr-review-flow](blueprintflow-pr-review-flow/SKILL.md) | PR open | 双 review + admin merge + ruleset 兜底 | 第一波 (#323) |
| [blueprintflow-teamlead-fast-cron-checkin](blueprintflow-teamlead-fast-cron-checkin/SKILL.md) | 15min cron | idle 派活, 不只 audit | 第一波 (#323) |
| [blueprintflow-teamlead-slow-cron-checkin](blueprintflow-teamlead-slow-cron-checkin/SKILL.md) | 2-4h cron | 偏差 audit + 文档/代码一致性 + 翻牌延迟 | 第一波 (#323) |
| [blueprintflow-phase-plan](blueprintflow-phase-plan/SKILL.md) | Phase 启动 | Phase 拆 + 退出 gate + 4 道防偏离闸门 | 第二波 (#325) |
| [blueprintflow-phase-exit-gate](blueprintflow-phase-exit-gate/SKILL.md) | Phase 收尾 | Phase 收尾联签 + closure announcement | 第二波 (#325) |
| [blueprintflow-blueprint-write](blueprintflow-blueprint-write/SKILL.md) | 立项 | 蓝图模板 (核心立场 / 概念模型 / v0/v1 边界) | 第二波 (#325) |
| [blueprintflow-brainstorm](blueprintflow-brainstorm/SKILL.md) | 多轮讨论 | 讨论 driver (无回声 / 反约束 / 收敛) | 第二波 (#325) |

## Marketplace changelog

- **#323** (第一波, merged) — 6 skills marketplace v1 (workflow / team-roles / milestone-fourpiece / pr-review-flow / fast+slow cron-checkin)
- **#325** (第二波, merged) — 4 skills (phase-plan / phase-exit-gate / blueprint-write / brainstorm)
- **#326** (addendum, merged 027f7d1) — teamlead fast-cron-checkin idle 派活补丁
- **#328** (rename, merged 9c059c3) — `borgee-*` → `blueprintflow-*` + 心智模型不适用 3 条

## 起步

新项目用这套 workflow:

```
1. follow skill blueprintflow-workflow             — 看总览, 决定是否适用
2. follow skill blueprintflow-team-roles           — spawn 6 角色 (按需)
3. follow skill blueprintflow-milestone-fourpiece  — milestone 启动
4. follow skill blueprintflow-pr-review-flow       — PR 流程
5. cron 15min: blueprintflow-teamlead-fast-cron-checkin
6. cron 2-4h:  blueprintflow-teamlead-slow-cron-checkin
```

## 设计哲学

- **Dogfooding**: skills 住在 Borgee 项目里, 改 workflow 走完整 PR 流程 (4 角色协议自检 — skills 必须能 review 自己的更新)
- **真实跑过**: 不是抽象方法论, 是 Phase 1/2 + Phase 3 (in progress) 实战提炼
- **跨项目通用**: 角色名 (X马) ergonomic, 路径约定可调, 核心协议 (worktree 隔离 / lint / 立场漂移防御) 不动

## 反馈

skills 跑出新经验? 开 PR 改 SKILL.md, 走 4 角色 review 协议 (本身就是 dogfood)。
