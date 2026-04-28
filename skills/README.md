# Borgee Skills Marketplace

> Borgee 既是产品也是 skill marketplace — 这套从 Borgee 项目跑通的 multi-agent workflow skills, 你可以直接安装到自己项目里用。

## 安装 (Claude Code)

```bash
git clone https://github.com/codetreker/borgee.git
ln -s $(pwd)/borgee/skills/* ~/.claude/skills/
```

或单独装某个:
```bash
ln -s $(pwd)/borgee/skills/borgee-workflow ~/.claude/skills/borgee-workflow
```

装完 Claude Code 重启即可见 `borgee-*` skills。

## 6 Skills (第一波)

| Skill | 触发 | 用途 |
|---|---|---|
| [borgee-workflow](borgee-workflow/SKILL.md) | 起步 | workflow 总览 + 何时用 + 角色 + 阶段索引 |
| [borgee-team-roles](borgee-team-roles/SKILL.md) | 起团 | 6 X马 角色 prompt 模板 (架构师/PM/Dev/QA/设计/安全) |
| [borgee-milestone-fourpiece](borgee-milestone-fourpiece/SKILL.md) | milestone 启动 | 4 件套并行 (spec / stance / acceptance / content-lock) |
| [borgee-pr-review-flow](borgee-pr-review-flow/SKILL.md) | PR open | 双 review + admin merge + ruleset 兜底 |
| [borgee-teamlead-fast-cron-checkin](borgee-teamlead-fast-cron-checkin/SKILL.md) | 15min cron | idle 派活, 不只 audit |
| [borgee-teamlead-slow-cron-checkin](borgee-teamlead-slow-cron-checkin/SKILL.md) | 2-4h cron | 偏差 audit + 文档/代码一致性 + 翻牌延迟 |

## 第二波 (待补)

- `borgee-phase-plan` — Phase 拆 + 退出 gate + 4 道防偏离闸门
- `borgee-phase-exit-gate` — Phase 收尾联签 + closure announcement
- `borgee-blueprint-write` — 蓝图模板 (核心立场 / 概念模型 / v0/v1 边界)
- `borgee-brainstorm` — 多轮讨论 driver

## 起步

新项目用这套 workflow:

```
1. follow skill borgee-workflow             — 看总览, 决定是否适用
2. follow skill borgee-team-roles           — spawn 6 角色 (按需)
3. follow skill borgee-milestone-fourpiece  — milestone 启动
4. follow skill borgee-pr-review-flow       — PR 流程
5. cron 15min: borgee-teamlead-fast-cron-checkin
6. cron 2-4h:  borgee-teamlead-slow-cron-checkin
```

## 设计哲学

- **Dogfooding**: skills 住在 Borgee 项目里, 改 workflow 走完整 PR 流程 (4 角色协议自检 — skills 必须能 review 自己的更新)
- **真实跑过**: 不是抽象方法论, 是 Phase 1/2 + Phase 3 (in progress) 实战提炼
- **跨项目通用**: 角色名 (X马) ergonomic, 路径约定可调, 核心协议 (worktree 隔离 / lint / 立场漂移防御) 不动

## 反馈

skills 跑出新经验? 开 PR 改 SKILL.md, 走 4 角色 review 协议 (本身就是 dogfood)。
