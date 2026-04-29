# PERF-SCHEMA-SHARED — sqlite Serialize/Deserialize 包 (一 PR)

> 类型: perf (test-only API surface, no production behavior change)
> Owner: 战马D 实施 / 烈马 自签 (perf 不进野马 G4 流, 跟 PERF-TEST / PERF-JWT-CLOCK / CI-SPLIT-RACE-COV / REFACTOR-REASONS deferred 同模式)
> 飞马 PERF-TEST PR 1 留账 (PR 4, subagent perf audit 最后一项)

## 立场

- ① **API surface ship + integration deferred** — 经过 NewTestServer wire-up
  实测, sqlite3_deserialize 跟 Go database/sql 连接池在并发 (`t.Parallel()`)
  下兼容性差: 某些 race-mode test (e.g. `TestP2RapidFireWebSocketMessages`
  50 并发 message 写) 出 `INTERNAL_ERROR`, 即使 `SetMaxOpenConns(1) +
  SetMaxIdleConns(1)`. 结论: API 层 (Store.SerializeSchema/DeserializeSchema)
  独立测好, integration 留 future PR 深挖.
- ② **真测速估算修正** — 当前 NewTestServer 真 cost ~20ms/call (Migrate
  ~13ms + 3 bcrypt + create users/channel ~7ms), 不是 brief 的 100-300ms.
  256 api test ÷ 8 并发 worker ≈ 32 串行 → 32 × 20ms = 640ms 节省上限,
  跟 race wall-clock 40s 比 ROI 1.6%. 集成风险 vs 节省小 ⇒ 不强 push.
- ③ **deterministic API** — 5 单测覆盖 reproducible / round-trip / 并发安全
  / row 隔离 / fresh-open 跳过 Migrate, 全 PASS race detector 下.
- ④ **production 0 行改** — 仅 Store 公开 helper + 1 行 db.go 注释.

## What this PR does

1. `internal/store/schema_snapshot.go` (新):
   - `Store.SerializeSchema()` / `Store.DeserializeSchema()` — sqlite3 Serialize/Deserialize wrap
   - `db.SetMaxOpenConns(1)` 注释加 `:memory: requires single conn`
2. `internal/store/schema_snapshot_test.go` (新, 5 unit, 全 race PASS): Reproducible / RoundTrip / ConcurrentSafe (32 goroutines) / RowIsolation / FreshOpenSkipsMigrate
3. **integration into NewTestServer 留 future PR** — 见下文.

## Why integration deferred

实测: `NewTestServer` 改用 `sync.Once` 跑一次 Migrate + seed 后 SerializeSchema,
后续每 test Open + DeserializeSchema. **bench post-warmup**: 19.96ms → 1.79ms (11×).

**问题**: race + parallel 高并发写场景 (`ws/rapid_fire_test` 50 messages),
出 `INTERNAL_ERROR`. 推测 sqlite3_deserialize 替换 sqlite handle 后, Go
database/sql conn pool 生命周期让某些并发场景下 conn 健康检查失败 → 重建空
:memory: conn → "database is closed". 调 `SetMaxIdleConns(1)` 不够, sqlite3_backup
是替代路径但需 src/dest 同时存活 (跨包改造重).

**ROI 决议**: 32 × 20ms = 640ms 节省上限 (实跑 race 40s, 1.6%), 整合 risk
vs benefit 不划算. ship API 留 future hook, integration defer.

## Before / After

| Target | Before | After |
|---|---|---|
| `internal/store` 公开 API | 无 | `SerializeSchema()` + `DeserializeSchema()` |
| `NewTestServer` per-call cost | 19.96ms | 19.96ms (unchanged, integration deferred) |
| `internal/store/schema_snapshot_test.go` | — | 5 unit PASS race-clean |
| `go test ./...` | PASS | PASS (无 regression, 业务 0 行改) |

## REG-PSS-001..005 (acceptance template)

| ID | 锚点 | Evidence |
|---|---|---|
| REG-PSS-001 | SerializeSchema 返非空字节 + reproducible | `TestSerializeSchema_Reproducible` PASS |
| REG-PSS-002 | DeserializeSchema round-trip schema_migrations row count | `TestDeserializeSchema_RoundTrip` PASS |
| REG-PSS-003 | 32 goroutines 并发 restore 无 race | `TestDeserializeSchema_ConcurrentSafe` PASS race |
| REG-PSS-004 | row isolation — store A mutate 不影响 store B | `TestDeserializeSchema_RowIsolation` PASS |
| REG-PSS-005 | fresh Open + Restore 跳过 Migrate | `TestDeserializeSchema_FreshOpenSkipsMigrate` PASS |

## Follow-up 留账

- **REG-PSS-006** integration into `NewTestServer` — 调研 sqlite3_deserialize +
  Go conn pool 兼容性, 或换用 sqlite3_backup_step (需要持有 src conn). ROI 1.6%.
- **REG-PSS-007** alternative SQL dump 文本 (`.dump` + `db.Exec(dump)`) — ROI 不及 binary path.

## 退出条件

- `go test -race ./internal/store/` 全 PASS
- 5 unit 全 ✅
- 烈马自签
- REG-PSS-001..005 5 🟢
