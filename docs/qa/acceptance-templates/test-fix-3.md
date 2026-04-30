# Acceptance Template — TEST-FIX-3 (race-heavy 拆 + shared fixture + CI timeout, post TEST-FIX-1/2 残余)

> 跟 TEST-FIX-1 #596 (`t.Parallel()` sub-test 加速) + TEST-FIX-2 #608 (server.New ctx + 3 处 goroutine leak) 互补; TEST-FIX-3 = 残余 race-heavy 包拆 + 共用 fixture 单源 + CI timeout 真验三轨. Spec brief `test-fix-3-spec.md` (待飞马 v0). Owner: 战马C 实施 / 飞马 review / 烈马 验收.
>
> **TEST-FIX-3 范围**: 真 production code refactor — 不 skip / 不 mask / 不降 cov, 走"真因修"立场承袭 TEST-FIX-1/2 路径.

## 验收清单

### §1 数据契约 — race-heavy 包拆 + shared fixture 单源 + CI timeout 字面锁

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 1.1 race-heavy 包拆段 — 现 `internal/api` 是 race target test 大本营 (TEST-FIX-2 实测 73.5s ≤120s budget); TEST-FIX-3 拆段把 reactions/dm/cv 三大段拆到独立 sub-package 各自 `t.Parallel()` 不打架 (反约束: 拆后 ≤40s race per package) | unit + race | 战马C / 烈马 | `internal/api/reactions/`, `internal/api/dm/`, `internal/api/cv/` 三 sub-package + `go test -race -timeout=60s` 各 ≤40s PASS |
| 1.2 shared fixture 单源 `internal/testutil/fixture.go::NewTestEnv(t *testing.T) *TestEnv` 抽 5+ 处既有 testutil 散落 setup (反向 grep `testutil\\.NewServer\\|testutil\\.SetupDB\\|testutil\\.NewStore` 在 production test 路径 byte-identical 跟新 NewTestEnv 一致, 改 = 改两处单测锁) | unit + grep | 战马C / 烈马 | `TestTESTFIX3_FixtureByteIdentical` (旧 helper vs 新 NewTestEnv 字面行为对比) + 反向 grep 散落 helper 削减 ≥5 处 |
| 1.3 CI timeout 字面锁 — `release-gate.yml::go-test-race` step 加 `-timeout=180s` 严守 (反 race CI 真实施 timeout 模糊) + `go-test-cov` 加 `-timeout=300s` (cov 跑全量, 时间宽) | CI yml | 战马C / 飞马 | release-gate.yml step 字面 byte-identical + CI run 真跑 ≤180s race PASS |

### §2 行为不变量 — race fail 解 + race PASS + cov ≥84% 不降 + 全 26 packages 全绿

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 2.1 race fail 解 — TEST-FIX-2 #608 后残余 race-heavy 包真拆段 PASS, full server-go race ./... 全 26+ packages PASS (跟 TEST-FIX-2 实测 26 packages PASS 立场承袭 + TEST-FIX-3 拆段后 sub-package 计数 +N) | full race | 战马C / 烈马 | `go test -tags sqlite_fts5 -timeout=180s -race ./...` 全 26+ packages PASS, 各 sub-package ≤40s |
| 2.2 race PASS ≤180s 严守 — full server-go race ./... 总耗时 ≤180s (跟 TEST-FIX-2 73.5s api 单包 + 拆后各 ≤40s 同级) | timeout enforce | 战马C / 飞马 / 烈马 | CI go-test-race step `-timeout=180s` PASS (run URL 链接) |
| 2.3 cov ≥84.0% 不降 — coverage threshold byte-identical 不动 (跟 TEST-FIX-2 立场承袭 + 永不降测试覆盖度铁律) | go test -cover | 战马C / 烈马 | `go test -tags sqlite_fts5 -timeout=300s -coverprofile=coverage.out ./...` 出 cov ≥84.0% (CI go-test-cov 真验) |
| 2.4 既有 558+ vitest + server-go non-race ./... 全绿不破 (Wrapper 立场 — TEST-FIX-3 是 test infra refactor 不动 production behavior) | full test | 战马C / 烈马 | `go test ./...` non-race PASS + `pnpm vitest run` 全 PASS |

### §3 蓝图行为对照 — 不 skip / 不 mask + ctx-aware shutdown 立场承袭 + Go 1.25 t.Context()

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 3.1 立场承袭 TEST-FIX-1/2 — 不 skip 任何 test (`t.Skip` body 在 production test 0 hit) + 不加 retry/sleep mask (`time.Sleep` mask retry 0 hit) + 不 cherry-pick subset (PR 跑全量 race ./...) | grep | 飞马 / 烈马 | reverse grep `t\\.Skip\\(\\)\\|time\\.Sleep` body 0 hit + spec §0 立场 ① ② ③ 字面承袭 TEST-FIX-2 三立场 |
| 3.2 ctx-aware shutdown 立场承袭 (TEST-FIX-2 server.New(ctx) + 3 处 leak) — TEST-FIX-3 sub-package 各自 testutil 走 `t.Context()` 自动 cancel (Go 1.25+ pattern), 反 `context.Background()` test infra 散落 | grep | 飞马 / 烈马 | 反向 grep `context\\.Background\\(\\)` 在 testutil/ + sub-package _test.go 0 hit (除 nil-deref fallback wrap 跟 TEST-FIX-2 同精神) |
| 3.3 race target test 单测保留 (TEST-FIX-1/2 既有 `TestClosedStoreInternalErrorBranches` 11 sub-test 不破) — TEST-FIX-3 拆段不动 target test 字面 byte-identical | inspect | 飞马 / 烈马 | git diff verify error_branches_test.go 0 行 (反约束 TEST-FIX-3 不重写 target test) |

### §4 反向断言 — 不 skip / 不 mask + drift 守门 + 跨 milestone 锁

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 4.1 反向 grep `t\\.Skip\\(\\)\\|t\\.Skipf\\(` body 在 production test 路径 count==0 (除 build-tag-per-platform skip 历史合规) | CI grep | 飞马 / 烈马 | `TestTESTFIX3_NoTestSkip` AST scan + CI step `test-fix-3-no-skip` 守门 |
| 4.2 反向 grep `time\\.Sleep` 在 _test.go body 路径 count==0 (除真测时序断言路径合规列白) | CI grep | 飞马 / 烈马 | reverse grep test |
| 4.3 反向 grep `-short\\|t\\.Short\\(\\)` body 0 hit (反 short-circuit cov 减) | CI grep | 飞马 / 烈马 | reverse grep test |
| 4.4 反向 testutil 散落 helper 削减 ≥5 处 (替成 NewTestEnv 单源, 反平行 setup 漂) | grep | 飞马 / 烈马 | `git grep -c 'testutil\\.NewServer\\|testutil\\.SetupDB' packages/server-go/internal/` 削减 ≥5 + spec §0 立场 ④ |

## REG-TESTFIX3-* 占号 (initial ⚪)

- REG-TESTFIX3-001 ⚪ race-heavy 包拆段 (internal/api → reactions/dm/cv 三 sub-package + race per package ≤40s)
- REG-TESTFIX3-002 ⚪ shared fixture 单源 (internal/testutil/fixture.go::NewTestEnv + 散落 helper 削减 ≥5 处 byte-identical)
- REG-TESTFIX3-003 ⚪ CI timeout 字面锁 (release-gate.yml go-test-race -timeout=180s + go-test-cov -timeout=300s)
- REG-TESTFIX3-004 ⚪ race fail 解 + full server-go race ./... 全 26+ packages PASS ≤180s
- REG-TESTFIX3-005 ⚪ cov ≥84.0% 不降 (threshold byte-identical 不动) + non-race + 全 client vitest 不破
- REG-TESTFIX3-006 ⚪ 反向 grep `t.Skip / time.Sleep / t.Short / -short / context.Background` 在 test 路径全 0 hit (除合规列白) + ctx-aware shutdown 立场承袭

## 边界

- TEST-FIX-1 #596 t.Parallel() sub-test 加速 (跟 TEST-FIX-3 互补 — 不重复 sub-test 加速, TEST-FIX-3 是包拆 + fixture)
- TEST-FIX-2 #608 server.New(ctx) + 3 处 goroutine leak 修 (调用方 ctx-aware shutdown 立场承袭)
- AL-7 RetentionSweeper #533 + HB-5 HeartbeatRetentionSweeper #607 既有 ctx-aware shutdown (TEST-FIX-3 不动 sweeper 内部, 仅拆调用包)
- Go 1.25+ `t.Context()` 自动 cancel pattern (TEST-FIX-2 引入, TEST-FIX-3 在新 sub-package 全推开)
- 永不降测试覆盖度铁律 (CLAUDE.md `no_lower_test_coverage.md`)
- 跑 test 必须加 timeout 铁律 (CLAUDE.md "硬规: 任何 go test 必须加 timeout")
- 不允许 admin merge bypass / flaky retry mask (CLAUDE.md `no_admin_merge_bypass.md`)

## 退出条件

- §1 (3) + §2 (4) + §3 (3) + §4 (4) 全绿 — 一票否决
- race-heavy 包拆段 (internal/api → 三 sub-package + race per package ≤40s)
- shared fixture 单源 + 散落 helper 削减 ≥5 处
- CI timeout 字面锁 (race -timeout=180s + cov -timeout=300s)
- race fail 解 + full server-go race ./... 全 26+ packages PASS
- cov ≥84.0% 不降 (threshold byte-identical 不动)
- 反向 grep `t.Skip / time.Sleep / t.Short / -short` body 全 0 hit (除合规列白)
- 立场承袭 TEST-FIX-1/2 (不 skip / 不 mask / 不降 cov / 真因修)
- 登记 REG-TESTFIX3-001..006

## 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-30 | 烈马 | v0 — acceptance template 草稿 (4 选 1 验收框架 + REG-TESTFIX3-001..006 6 行占号 ⚪). 战马C worktree 起 base 1df15ddd, 飞马 spec brief 待落, 实施 PR 出来时直接验. **真因修立场承袭 TEST-FIX-1 #596 + TEST-FIX-2 #608** (不 skip / 不 mask / 不加 retry / 不降 cov). 跨 milestone byte-identical 锁链: ctx-aware shutdown 跟 AL-7 + HB-5 + TEST-FIX-2 立场承袭 + Go 1.25 t.Context() 自动 cancel pattern + 永不降测试覆盖度 + 跑 test 必须加 timeout 铁律. 拆段立场: race-heavy 包拆 (internal/api 三 sub-package) + shared fixture 单源 (NewTestEnv 抽散落 helper ≥5 处) + CI timeout 字面锁 (race 180s / cov 300s). |
