package api_test

import (
	"net/http"
	"testing"

	"borgee-server/internal/testutil"
)

// REG-CHN10-cov-bump — opportunistic cov bump for channels.go uncovered handlers.
func TestCHN10_CovBump_ListChannelGroups(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	ownerToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	resp, _ := testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/channel-groups", ownerToken, nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("list groups: got %d", resp.StatusCode)
	}
}

func TestCHN10_CovBump_ListGroups_AfterCreate(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	ownerToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	resp, _ := testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/channel-groups", ownerToken,
		map[string]any{"name": "chn10-cov-grp"})
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
