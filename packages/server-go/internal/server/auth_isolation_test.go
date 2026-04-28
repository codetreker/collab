package server_test

// auth_isolation_test.go covers ADM-0.2 §1 反向断言:
//   - 2.A: admin session → user-API → 401 (admin cookie does not auth user-rail)
//   - 2.B: user JWT → admin-API → 401 (user cookie does not auth admin-rail)
//   - 2.D: a users.role='admin' user with no explicit (*, *) row hitting the
//          user-rail with their borgee_token gets 403 (legacy shortcut gone).
//
// The two rails (admin_sessions / users) must never cross. After ADM-0.2 the
// only way to be an admin is the borgee_admin_session cookie + admins row.

import (
	"net/http"
	"testing"

	"borgee-server/internal/store"
	"borgee-server/internal/testutil"
)

// 2.A: admin session token must NOT authenticate against the user-rail.
func TestAuthIsolation_2A_AdminSessionRejectedByUserRail(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	adminSession := testutil.LoginAsAdmin(t, ts.URL)

	// 2.A.1: GET /api/v1/users/me with admin session cookie → 401.
	resp, _ := testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/users/me", "", nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("baseline /users/me without auth: expected 401, got %d", resp.StatusCode)
	}

	// 2.A.2: explicitly carry the admin session cookie and confirm 401 still.
	req, _ := http.NewRequest(http.MethodGet, ts.URL+"/api/v1/users/me", nil)
	req.AddCookie(&http.Cookie{Name: "borgee_admin_session", Value: adminSession})
	r2, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do: %v", err)
	}
	defer r2.Body.Close()
	if r2.StatusCode != http.StatusUnauthorized {
		t.Fatalf("admin session against user-rail /users/me: expected 401, got %d", r2.StatusCode)
	}

	// 2.A.3: admin session cookie hitting /api/v1/channels (capability-gated) → 401.
	req3, _ := http.NewRequest(http.MethodGet, ts.URL+"/api/v1/channels", nil)
	req3.AddCookie(&http.Cookie{Name: "borgee_admin_session", Value: adminSession})
	r3, err := http.DefaultClient.Do(req3)
	if err != nil {
		t.Fatalf("do: %v", err)
	}
	defer r3.Body.Close()
	if r3.StatusCode != http.StatusUnauthorized {
		t.Fatalf("admin session against /api/v1/channels: expected 401, got %d", r3.StatusCode)
	}
}

// 2.B: user borgee_token cookie must NOT authenticate against the admin-rail.
// All admin endpoints share admin.RequireAdmin; testing one is sufficient.
func TestAuthIsolation_2B_UserTokenRejectedByAdminRail(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	memberToken := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")
	adminUserToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")

	// 2.B.1: member's borgee_token against /admin-api/v1/users → 401.
	req, _ := http.NewRequest(http.MethodGet, ts.URL+"/admin-api/v1/users", nil)
	req.AddCookie(&http.Cookie{Name: "borgee_token", Value: memberToken})
	r, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do: %v", err)
	}
	defer r.Body.Close()
	if r.StatusCode != http.StatusUnauthorized {
		t.Fatalf("member borgee_token against admin-rail: expected 401, got %d", r.StatusCode)
	}

	// 2.B.2: even a users.role='admin' user's borgee_token must be rejected
	//        by the admin-rail. Admin authority lives in admins table only.
	req2, _ := http.NewRequest(http.MethodGet, ts.URL+"/admin-api/v1/users", nil)
	req2.AddCookie(&http.Cookie{Name: "borgee_token", Value: adminUserToken})
	r2, err := http.DefaultClient.Do(req2)
	if err != nil {
		t.Fatalf("do: %v", err)
	}
	defer r2.Body.Close()
	if r2.StatusCode != http.StatusUnauthorized {
		t.Fatalf("users.role=admin borgee_token against admin-rail: expected 401, got %d", r2.StatusCode)
	}

	// 2.B.3: legacy /api/v1/admin/* mount is gone; any path under it must be
	//        404/501/401 — definitely not 200.
	req3, _ := http.NewRequest(http.MethodGet, ts.URL+"/api/v1/admin/users", nil)
	req3.AddCookie(&http.Cookie{Name: "borgee_token", Value: adminUserToken})
	r3, err := http.DefaultClient.Do(req3)
	if err != nil {
		t.Fatalf("do: %v", err)
	}
	defer r3.Body.Close()
	if r3.StatusCode == http.StatusOK {
		t.Fatalf("legacy /api/v1/admin/users must NOT serve 200, got %d", r3.StatusCode)
	}
}

// 2.D: an existing users.role='admin' user with no (*, *) grant gets 403 on
// gated user-API endpoints. Verifies the RequirePermission shortcut is gone.
func TestAuthIsolation_2D_LegacyAdminRoleNoShortcut(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)

	// Create a fresh admin-role user with NO (*, *) row and only basic seed
	// (no GrantDefaultPermissions for "admin" returns nothing — by design).
	hash := "$2a$10$1TyjYX4YfwjnX5EpcGsH2uY5IUVuZZm4HFZBtMz1m5yBO4qM9Ulr6"
	email := "shortcut-test@example.com"
	u := &store.User{
		ID:           "shortcut-admin",
		DisplayName:  "Shortcut Admin",
		Role:         "admin",
		Email:        &email,
		PasswordHash: hash,
	}
	if err := s.CreateUser(u); err != nil {
		t.Fatalf("create user: %v", err)
	}

	tok := testutil.LoginAs(t, ts.URL, email, "password123")

	// channel.create without (*, *) row and shortcut gone → 403.
	resp, _ := testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/channels", tok, map[string]string{
		"name":       "shortcut-must-403",
		"visibility": "public",
	})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("legacy admin role on user-rail without (*, *): expected 403, got %d", resp.StatusCode)
	}
}
