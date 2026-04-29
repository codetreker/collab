# PERF-JWT-CLOCK — JWT clock injection (一 PR)

> 类型: perf (clock injection seam, production 路径 byte-identical) — 替 1.1s sleep
> Owner: 战马D 实施 / 烈马 自签 (perf 不进野马 G4 流, 跟 PERF-TEST / REFACTOR-REASONS deferred 同模式)
> 飞马 PERF-TEST PR 1 留账 (PR 2 之一)

## 立场

- ① **production 路径 byte-identical** — `Clock=nil` (默认) → `AuthHandler.now()` 走 `time.Now()`, 跟 PERF-JWT-CLOCK 前 100% 一致;
- ② **clock injection seam** — `clock.Clock` interface (testutil/clock 已有 Real{}/Fake{}), 测试用 *Fake 跳秒;
- ③ **不破 prod** — `signAndSetCookie` cookie shape (name / MaxAge / HttpOnly / SameSite / 7d exp) 全不变;
- ④ **反 fork** — 单 seam (AuthHandler.Clock + Server.SetClock), 不挂 cfg / 不挂 env, 测试入口唯一 (NewTestServerWithFakeClock).

## What this PR does

1. `internal/api/auth.go`:
   - 新 field `AuthHandler.Clock clock.Clock` (默认 nil → time.Now() 兼容)
   - 新 method `now()` — nil-safe time source
   - `signAndSetCookie` 调 `h.now()` 替 `time.Now()`
2. `internal/server/server.go`:
   - 新 field `Server.clk clock.Clock` + `authHandler` 持有引用
   - 新 method `Server.SetClock(c)` — 测试入口
   - `SetupRoutes()` 构造 AuthHandler 时 `Clock: s.clk` 传入
3. `internal/testutil/server.go`:
   - 新 helper `NewTestServerWithFakeClock(t)` — 返 (ts, store, cfg, *clock.Fake);
   - Fake 起点 `time.Now()` (而非 clock.NewFake 默认 2025-01-01) — 因 auth.AuthMiddleware 验 JWT exp 走 stdlib time.Now, 不能在过去发 token
4. `internal/ws/token_rotation_test.go`:
   - `time.Sleep(1100 * time.Millisecond)` → `fake.Advance(2 * time.Second)`
5. `internal/api/auth_clock_injection_test.go` (新, 5 unit):
   - `_NilClock_FallsBackToTimeNow` (production 路径 invariant — JWT iat 跟 wall-clock ±1s + exp-iat==7d)
   - `_FakeClock_AdvancesIAT` (Advance(5s) → iat delta == 5s + token 不同)
   - `_FakeClock_NoRealSleep` (Advance(1h) wall-clock <100ms)
   - `_StructFieldExposed` (AuthHandler.Clock 公开 seam)
   - `_ProductionPath_NoBehaviorChange` (cookie shape invariant)

## Before / After

| Test | Before | After | Speedup |
|---|---|---|---|
| `TestP0TokenRotationKeepsWebSocketAlive` (单 test wall) | ~1.16s | **~0.03s** | **38×** |
| `internal/ws/` (full pkg) | ~6.3s | **~1.3s** | **4.8×** |

## 反约束

- `go test ./...` 全 PASS — 无行为级 regression
- production cookie shape (HttpOnly / SameSite=Lax / MaxAge=7d / Name=borgee_token) 全不变
- nil Clock fallback 路径 byte-identical 跟 `time.Now()` (5 unit test 守)
- 跨 milestone JWT 锁链不破: AL-1a #249 / RT-1 cursor / AL-2b #481 ack frame 等所有 token-aware 路径

## REG-PJC-001..005 (acceptance template)

| ID | 锚点 | Evidence |
|---|---|---|
| REG-PJC-001 | AuthHandler.Clock 公开 seam, nil-safe fallback | `auth_clock_injection_test.go::TestAuthHandler_StructFieldExposed` + `_NilClock_FallsBackToTimeNow` PASS |
| REG-PJC-002 | Server.SetClock 注入 — AuthHandler.Clock 字段后置 wire | `server.go::SetClock` 单 seam, 测试 `NewTestServerWithFakeClock` 走此路径 |
| REG-PJC-003 | Fake clock Advance(N) → JWT iat 真前进 N 秒 | `_FakeClock_AdvancesIAT` (delta==5s) PASS |
| REG-PJC-004 | Fake Advance 无真 sleep (wall-clock <100ms) | `_FakeClock_NoRealSleep` PASS |
| REG-PJC-005 | production path byte-identical (cookie shape 全不变) | `_ProductionPath_NoBehaviorChange` PASS |

## Follow-up 留账

- Server-side JWT verify (`auth.AuthMiddleware`) 仍走 stdlib `time.Now` — 测试 fake 起点必须 `time.Now()` 而非任意 epoch. 全 clock 注入 (verify path 也 inject) 留 future PR (改动跨 stdlib jwt parser, ROI 低).
- `auth_coverage_test.go` 4 处 `time.Now().Add(...)` mint 也可改 fake (但已快, 0.2s 全包, ROI 低)

## 退出条件

- `go test ./...` 全 PASS
- token rotation test ≤0.1s wall-clock
- 烈马自签
- REG-PJC-001..005 5 🟢
