package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"borgee-server/internal/store"
)

func TestHashAndCheckPassword(t *testing.T) {
	t.Parallel()
	hash, err := HashPassword("mypassword")
	if err != nil {
		t.Fatal(err)
	}
	if !CheckPassword("mypassword", hash) {
		t.Fatal("password should match")
	}
	if CheckPassword("wrongpassword", hash) {
		t.Fatal("wrong password should not match")
	}
}

func testStore(t *testing.T) *store.Store {
	t.Helper()
	s, err := store.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	if err := s.DB().AutoMigrate(&store.User{}, &store.UserPermission{}); err != nil {
		t.Fatal(err)
	}
	return s
}

// TestRequirePermission_AdminRoleNoLongerShortcuts asserts ADM-0.2 §1 反向断言
// 2.D: a user row with role=='admin' but no explicit permission grants now
// receives 403 from RequirePermission. The legacy shortcut at this site is
// gone; admin authority lives on the admin-rail (admin_sessions cookie) only.
func TestRequirePermission_AdminRoleNoLongerShortcuts(t *testing.T) {
	t.Parallel()
	s := testStore(t)
	admin := &store.User{ID: "admin1", DisplayName: "Admin", Role: "admin"}
	s.CreateUser(admin)

	handler := RequirePermission(s, "channel.create", nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req = req.WithContext(context.WithValue(req.Context(), userContextKey, admin))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 (admin shortcut removed), got %d", rec.Code)
	}
}

func TestRequirePermission_MemberWithPerm(t *testing.T) {
	t.Parallel()
	s := testStore(t)
	member := &store.User{ID: "m1", DisplayName: "Member", Role: "member"}
	s.CreateUser(member)
	s.GrantPermission(&store.UserPermission{UserID: "m1", Permission: "channel.create", Scope: "*"})

	handler := RequirePermission(s, "channel.create", nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req = req.WithContext(context.WithValue(req.Context(), userContextKey, member))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestRequirePermission_MemberWithoutPerm(t *testing.T) {
	t.Parallel()
	s := testStore(t)
	member := &store.User{ID: "m2", DisplayName: "Member", Role: "member"}
	s.CreateUser(member)

	handler := RequirePermission(s, "channel.create", nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req = req.WithContext(context.WithValue(req.Context(), userContextKey, member))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
}

func TestRequirePermission_NoUser(t *testing.T) {
	t.Parallel()
	s := testStore(t)

	handler := RequirePermission(s, "channel.create", nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}
