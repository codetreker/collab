// admin_grant_check_test.go — REG-ADM2FU coverage for RequireImpersonationGrant
// helper. Drives all 4 branches: no-admin (401), no-target (400), no-grant
// (403), happy path (true + admin).
package api_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"borgee-server/internal/admin"
	"borgee-server/internal/api"
	"borgee-server/internal/testutil"
)

func TestADM2FU_RequireImpersonationGrant_NoAdmin_401(t *testing.T) {
	t.Parallel()
	_, s, _ := testutil.NewTestServer(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	ok, _ := api.RequireImpersonationGrant(rec, req, s, "any-target")
	if ok {
		t.Fatalf("expected ok=false when no admin in ctx")
	}
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status: want 401, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "impersonate.no_admin") {
		t.Errorf("body should contain impersonate.no_admin: %s", rec.Body.String())
	}
}

func TestADM2FU_RequireImpersonationGrant_NoTarget_400(t *testing.T) {
	t.Parallel()
	_, s, _ := testutil.NewTestServer(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	ctx := admin.WithAdminContext(req.Context(), &admin.Admin{ID: "a1", Login: "tester"})
	req = req.WithContext(ctx)
	ok, _ := api.RequireImpersonationGrant(rec, req, s, "")
	if ok {
		t.Fatalf("expected ok=false when target empty")
	}
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status: want 400, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "impersonate.no_target") {
		t.Errorf("body should contain impersonate.no_target: %s", rec.Body.String())
	}
}

func TestADM2FU_RequireImpersonationGrant_NoGrant_403(t *testing.T) {
	t.Parallel()
	_, s, _ := testutil.NewTestServer(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	ctx := admin.WithAdminContext(req.Context(), &admin.Admin{ID: "a1", Login: "tester"})
	req = req.WithContext(ctx)
	ok, _ := api.RequireImpersonationGrant(rec, req, s, "user-with-no-grant")
	if ok {
		t.Fatalf("expected ok=false when no active grant")
	}
	if rec.Code != http.StatusForbidden {
		t.Errorf("status: want 403, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "impersonate.no_grant") {
		t.Errorf("body should contain impersonate.no_grant: %s", rec.Body.String())
	}
}

func TestADM2FU_RequireImpersonationGrant_Happy(t *testing.T) {
	t.Parallel()
	_, s, _ := testutil.NewTestServer(t)
	owner, _ := s.GetUserByEmail("owner@test.com")
	if owner == nil {
		t.Skip("missing owner fixture")
	}
	if _, err := s.GrantImpersonation(owner.ID); err != nil {
		t.Fatalf("seed grant: %v", err)
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	ctx := admin.WithAdminContext(req.Context(), &admin.Admin{ID: "a1", Login: "tester"})
	req = req.WithContext(ctx)
	ok, a := api.RequireImpersonationGrant(rec, req, s, owner.ID)
	if !ok {
		t.Fatalf("expected ok=true for active grant; rec=%d body=%s", rec.Code, rec.Body.String())
	}
	if a == nil || a.ID != "a1" {
		t.Errorf("expected admin returned; got %+v", a)
	}
}
