# Acceptance Template — CHN-4 e2e flake wrapper

> 类型: e2e/test-infra (test-only, 0 production change) — Playwright fixture-based refactor 替代 timing 死等
> 烈马 v0 `acceptance-templates/chn-4.md` 立场不动, 此 wrapper 加 e2e refactor 验收.
> Owner: 战马D 实施 / 烈马 自签

## 拆 PR 顺序

- **CHN-4 wrapper 一 PR** — spec v1 + stance v1 + 三段实施 (e2e refactor + grep audit + closure).

## 验收清单 (跟 spec §1 三段 1:1)

### CHN-4.1 e2e refactor (fixture-based, 删 timing 死等)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| `packages/e2e/fixtures/chn-4-fixtures.ts` 存在 + REST-driven seed (auth + DM + workspace channel) | exists + import | 战马D / 烈马 | TBD — fixture file + spec import |
| `chn-4-collab-skeleton.spec.ts` 内 `waitForTimeout` count==0 + Playwright auto-retry (`toHaveCount` / `toBeVisible`) | 反 grep + e2e | 战马D / 烈马 | TBD — `chn-4-collab-skeleton.spec.ts` 重写 + 反 grep PASS |

### CHN-4.2 server-side 反约束 grep audit (PERF-AST-LINT #506 复用)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| `internal/api/chn_4_grep_audit_test.go` 用 `astscan.AssertNoForbiddenIdentifiers` 验 7 源 byte-identical 锁不破 | server unit | 战马D / 烈马 | TBD — astscan helper 复用 + 7 源 forbidden id 反向断言 PASS |

### CHN-4.3 closure

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| DM 视图无 workspace tab assertion ≥3s retry 不死等 | e2e | 战马D / 烈马 | TBD — `[data-tab="workspace"]` toHaveCount(0) Playwright 默认 5s retry |
| server production 0 行变更 (git diff 验) | grep | 战马D / 烈马 | TBD — `git diff` 仅 _test.go / fixtures 命中 |

### 退出条件

- 上表 5 项: **5 ✅** (实施后翻)
- REG-CHN4-001..005 5 🟢
- 烈马 acceptance signoff
- ⚠️ e2e CI flaky 真消失 (跟 G3.4 退出闸三签 #442 evidence 同源)

### Follow-up 留账

- E2E 套件其他 flake (RT-1.2 latency CI 等) — 留 PERF-* 后续 PR
- 协作场新 entity / 新 endpoint — 烈马 v0 立场守, 不在此 PR

## 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-29 | 战马D | v1 — CHN-4 e2e flake wrapper acceptance (5 验收项跟 spec §1 三段 1:1). REG-CHN4-001..005 ⚪ 占号 (实施完翻 ✅). |
