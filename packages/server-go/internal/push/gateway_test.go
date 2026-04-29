// Package push_test — gateway_test.go: DL-4.3 Web Push gateway unit
// tests. Validates:
//
//   - NewNoopGateway: zero-emit + counts==0 (dev/test isolation seam)
//   - NewGateway env validation: missing VAPID env → error (跟 admin
//     Bootstrap 区分 — push 是体验补丁, 不 fail-loud panic)
//   - Send: subscription scan + per-row emit attempts (count returned)
//   - 410 Gone path: subscription DELETE GC (单源退订, 蓝图 L22)
//
// 反约束: 不验证真 web-push wire encryption (那是 SherClockHolmes/webpush-go
// 库的事), 只验证 gateway scan + dispatch + GC path 路径 byte-identical.
package push_test

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"borgee-server/internal/push"
	"borgee-server/internal/testutil"
)

// TestDL43_NoopGateway pins dev/test isolation — Send always returns 0
// without emitting, no env required.
func TestDL43_NoopGateway(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	g := push.NewNoopGateway(logger)
	if g == nil {
		t.Fatal("NewNoopGateway returned nil")
	}

	got := g.Send(context.Background(), "user-A", map[string]any{"title": "test"})
	if got != 0 {
		t.Errorf("noopGateway.Send returned %d, want 0", got)
	}
}

// TestDL43_NewGateway_RequiresEnv pins fail-soft on missing VAPID env —
// returns error, caller falls back to noop (跟 admin Bootstrap 区分:
// admin fail-loud panic, push 不阻 server 启动).
func TestDL43_NewGateway_RequiresEnv(t *testing.T) {
	t.Setenv("BORGEE_VAPID_PUBLIC_KEY", "")
	t.Setenv("BORGEE_VAPID_PRIVATE_KEY", "")
	t.Setenv("BORGEE_VAPID_SUBJECT", "")

	_, _, srv := testutil.NewTestServer(t)
	if srv == nil {
		t.Fatal("test server not constructed")
	}

	// Use the test server's store via testutil (NewTestServer returns store).
	ts2, store, _ := testutil.NewTestServer(t)
	_ = ts2
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	g, err := push.NewGateway(store, logger)
	if err == nil {
		t.Errorf("NewGateway with empty env expected error, got gateway %v", g)
	}
	if g != nil {
		t.Errorf("NewGateway with empty env expected nil gateway, got %v", g)
	}
}

// TestDL43_NewGateway_AllEnvSet pins success path — all 3 env vars set,
// constructor returns gateway (no validation of key validity, that's
// runtime emit's job).
func TestDL43_NewGateway_AllEnvSet(t *testing.T) {
	t.Setenv("BORGEE_VAPID_PUBLIC_KEY", "test-public-key-base64")
	t.Setenv("BORGEE_VAPID_PRIVATE_KEY", "test-private-key-base64")
	t.Setenv("BORGEE_VAPID_SUBJECT", "mailto:admin@borgee.test")

	_, store, _ := testutil.NewTestServer(t)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	g, err := push.NewGateway(store, logger)
	if err != nil {
		t.Fatalf("NewGateway with all env set failed: %v", err)
	}
	if g == nil {
		t.Fatal("NewGateway with all env set returned nil gateway")
	}
}

// TestDL43_Send_ZeroSubscriptions pins fan-out empty case — user with
// no registered subscription returns 0 attempts, no error, no panic.
func TestDL43_Send_ZeroSubscriptions(t *testing.T) {
	t.Setenv("BORGEE_VAPID_PUBLIC_KEY", "test-public-key-base64")
	t.Setenv("BORGEE_VAPID_PRIVATE_KEY", "test-private-key-base64")
	t.Setenv("BORGEE_VAPID_SUBJECT", "mailto:admin@borgee.test")

	_, store, _ := testutil.NewTestServer(t)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	g, err := push.NewGateway(store, logger)
	if err != nil {
		t.Fatal(err)
	}

	got := g.Send(context.Background(), "user-with-no-subs", map[string]any{"title": "test"})
	if got != 0 {
		t.Errorf("Send to user with 0 subs returned %d attempts, want 0", got)
	}
}

// TestDL43_Send_410GoneDeletesRow pins 单源退订 — push response 410 →
// gateway DELETEs the row (蓝图 L22 字面 "退订" 单源).
//
// Uses a fake HTTP server returning 410 for any push attempt + a
// pre-seeded subscription row.
func TestDL43_Send_410GoneDeletesRow(t *testing.T) {
	// Fake VAPID-aware push endpoint that always returns 410.
	fake410 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusGone)
	}))
	t.Cleanup(fake410.Close)

	t.Setenv("BORGEE_VAPID_PUBLIC_KEY", "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM")
	t.Setenv("BORGEE_VAPID_PRIVATE_KEY", "VDDPAhPIpgUyflfJYadkD6NqHIXmCVT54iqQGTtrwM4")
	t.Setenv("BORGEE_VAPID_SUBJECT", "mailto:admin@borgee.test")

	_, store, _ := testutil.NewTestServer(t)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	g, err := push.NewGateway(store, logger)
	if err != nil {
		t.Fatal(err)
	}

	// Seed a subscription row pointing at the fake 410 endpoint.
	if err := store.DB().Exec(`INSERT INTO web_push_subscriptions
		(id, user_id, endpoint, p256dh_key, auth_key, user_agent, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		"sub-410-1", "user-410", fake410.URL+"/push/test",
		"BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
		"tBHItJI5svbpez7KI4CCXg",
		"TestUA", 1700000000000).Error; err != nil {
		t.Fatal(err)
	}

	// Verify pre-state: 1 row exists.
	var preCount int64
	store.DB().Raw(`SELECT COUNT(*) FROM web_push_subscriptions WHERE user_id=?`, "user-410").Scan(&preCount)
	if preCount != 1 {
		t.Fatalf("pre-state: expected 1 row, got %d", preCount)
	}

	attempts := g.Send(context.Background(), "user-410", map[string]any{"title": "test"})
	if attempts != 1 {
		t.Errorf("Send returned %d attempts, want 1", attempts)
	}

	// Post-state: 410 GC deleted the row.
	var postCount int64
	store.DB().Raw(`SELECT COUNT(*) FROM web_push_subscriptions WHERE user_id=?`, "user-410").Scan(&postCount)
	if postCount != 0 {
		t.Errorf("post-state: expected 0 rows after 410 GC, got %d (蓝图 L22 单源退订 broken)", postCount)
	}
}

// TestDL43_Gateway_InterfaceShape pins the seam — both noop and vapid
// gateways satisfy the Gateway interface (compile-time gate).
func TestDL43_Gateway_InterfaceShape(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	var g push.Gateway = push.NewNoopGateway(logger)
	if g == nil {
		t.Fatal("noop must satisfy Gateway")
	}
	// vapid gateway satisfaction tested by TestDL43_NewGateway_AllEnvSet.
}

// helper to silence unused lint when tests evolve.
var _ = bytes.NewReader
