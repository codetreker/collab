package api_test

import (
	"net/http"
	"testing"

	"borgee-server/internal/testutil"
)

// TestGetMessages_LegacyAgentNoReadPerm_403 — AP-0-bis reverse assertion.
//
// A legacy agent (only message.send, no message.read) hitting
// GET /api/v1/channels/:id/messages must be rejected with 403. This is the
// motivation for migration v=8 backfill: until that ran, every old agent in
// the wild would 403 on messages list. New agents created via
// store.GrantDefaultPermissions automatically get message.read (queries.go),
// so the only way to hit this branch is the legacy fixture.
func TestGetMessages_LegacyAgentNoReadPerm_403(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)

	agent := testutil.SeedLegacyAgent(t, s, "Legacy Agent")

	// Login via the user-API. NewTestServer's LoginAs uses email/password.
	token := testutil.LoginAs(t, ts.URL, *agent.Email, "password123")

	channelID := testutil.GetGeneralChannelID(t, ts.URL, token)

	resp, _ := testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/channels/"+channelID+"/messages", token, nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 for legacy agent without message.read, got %d", resp.StatusCode)
	}
}

// TestGetMessages_NewAgentWithDefaultPerms_200 — positive control.
//
// A newly-registered agent gets message.read in default grants (queries.go
// AP-0-bis). The same GET should succeed.
func TestGetMessages_AgentWithReadPerm_200(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)

	agent := testutil.SeedLegacyAgent(t, s, "Modern Agent")
	// Top up to the AP-0-bis default. This mirrors what the migration backfill
	// would have produced for an existing agent, or what
	// GrantDefaultPermissions(agentID, "agent") gives a new one.
	if err := s.GrantDefaultPermissions(agent.ID, "agent"); err != nil {
		t.Fatalf("grant default agent perms: %v", err)
	}

	token := testutil.LoginAs(t, ts.URL, *agent.Email, "password123")
	channelID := testutil.GetGeneralChannelID(t, ts.URL, token)

	resp, _ := testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/channels/"+channelID+"/messages", token, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for agent with message.read, got %d", resp.StatusCode)
	}
}
