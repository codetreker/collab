// covbump v7 — additional branch coverage for low-cov handlers post main update.
// Targets: chn_5_archived list happy path with rows (not just empty).
package api_test

import (
	"net/http"
	"testing"

	"borgee-server/internal/store"
	"borgee-server/internal/testutil"
)

// REG-WORKTREE-cov-v7 — chn_5 archived list with rows.
func TestChannelArchivedList(t *testing.T) {
	t.Parallel()
	ts, s, _ := testutil.NewTestServer(t)
	ownerToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	adminToken := testutil.LoginAsAdmin(t, ts.URL)

	owner, _ := s.GetUserByEmail("owner@test.com")
	// Create + archive a channel + add owner as member.
	ch := &store.Channel{
		Name: "v7-archived", Type: "channel", Visibility: "public",
		CreatedBy: owner.ID, Position: store.GenerateInitialRank(),
		OrgID: owner.OrgID,
	}
	if err := s.CreateChannel(ch); err != nil {
		t.Fatalf("create: %v", err)
	}
	if err := s.AddChannelMember(&store.ChannelMember{ChannelID: ch.ID, UserID: owner.ID}); err != nil {
		t.Fatalf("add member: %v", err)
	}
	if _, err := s.ArchiveChannel(ch.ID); err != nil {
		t.Fatalf("archive: %v", err)
	}

	// User-rail GET /me/archived-channels — happy with rows.
	resp, body := testutil.JSON(t, http.MethodGet,
		ts.URL+"/api/v1/me/archived-channels", ownerToken, nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("user list: got %d", resp.StatusCode)
	}
	if _, ok := body["channels"].([]any); !ok {
		t.Errorf("user list channels missing")
	}
	// 401 no auth.
	resp, _ = testutil.JSON(t, http.MethodGet,
		ts.URL+"/api/v1/me/archived-channels", "", nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("user 401: got %d", resp.StatusCode)
	}

	// Admin-rail GET /admin-api/v1/channels/archived — happy with rows.
	resp, body = testutil.JSON(t, http.MethodGet,
		ts.URL+"/admin-api/v1/channels/archived", adminToken, nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("admin list: got %d", resp.StatusCode)
	}
	if _, ok := body["channels"].([]any); !ok {
		t.Errorf("admin list channels missing")
	}
	// 401 no admin token.
	resp, _ = testutil.JSON(t, http.MethodGet,
		ts.URL+"/admin-api/v1/channels/archived", "", nil)
	if resp.StatusCode != http.StatusUnauthorized && resp.StatusCode != http.StatusForbidden {
		t.Errorf("admin no-auth: got %d", resp.StatusCode)
	}
}

// REG-WORKTREE-cov-v7 — chn_6 pin/unpin happy path (post #544 merge baseline).
func TestChannelPinUnpin(t *testing.T) {
	t.Parallel()
	ts, s, _ := testutil.NewTestServer(t)
	ownerToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	owner, _ := s.GetUserByEmail("owner@test.com")
	ch := &store.Channel{
		Name: "v7-pin", Type: "channel", Visibility: "public",
		CreatedBy: owner.ID, Position: store.GenerateInitialRank(),
		OrgID: owner.OrgID,
	}
	if err := s.CreateChannel(ch); err != nil {
		t.Fatalf("create: %v", err)
	}
	if err := s.AddChannelMember(&store.ChannelMember{ChannelID: ch.ID, UserID: owner.ID}); err != nil {
		t.Fatalf("add member: %v", err)
	}
	// Pin happy.
	resp, _ := testutil.JSON(t, http.MethodPost,
		ts.URL+"/api/v1/channels/"+ch.ID+"/pin", ownerToken, nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("pin happy: got %d", resp.StatusCode)
	}
	// Unpin happy.
	resp, _ = testutil.JSON(t, http.MethodDelete,
		ts.URL+"/api/v1/channels/"+ch.ID+"/pin", ownerToken, nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("unpin happy: got %d", resp.StatusCode)
	}
}

// REG-WORKTREE-cov-v7 — agent_runtimes / hb-6 lag derived sample paths.
func TestHeartbeatLagAdminGet(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAsAdmin(t, ts.URL)

	// Empty result happy path.
	resp, body := testutil.JSON(t, http.MethodGet,
		ts.URL+"/admin-api/v1/heartbeat-lag", adminToken, nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("empty hb lag: got %d", resp.StatusCode)
	}
	if _, ok := body["count"]; !ok {
		t.Errorf("count field missing")
	}
	// 401.
	resp, _ = testutil.JSON(t, http.MethodGet,
		ts.URL+"/admin-api/v1/heartbeat-lag", "", nil)
	if resp.StatusCode != http.StatusUnauthorized && resp.StatusCode != http.StatusForbidden {
		t.Errorf("hb lag no-auth: got %d", resp.StatusCode)
	}
}

// REG-WORKTREE-cov-v7 — preview handler full branch coverage.
func TestPreviewBranches(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	ownerToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")

	// 401 no auth.
	resp, _ := testutil.JSON(t, http.MethodPost,
		ts.URL+"/api/v1/artifacts/some-id/preview", "",
		map[string]any{"preview_url": "https://example.com/p.png"})
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("preview 401: got %d", resp.StatusCode)
	}
	// 404 unknown artifact.
	resp, _ = testutil.JSON(t, http.MethodPost,
		ts.URL+"/api/v1/artifacts/nonexistent/preview", ownerToken,
		map[string]any{"preview_url": "https://example.com/p.png"})
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("preview 404: got %d", resp.StatusCode)
	}
}

// REG-WORKTREE-cov-v7 — thumbnail handler 401 + 404.
func TestThumbnailBranches(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	ownerToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")

	resp, _ := testutil.JSON(t, http.MethodPost,
		ts.URL+"/api/v1/artifacts/some-id/thumbnail", "",
		map[string]any{"thumbnail_url": "https://example.com/t.png"})
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("thumbnail 401: got %d", resp.StatusCode)
	}
	resp, _ = testutil.JSON(t, http.MethodPost,
		ts.URL+"/api/v1/artifacts/nonexistent/thumbnail", ownerToken,
		map[string]any{"thumbnail_url": "https://example.com/t.png"})
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("thumbnail 404: got %d", resp.StatusCode)
	}
}

// REG-WORKTREE-cov-v7 — flexPermissions UnmarshalJSON both shapes via POST /agents.
func TestFlexPermissions(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	ownerToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")

	// String array form ["perm1", "perm2"].
	resp, _ := testutil.JSON(t, http.MethodPost,
		ts.URL+"/api/v1/agents", ownerToken, map[string]any{
			"display_name": "v7-agent-strarr",
			"permissions":  []string{"channel.read", "channel.write"},
		})
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Errorf("create with string-arr perms: got %d", resp.StatusCode)
	}
	// Object array form [{permission:"...", scope:"..."}].
	resp, _ = testutil.JSON(t, http.MethodPost,
		ts.URL+"/api/v1/agents", ownerToken, map[string]any{
			"display_name": "v7-agent-objarr",
			"permissions": []map[string]string{
				{"permission": "channel.read", "scope": "*"},
			},
		})
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Errorf("create with obj-arr perms: got %d", resp.StatusCode)
	}
	// Bad JSON — invalid permissions field.
	resp, _ = testutil.JSON(t, http.MethodPost,
		ts.URL+"/api/v1/agents", ownerToken, map[string]any{
			"display_name": "v7-agent-bad",
			"permissions":  "not-an-array",
		})
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("create with bad perms: got %d", resp.StatusCode)
	}
}
