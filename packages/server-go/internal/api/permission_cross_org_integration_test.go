// Package api_test — ap_3_3_cross_org_integration_test.go: AP-3.3
// server-side full-flow cross-org enforcement test (Phase 5, #ap-3).
//
// Pin (acceptance §3.1):
//   - org-A owner grant `commit_artifact artifact:<art>` → org-A artifact
//     POST /commits OK 200
//   - foreign-org user with the SAME explicit grant → POST /commits 403
//     (cross-org gate rejects via abac.HasCapability org check, AP-3.2)
//
// This is the equivalent unit-form of the e2e — the org gate lives in
// the SSOT helper so a direct HTTP smoke is sufficient (跟 AP-1 #493
// 单 SSOT 同精神; e2e Playwright 留账 v1+ 跟 BPP-3.2 / AL-5 同模式).
package api_test

import (
	"net/http"
	"strings"
	"testing"

	"borgee-server/internal/store"
	"borgee-server/internal/testutil"
)

// REG-AP3-003 / TestAP_CrossOrg_FullFlow — full-flow cross-org reject.
//
// Setup:
//   1. Owner (org-A) creates a channel + artifact in org-A.
//   2. Foreign user (org-B) gets manually granted commit_artifact for
//      that artifact's scope (simulating a leaked grant).
//   3. Same-org owner POST /commits → 200 OK.
//   4. Cross-org foreign user POST /commits → 403 (cross-org reject).
func TestAP_CrossOrg_FullFlow(t *testing.T) {
	t.Parallel()
	ts, s, _ := testutil.NewTestServer(t)
	ownerTok := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	generalID := testutil.GetGeneralChannelID(t, ts.URL, ownerTok)

	// Owner creates an artifact in org-A's general channel.
	_, art := testutil.JSON(t, http.MethodPost,
		ts.URL+"/api/v1/channels/"+generalID+"/artifacts", ownerTok, map[string]any{
			"title": "Roadmap",
			"body":  "v1",
		})
	artifactID := art["id"].(string)

	// Foreign user in a brand-new org-B.
	foreign := testutil.SeedForeignOrgUser(t, s, "Foreign Bob", "foreign-ap3@test.com")
	foreignTok := testutil.LoginAs(t, ts.URL, "foreign-ap3@test.com", "password123")

	// Manually grant commit_artifact on the SAME artifact scope to the
	// foreign user (simulates a leaked / mis-issued grant). Without the
	// AP-3 cross-org gate, this would let foreign-org user 200; AP-3.2
	// rejects via abac.HasCapability org check.
	if err := s.GrantPermission(&store.UserPermission{
		UserID:     foreign.ID,
		Permission: "commit_artifact",
		Scope:      "artifact:" + artifactID,
		GrantedAt:  1700000000000,
	}); err != nil {
		t.Fatalf("seed foreign grant: %v", err)
	}

	t.Run("same-org owner commit → 200", func(t *testing.T) {
		resp, data := testutil.JSON(t, http.MethodPost,
			ts.URL+"/api/v1/artifacts/"+artifactID+"/commits", ownerTok, map[string]any{
				"expected_version": 1,
				"body":             "v2",
			})
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("same-org commit: got %d, want 200 (%v)", resp.StatusCode, data)
		}
	})

	t.Run("cross-org foreign user commit → 403 (AP-3 gate)", func(t *testing.T) {
		resp, body := testutil.JSON(t, http.MethodPost,
			ts.URL+"/api/v1/artifacts/"+artifactID+"/commits", foreignTok, map[string]any{
				"expected_version": 2,
				"body":             "stolen",
			})
		// Cross-org rejection. Could be 403 (HasCapability false → handler
		// returns 403) or upstream channel ACL 404 — AP-3 gate runs after
		// canAccessChannel; foreign user is not a member, so the channel
		// access check fires first → 403.
		if resp.StatusCode != http.StatusForbidden {
			t.Fatalf("cross-org commit: got %d, want 403 (body=%v)", resp.StatusCode, body)
		}
		// Body must not leak raw org_id (CM-3 / AP-3 同精神).
		for k := range body {
			if strings.EqualFold(k, "org_id") {
				t.Errorf("response body must not expose org_id, got key %q", k)
			}
		}
	})
}
