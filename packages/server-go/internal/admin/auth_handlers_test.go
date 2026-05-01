package admin_test

// TEST-FIX-3-COV: cover 0% admin auth funcs (handleMe / handleLogout /
// DeleteSession / DeleteSessionsForAdmin / AdminFromContext) directly.

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"borgee-server/internal/admin"
)

func TestDeleteSession_AndForAdmin(t *testing.T) {
	t.Parallel()
	db := openMigratedDB(t)
	if err := admin.BootstrapWith(db, "root", hashAt(t, "pw", 10)); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	a, err := admin.FindByLogin(db, "root")
	if err != nil || a == nil {
		t.Fatalf("FindByLogin: %v", err)
	}

	// DeleteSession on empty token = no-op nil.
	if err := admin.DeleteSession(db, ""); err != nil {
		t.Fatalf("DeleteSession empty: %v", err)
	}

	tok, err := admin.CreateSession(db, a.ID, time.Now())
	if err != nil {
		t.Fatalf("CreateSession: %v", err)
	}
	if err := admin.DeleteSession(db, tok); err != nil {
		t.Fatalf("DeleteSession: %v", err)
	}
	// Already gone — second delete is also nil-error idempotent.
	if err := admin.DeleteSession(db, tok); err != nil {
		t.Fatalf("DeleteSession idempotent: %v", err)
	}

	// Re-create + DeleteSessionsForAdmin.
	if _, err := admin.CreateSession(db, a.ID, time.Now()); err != nil {
		t.Fatalf("CreateSession 2: %v", err)
	}
	if _, err := admin.CreateSession(db, a.ID, time.Now()); err != nil {
		t.Fatalf("CreateSession 3: %v", err)
	}
	if err := admin.DeleteSessionsForAdmin(db, a.ID); err != nil {
		t.Fatalf("DeleteSessionsForAdmin: %v", err)
	}
}

func TestHandleLogout(t *testing.T) {
	t.Parallel()
	db := openMigratedDB(t)
	if err := admin.BootstrapWith(db, "root", hashAt(t, "pw", 10)); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	mux := http.NewServeMux()
	(&admin.Handler{DB: db, IsDevelopment: true}).RegisterRoutes(mux)
	srv := httptest.NewServer(mux)
	defer srv.Close()

	// 1. Logout without a cookie — still returns 200.
	resp, err := http.Post(srv.URL+"/admin-api/auth/logout", "application/json", nil)
	if err != nil {
		t.Fatalf("POST: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("logout no-cookie: %d", resp.StatusCode)
	}

	// 2. Logout with a real session cookie — deletes session, returns 200.
	a, _ := admin.FindByLogin(db, "root")
	tok, _ := admin.CreateSession(db, a.ID, time.Now())
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/admin-api/auth/logout", nil)
	req.AddCookie(&http.Cookie{Name: admin.CookieName, Value: tok})
	resp2, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST 2: %v", err)
	}
	resp2.Body.Close()
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("logout: %d", resp2.StatusCode)
	}
}

func TestHandleMe(t *testing.T) {
	t.Parallel()
	db := openMigratedDB(t)
	if err := admin.BootstrapWith(db, "root", hashAt(t, "pw", 10)); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	mux := http.NewServeMux()
	(&admin.Handler{DB: db, IsDevelopment: true}).RegisterRoutes(mux)
	srv := httptest.NewServer(mux)
	defer srv.Close()

	// 1. /me without cookie → 401 (RequireAdmin → handleMe never reached;
	//    handleMe's nil branch is exercised only when admin not in ctx).
	resp, err := http.Get(srv.URL + "/admin-api/auth/me")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("me no-cookie: %d", resp.StatusCode)
	}

	// 2. /me with valid session cookie → 200 + JSON.
	a, _ := admin.FindByLogin(db, "root")
	tok, _ := admin.CreateSession(db, a.ID, time.Now())
	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/admin-api/auth/me", nil)
	req.AddCookie(&http.Cookie{Name: admin.CookieName, Value: tok})
	resp2, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("GET 2: %v", err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("me: %d", resp2.StatusCode)
	}
	var body map[string]any
	if err := json.NewDecoder(resp2.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["login"] != "root" {
		t.Fatalf("me login=%v", body["login"])
	}
}

func TestAdminFromContext(t *testing.T) {
	t.Parallel()
	// nil context → nil admin (default branch).
	if got := admin.AdminFromContext(context.Background()); got != nil {
		t.Fatalf("expected nil admin, got %+v", got)
	}
	// We can't directly populate the unexported context key; the populated
	// branch is exercised via handleMe (TestHandleMe above), which
	// goes through RequireAdmin → ctx.WithValue → handleMe → AdminFromContext
	// with a non-nil admin value — covering the (a, ok)=true branch.
}

func TestWithAdminContext(t *testing.T) {
	t.Parallel()
	// WithAdminContext is the test-only seam exported for ADM-2-FOLLOWUP
	// helper unit tests (api.RequireImpersonationGrant). Round-trip:
	// WithAdminContext → AdminFromContext returns the same *Admin.
	a := &admin.Admin{ID: "a1", Login: "root"}
	ctx := admin.WithAdminContext(context.Background(), a)
	got := admin.AdminFromContext(ctx)
	if got == nil || got.ID != "a1" || got.Login != "root" {
		t.Fatalf("WithAdminContext round-trip failed; got=%+v", got)
	}
}
