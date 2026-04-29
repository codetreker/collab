# PERF-TEST — go test 提速 4 项快赢 (一 PR)

> 类型: perf (无行为变更/无 schema/无 endpoint) — 减 test wall-clock 4-5×
> Owner: 战马D 实施 / 烈马 自签 (perf 不进野马 G4 流, 跟 REFACTOR-REASONS / CM-5 deferred 同模式)
> 飞马 subagent perf audit follow-up (主线 4 项快赢, PR 2 留 schema 缓存 + CI 拆 job)

## 立场

- ① 无行为变更 — go test ./... 全 PASS, 8 处单测锁链 byte-identical 全锁住, race detector 全过
- ② 真测速 — before/after wall-clock 数据真跑, 不估算
- ③ 反约束 — 不动业务逻辑 (test setup + db pragma + 死等 sleep), test 字面/断言全保留
- ④ 留账 — 复杂优化 (per-test schema clone / CI job 拆分) 留 PR 2

## What this PR does

1. **`internal/testutil/server.go` admin env 移到 package init** (从 `t.Setenv` 迁出):
   - `t.Setenv` 阻 `t.Parallel()` (Go 测试硬 rule), 全 api 包被卡串行
   - `os.Setenv` in init() — 同进程共享 env, 测试 fixture 字面值不变 (BORGEE_ADMIN_LOGIN / PASSWORD_HASH)
   - 解锁 200+ test 并行通道
2. **`internal/api/*_test.go` 加 `t.Parallel()`** (259 个 test 函数批量加, 已有 2 个保留):
   - 配合 `NewTestServer` per-test isolated `:memory:` DB, 无共享 mutable 状态
   - **internal/api race: 168.6s → 37.7s** (4.5× speedup)
3. **`internal/store/db.go` WAL pragma 跳过 `:memory:`**:
   - WAL 在 in-memory sqlite 是无意义 + contention source
   - file dsn 仍走 WAL (production 路径不变)
4. **删 `internal/api/cm_5_2_agent_to_agent_test.go:302` 10ms sleep**:
   - 注释自承 "此 test 不依赖 async, sleep 防 race 边界 不影响 PASS"
   - 删 sleep + 移除 `time` import; sync path 反向断言保留
   - 单 test 省 10ms × N 并发实例

## Before / After (wall-clock, race)

| Target | Before | After | Speedup |
|---|---|---|---|
| `internal/api` (race) | 168.6s | 37.7s | **4.5×** |
| `./...` (race full) | ~3-5min (estimated) | 39.3s | **~5-7×** |

## 反约束

- `go test -race ./...` 全 PASS — 无 data race (per-test isolated DB 守)
- 8 处单测锁链 byte-identical 不破 (#249/#305/#321/#380/#454/#458/#481/#492)
- production 路径 (file-backed sqlite) WAL 仍开 — DB 一致性不变
- 反向: `t.Setenv` 调用在 testutil 全 0 hit (env 唯一 init 点)

## REG-PT-001..004 (acceptance template)

| ID | 锚点 | Evidence |
|---|---|---|
| REG-PT-001 | testutil admin env init 单源 | `os.Setenv` 在 server.go init() count==1; `t.Setenv` 在 internal/testutil/ count==0 |
| REG-PT-002 | api race wall-clock ≤50s | `time go test -race ./internal/api/` PASS in 37.7s (was 168.6s) |
| REG-PT-003 | WAL pragma skip :memory: | `internal/store/db.go` if dsn != ":memory:" gate; file path 仍 WAL |
| REG-PT-004 | cm_5_2 sleep 删除 | grep `time.Sleep.*Millisecond` 在 cm_5_2_agent_to_agent_test.go count==0 |

## Follow-up 留账 (PR 2)

- shared migrated schema 模板 (sqlite BACKUP/ATTACH per-test clone) — 省 N×Migrate 调用
- CI scripts/coverage.sh 拆 race + cov 两 job 并行 — wall-clock /2
- `internal/ws/token_rotation_test.go:19` 1.1s 死等 → 用 `testutil/clock.Fake` 注入 (需 JWT clock injection 改造, 跨包改动 留 dedicated PR)

## 退出条件

- `go test -race ./...` 全 PASS (无 data race + 无行为级 regression)
- internal/api race wall-clock ≤50s
- 烈马自签 (perf 不进野马 G4 流)
- REG-PT-001..004 4 🟢
