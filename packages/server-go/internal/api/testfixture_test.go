package api

// TEST-FIX-3 testfixture: 共享 fixture 单源 (跟 BPP-3 PluginFrameDispatcher SSOT 同精神).
//
// 历史: TestClosedStoreInternalErrorBranches 11 sub-test 各 inline server.New +
// store.Open + s.Close 重复 ~30 行 boilerplate. 真因 (TEST-FIX-2 #608 诊断):
// 这些 inline boilerplate 漏配 ctx-aware shutdown → goroutine + DB leak 累积.
//
// 修法: 单源 helper newTestServerWithClosedStore / newTestServerWithFaultStore,
// 走 server.New(ctx) ctor (TEST-FIX-2 既有 ctx-aware), 内置 t.Cleanup(cancel)
// 兜底 (Go 1.25 t.Context() 自动 cancel + 显式 cleanup 双保险).
//
// 立场 (test-fix-3-spec §0 立场 ②):
//   - 单源化: 所有 race-heavy / closed-store 类 fixture 走此文件 helper, 反 inline
//     boilerplate (反向 grep `s := server.New` in *_test.go 单源化后 ≤ baseline)
//   - ctx-aware: 严格 t.Context() + WithCancel + t.Cleanup(cancel), 反 Background()
//     leak (#608 真因不复发)
//   - 不引行为: helper 仅 wrap 既有 setupFullTestServer + 加 ctx 兜底, 0 行为改
//
// 跨 milestone 锁链:
//   - 复用 TEST-FIX-2 #608 既有 server.New(ctx) ctor (ctx-aware shutdown)
//   - 复用 setupFullTestServer 内 t.Cleanup(func() { s.Close() }) 模式
//   - 兼容 race_heavy build tag (closed_store_race_test.go 调用此 helper)

import (
	"context"
	"net/http/httptest"
	"testing"

	"borgee-server/internal/config"
	"borgee-server/internal/store"
)

// closedStoreFixtureContext 给 race-heavy sub-test 提供 ctx-aware 兜底.
// Go 1.25 t.Context() 在 test cleanup 自动 cancel; 显式 WithCancel + t.Cleanup
// 是双保险 (反 Background() leak — TEST-FIX-2 #608 真因不复发).
//
// Signature 兼容既有 newClosedStoreTestServer (return 三元组 ts/s/cfg);
// 内部委托 setupFullTestServer (内已有 s.Close cleanup), 加 ctx-aware wrapper.
//
// 使用场景: race-heavy 类 sub-test (TestClosedStoreInternalErrorBranches 等)
// 走此 helper 替代 inline boilerplate.
func closedStoreFixtureContext(t *testing.T) (context.Context, *httptest.Server, *store.Store, *config.Config) {
	t.Helper()
	// 双保险: t.Context() 已有 (Go 1.25 自动 cancel), 加显式 WithCancel + Cleanup
	// 让既有 server.New(ctx) ctor 跟 sweeper / rateLimiter cleanup goroutine 都
	// 拿到 cancel 信号 (TEST-FIX-2 #608 修过的 ctx-aware shutdown 路径).
	ctx, cancel := context.WithCancel(t.Context())
	t.Cleanup(cancel)
	ts, s, cfg := setupFullTestServer(t)
	return ctx, ts, s, cfg
}
