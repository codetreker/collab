# Server: Testing 工具 (testutil)

> 同步 `packages/server-go/internal/testutil/` 当前状态。
> Blueprint 对应: [`../../blueprint/`](../../blueprint/) — testing 不是产品立场, 这里只描述 **当前实现**。

## 总览

| 子包 | 路径 | 用途 |
|------|------|------|
| `clock` | `internal/testutil/clock/` | Clock 接口 + Real / Fake 实现, 替代 `time.Now()` 直调 |
| (legacy) | `internal/testutil/server.go` | 历史遗留, 启服务 + ws 工具, 保留不动 |

## clock 子包 (INFRA-1b.1)

### 接口

```go
type Clock interface {
    Now() time.Time
    Since(t time.Time) time.Duration
    After(d time.Duration) <-chan time.Time
    Sleep(d time.Duration)
}
```

### 实现

- **`clock.NewReal()`** — 生产用, 直接代理 stdlib `time` 包。
- **`clock.NewFake(start time.Time)`** — 测试用, 时间只在显式 `Set` / `Advance` 时变。
  - `start = time.Time{}` → 默认 epoch `2025-01-01 UTC` (输出可重复)
  - `Advance(d)` → d ≤ 0 时静默忽略 (避免测试代码意外回退)
  - `Set(t)` → 跳到 t, deadline 已过的 waiter 立即 fire
  - `After(d) / Sleep(d)` → 等 fake 时间越过 deadline 才 fire; d ≤ 0 立即 fire
  - 并发安全 (mu 保护 now + waiters)

### 用法

生产代码: 注入 `Clock` 而不是直调 `time.Now()`。

```go
type RateLimiter struct {
    clock clock.Clock
    // ...
}

func (r *RateLimiter) Allow() bool {
    now := r.clock.Now()
    // ...
}
```

测试代码:

```go
fake := clock.NewFake(time.Time{})
limiter := NewRateLimiter(fake, ...)
// 不 sleep, 直接快进
fake.Advance(time.Hour)
require.True(t, limiter.Allow())
```

### 当前未接入

`time.Now()` 直调在以下文件还存在 (后续 milestone 替换):
- `internal/api/admin_auth.go` (JWT iat/exp)
- `internal/server/middleware.go` (rate limiter, request log)
- `internal/ws/client.go` (心跳)
- `internal/store/query_gap_test.go` (测试代码可保留)

替换不是 INFRA-1b.1 范围 — 引入 Clock 抽象 + 100% 覆盖单测先, 替换在使用方各自 PR 里做。

## 测试覆盖率

| 包 | 行覆盖率 |
|-----|---------|
| `internal/testutil/clock` | 100.0% |

跑法:
```
cd packages/server-go && go test ./internal/testutil/clock/... -cover
```

## Phase 0 验收 (G0.2 — INFRA-1b)

- [x] **1b.1**: Clock 抽象 + Fake/Real 双实现, ≥ 80% 覆盖率, 1 demo 用例
- [ ] 1b.2: 内存 sqlite + fixture seeder
- [ ] 1b.3: 回归测试入册机制 + Makefile target
