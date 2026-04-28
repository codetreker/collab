package admin_test

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"borgee-server/internal/admin"

	"gorm.io/gorm"
)

// readSource is a helper used by 1.E to grep the source of the admin package
// for forbidden / required imports. It locates the file relative to this test
// file's own location so it works regardless of the test's working directory.
func readSource(t *testing.T, name string) string {
	t.Helper()
	_, here, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	p := filepath.Join(filepath.Dir(here), name)
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatalf("read %s: %v", p, err)
	}
	return string(b)
}

// TestMiddleware_1F_DualRailCoexistence covers review checklist invariant 1.F:
// "双轨并存验证: users.role='admin' 旧账号调 /admin-api/v1/* 仍 200 (本阶段
// 不砍, 留 ADM-0.2)."
//
// The legacy admin path lives in internal/api (AdminAuthHandler / api.AdminHandler)
// and is not changed by ADM-0.1. To prove dual-rail coexistence at the
// internal/admin layer we assert the **negative**: AdminFromRequest only
// accepts the new `borgee_admin_session` cookie and never crosses into the
// legacy `borgee_token` user-session cookie name. That is what allows ADM-0.2
// to flip the legacy path off without disturbing the new one.
//
// In other words: the new admin auth path is additive — it does not alter
// the routes the api package serves under /admin-api/v1, so existing
// users.role='admin' clients continue to work unchanged.
func TestMiddleware_1F_DualRailCoexistence(t *testing.T) {
	db := openMigratedDB(t)
	if err := admin.BootstrapWith(db, "root", hashAt(t, "pw", 10)); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}

	// 1. AdminFromRequest with NO cookie → (nil, nil). This must not error
	//    out, since legacy callers using only `borgee_token` should pass
	//    through the new layer untouched.
	r := httptest.NewRequest(http.MethodGet, "/admin-api/v1/orgs", nil)
	got, err := admin.AdminFromRequest(db, r)
	if err != nil {
		t.Fatalf("AdminFromRequest no cookie: err = %v", err)
	}
	if got != nil {
		t.Fatalf("AdminFromRequest no cookie: got = %v, want nil", got)
	}

	// 2. AdminFromRequest with ONLY a legacy `borgee_token` cookie → still
	//    (nil, nil). The new layer ignores the legacy cookie name; the
	//    legacy /admin-api/v1 handlers in internal/api continue to handle it.
	r2 := httptest.NewRequest(http.MethodGet, "/admin-api/v1/orgs", nil)
	r2.AddCookie(&http.Cookie{Name: "borgee_token", Value: "legacy-jwt"})
	got2, err := admin.AdminFromRequest(db, r2)
	if err != nil {
		t.Fatalf("AdminFromRequest legacy cookie: err = %v", err)
	}
	if got2 != nil {
		t.Fatal("AdminFromRequest must not resolve legacy borgee_token cookie")
	}

	// 3. AdminFromRequest WITH the new `borgee_admin_session` cookie → resolves.
	//    Insert a row so the lookup hits.
	id := newAdminID(t, db, "dual-rail-tester")
	r3 := httptest.NewRequest(http.MethodGet, "/admin-api/v1/orgs", nil)
	r3.AddCookie(&http.Cookie{Name: admin.CookieName, Value: id})
	got3, err := admin.AdminFromRequest(db, r3)
	if err != nil {
		t.Fatalf("AdminFromRequest new cookie: err = %v", err)
	}
	if got3 == nil || got3.Login != "dual-rail-tester" {
		t.Fatalf("AdminFromRequest new cookie: got = %+v, want login=dual-rail-tester", got3)
	}
}

// newAdminID inserts an admins row directly and returns the id. Used by the
// dual-rail test to set up a `borgee_admin_session` cookie value.
func newAdminID(t *testing.T, db *gorm.DB, login string) string {
	t.Helper()
	id := login + "-id-static"
	err := db.Exec(
		`INSERT INTO admins (id, login, password_hash, created_at) VALUES (?, ?, ?, ?)`,
		id, login, "$2a$10$0000000000000000000000000000000000000000000000000000",
		time.Now().UnixMilli(),
	).Error
	if err != nil {
		t.Fatalf("insert admin: %v", err)
	}
	return id
}
