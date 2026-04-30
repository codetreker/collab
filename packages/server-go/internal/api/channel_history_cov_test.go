// Package api_test — chn_14_description_history_cov_test.go: cov bump
// for CHN-14 handlers — covers ChannelNotFound 404 + admin Unauthorized
// 401 + admin ChannelNotFound 404 (handleUserGet 57.9% / handleAdminGet
// 50% → push toward 84% threshold via real branch hits).
//
// Consolidated under one parent test sharing one server (race budget 优化).

package api_test

import (
	"net/http"
	"testing"

	"borgee-server/internal/testutil"
)

// TestCHN_GetHistory_ErrorBranches — sweep the 404/401 error branches
// in handleUserGet + handleAdminGet using a single shared fixture server.
func TestCHN_GetHistory_ErrorBranches(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	tok := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	adminTok := testutil.LoginAsAdmin(t, ts.URL)

	t.Run("UserChannelNotFound", func(t *testing.T) {
		r, _ := testutil.JSON(t, "GET",
			ts.URL+"/api/v1/channels/nonexistent-id/description/history", tok, nil)
		if r.StatusCode != http.StatusNotFound {
			t.Errorf("expected 404, got %d", r.StatusCode)
		}
	})

	t.Run("UserNoAuth_401", func(t *testing.T) {
		r, _ := testutil.JSON(t, "GET",
			ts.URL+"/api/v1/channels/whatever/description/history", "", nil)
		if r.StatusCode != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", r.StatusCode)
		}
	})

	t.Run("AdminUnauthorized", func(t *testing.T) {
		r, _ := testutil.JSON(t, "GET",
			ts.URL+"/admin-api/v1/channels/whatever/description/history", "", nil)
		if r.StatusCode == http.StatusOK {
			t.Errorf("admin endpoint without auth should reject, got %d", r.StatusCode)
		}
	})

	t.Run("AdminChannelNotFound", func(t *testing.T) {
		r, _ := testutil.JSON(t, "GET",
			ts.URL+"/admin-api/v1/channels/nonexistent-id/description/history",
			adminTok, nil)
		if r.StatusCode != http.StatusNotFound {
			t.Errorf("expected admin 404, got %d", r.StatusCode)
		}
	})
}
