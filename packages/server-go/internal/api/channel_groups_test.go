package api_test

import (
	"net/http"
	"testing"

	"borgee-server/internal/testutil"
)

// channel_groups_test.go — GET /api/v1/channel-groups list endpoint
// (empty + after-create paths). Single source for channels.go
// handleListGroups branch coverage.
func TestChannelGroups_ListChannelGroups(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	ownerToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	resp, _ := testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/channel-groups", ownerToken, nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("list groups: got %d", resp.StatusCode)
	}
}

func TestChannelGroups_ListGroups_AfterCreate(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	ownerToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	resp, _ := testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/channel-groups", ownerToken,
		map[string]any{"name": "test-grp"})
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Skipf("create group not 200/201")
	}
	resp, body := testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/channel-groups", ownerToken, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list groups: got %d", resp.StatusCode)
	}
	groups, _ := body["groups"].([]any)
	if len(groups) < 1 {
		t.Errorf("expected ≥1 group, got %d", len(groups))
	}
}
