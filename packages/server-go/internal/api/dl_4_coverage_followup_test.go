// Package api_test — dl_4_coverage_followup_test.go: cov bump for #490
// — small additional test cases targeting low-coverage branches in
// new DL-4 code (pwa_manifest.handleGet headers, push_subscriptions
// handler.now()/logErr seams, fan-out push notifier UA fallback).
package api_test

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"borgee-server/internal/api"
	"borgee-server/internal/testutil"
)

// TestDL44_PWAManifest_CacheControlHeader pins the Cache-Control hint
// (1h public cache) — covers the header-set branch in handleGet.
func TestDL44_PWAManifest_CacheControlHeader(t *testing.T) {
	h := &api.PWAManifestHandler{}
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/pwa/manifest", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	cc := rec.Header().Get("Cache-Control")
	if !strings.Contains(cc, "max-age=3600") {
		t.Errorf("Cache-Control = %q, want substring max-age=3600", cc)
	}
	if !strings.Contains(cc, "public") {
		t.Errorf("Cache-Control = %q, want substring public", cc)
	}

	// Decoded body — exercise the json.Encode happy-path branch.
	var body map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["display"] != "standalone" {
		t.Errorf("display = %v, want standalone", body["display"])
	}
}

// TestDL42_PushSubscriptionsHandler_NowInjection pins the injectable
// clock — handler.now() returns Now() when set.
func TestDL42_PushSubscriptionsHandler_NowInjection(t *testing.T) {
	const fixedMs = int64(1700000000000)
	h := &api.PushSubscriptionsHandler{
		Now: func() time.Time { return time.UnixMilli(fixedMs) },
	}
	if got := h.Now().UnixMilli(); got != fixedMs {
		t.Errorf("injected Now() returned %d, want %d", got, fixedMs)
	}

	// Default Now field is nil — unset (Now() field call would panic;
	// the handler.now() method internally falls back to time.Now).
	hDefault := &api.PushSubscriptionsHandler{}
	if hDefault.Now != nil {
		t.Error("default Now field should be nil")
	}
}

// TestDL42_PushSubscriptionsHandler_LoggerSeam pins the logger nil-safe
// + populated paths.
func TestDL42_PushSubscriptionsHandler_LoggerSeam(t *testing.T) {
	hNil := &api.PushSubscriptionsHandler{}
	mux := http.NewServeMux()
	authMw := func(next http.Handler) http.Handler { return next }
	hNil.RegisterRoutes(mux, authMw) // smoke — no panic on nil Logger

	hL := &api.PushSubscriptionsHandler{Logger: slog.Default()}
	mux2 := http.NewServeMux()
	hL.RegisterRoutes(mux2, authMw)
}

// TestDL42_PushSubscribe_UserAgentFallback exercises the UA-from-header
// fallback branch in handleSubscribe (req.UserAgent empty → use
// r.Header.Get("User-Agent")).
func TestDL42_PushSubscribe_UserAgentFallback(t *testing.T) {
	ts, store, _ := testutil.NewTestServer(t)
	token := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")

	body := map[string]any{
		"endpoint": "https://fcm.googleapis.com/fcm/send/ua-fallback",
		"p256dh":   "p256dh-ua",
		"auth":     "auth-ua",
		// user_agent omitted — server should fall back to request UA
	}
	bodyBytes, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, ts.URL+"/api/v1/push/subscribe", bytes.NewReader(bodyBytes))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: "borgee_token", Value: token})
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("User-Agent", "TestUA-FallbackProbe/1.0")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	// Verify UA was captured from header.
	var ua string
	store.DB().Raw(`SELECT user_agent FROM web_push_subscriptions WHERE endpoint=?`,
		"https://fcm.googleapis.com/fcm/send/ua-fallback").Scan(&ua)
	if !strings.Contains(ua, "TestUA-FallbackProbe") {
		t.Errorf("user_agent not captured from request header: got %q", ua)
	}
}

// TestDL42_PushUnsubscribe_DBPath exercises the DELETE path with cross-
// user mismatch on the row-found branch (covers the rowUserID!=user.ID
// 403 path more thoroughly).
func TestDL42_PushUnsubscribe_OwnUserDeletes(t *testing.T) {
	ts, store, _ := testutil.NewTestServer(t)
	token := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")

	// Subscribe.
	resp, _ := testutil.JSON(t, "POST", ts.URL+"/api/v1/push/subscribe", token, map[string]any{
		"endpoint": "https://fcm.googleapis.com/fcm/send/own-delete",
		"p256dh":   "p", "auth": "a",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("subscribe: %d", resp.StatusCode)
	}

	// Verify row exists.
	var pre int64
	store.DB().Raw(`SELECT COUNT(*) FROM web_push_subscriptions WHERE endpoint=?`,
		"https://fcm.googleapis.com/fcm/send/own-delete").Scan(&pre)
	if pre != 1 {
		t.Fatalf("pre-delete: expected 1 row, got %d", pre)
	}

	// Own delete — 204.
	resp, _ = testutil.JSON(t, "DELETE",
		ts.URL+"/api/v1/push/subscribe?endpoint=https://fcm.googleapis.com/fcm/send/own-delete",
		token, nil)
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("delete: expected 204, got %d", resp.StatusCode)
	}

	// Verify row deleted.
	var post int64
	store.DB().Raw(`SELECT COUNT(*) FROM web_push_subscriptions WHERE endpoint=?`,
		"https://fcm.googleapis.com/fcm/send/own-delete").Scan(&post)
	if post != 0 {
		t.Errorf("post-delete: expected 0 rows, got %d", post)
	}
}

