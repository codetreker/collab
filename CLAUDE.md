# Borgee 协作约定

## 团队角色映射

本工程用 [blueprintflow](https://github.com/codetreker/blueprintflow) 协作 skills. 角色 ↔ blueprintflow 通用名映射:

| 本工程代号 | 角色 | blueprintflow 通用名 |
|---|---|---|
| **feima 飞马** | 架构师 + reviewer | architect |
| **yema 野马** | 产品 PM | pm |
| **liema 烈马** | QA + acceptance | qa |
| **zhanma / zhanma-c / zhanma-d 战马 (3 个)** | 开发 dev | dev |
| **team-lead** | 协调 + merge gate | facilitator |

**标准配置**: 3 dev + 1 architect + 1 PM + 1 QA + 1 team-lead (总 7 人).

## blueprintflow skills 安装

通过 Claude Code plugin marketplace 安装 (blueprintflow PR #10 已转 marketplace 结构):

```
/plugin marketplace add codetreker/blueprintflow
/plugin install blueprintflow@blueprintflow
```

安装后 skills namespace 为 `blueprintflow:blueprintflow-<name>` (skill name 字段保留 `blueprintflow-` 前缀).

skills 列表 (按职责):
- `blueprintflow:blueprintflow-workflow` — 总流程
- `blueprintflow:blueprintflow-brainstorm` — 立场头脑风暴
- `blueprintflow:blueprintflow-blueprint-write` — 蓝图写作
- `blueprintflow:blueprintflow-phase-plan` — Phase 规划
- `blueprintflow:blueprintflow-phase-exit-gate` — Phase 退出闸
- `blueprintflow:blueprintflow-milestone-fourpiece` — milestone 4 件套
- `blueprintflow:blueprintflow-pr-review-flow` — PR review + merge 流程
- `blueprintflow:blueprintflow-git-workflow` — git workflow (worktree / branch / PR)
- `blueprintflow:blueprintflow-team-roles` — 团队角色定位
- `blueprintflow:blueprintflow-teamlead-fast-cron-checkin` — Teamlead 快节奏巡检 (15 min)
- `blueprintflow:blueprintflow-teamlead-slow-cron-checkin` — Teamlead 慢节奏 audit (2 h)

## 跑 test 必须加 timeout

血账: 战马 e 跑 test 卡 40 分钟无响应, 拖死整个 milestone 推进.

**硬规**: 任何 `go test` / `npm test` / `pnpm test` / `playwright test` / `vitest` 调用 **必须**加 timeout, 不留无界 hang 路径.

```bash
# Go
go test -timeout=120s ./...
go test -timeout=120s -race -coverprofile=coverage.out ./...

# Playwright (默认有 30s per-test, 但整 suite 加 --max-failures + 总超时)
pnpm exec playwright test --timeout=30000

# Vitest
pnpm vitest run --testTimeout=10000
```

**Bash 工具调用**也必须设 `timeout` 参数 (max 600000ms = 10min):
- 单个 test 包: 2-3 min
- 全套 test: 5-10 min
- **绝不无 timeout 跑 test**, 卡住 = 整个 agent 浪费

如 test 真需要 >10min, 用 `run_in_background: true` 提交后做别的, 不阻塞主线.
