// agent_invitations_test.go — CM-4.1 HTTP handler tests.
//
// Coverage targets (per acceptance):
//   - 4 endpoint contract checks (POST/GET list/GET detail/PATCH).
//   - E2E: requester (channel member) invites someone else's agent →
//     agent owner approves → invitation.state == approved AND agent is
//     a channel member.
//   - State machine reuse: PATCH non-pending invitation → 409.
//   - Authz: only requester / agent owner / admin may read; only agent
//     owner (or admin) may PATCH; non-channel-member may not POST.
//
// Note on test setup: agents auto-join public channels at creation time
// (Store.AddUserToPublicChannels). To exercise the invitation flow we
// create a *private* channel owned by the requester — the agent is not
// in it until approval.
package api_test

import (
	"net/http"
	"testing"

	"borgee-server/internal/store"
	"borgee-server/internal/testutil"
)

func createAgent(t *testing.T, serverURL, ownerToken, name string) string {
	t.Helper()
	a := testutil.CreateAgent(t, serverURL, ownerToken, name)
	id, _ := a["id"].(string)
	if id == "" {
		t.Fatalf("agent missing id: %v", a)
	}
	return id
}

// privateChannel — create a private channel via the API and return its id.
// Caller is the only member.
func privateChannel(t *testing.T, serverURL, token, name string) string {
	t.Helper()
	ch := testutil.CreateChannel(t, serverURL, token, name, "private")
	id, _ := ch["id"].(string)
	if id == "" {
		t.Fatalf("private channel missing id: %v", ch)
	}
	return id
}

// E2E: owner@test.com creates a private channel, invites an agent owned by
// member@test.com → member approves → agent joins the private channel.
func TestAgentInvitations_E2E_Approve(t *testing.T) {
	ts, st, _ := testutil.NewTestServer(t)

	requesterTok := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	ownerTok := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")

	channelID := privateChannel(t, ts.URL, requesterTok, "priv-e2e")
	agentID := createAgent(t, ts.URL, ownerTok, "test-agent-e2e")

	// 1. POST /agent_invitations
	resp, body := testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/agent_invitations", requesterTok,
		map[string]any{"channel_id": channelID, "agent_id": agentID})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create invitation: status %d, body %v", resp.StatusCode, body)
	}
	inv, _ := body["invitation"].(map[string]any)
	if inv == nil || inv["state"] != "pending" {
		t.Fatalf("expected pending invitation, got %v", body)
	}
	id, _ := inv["id"].(string)
	if id == "" {
		t.Fatal("invitation missing id")
	}
	for _, k := range []string{"id", "channel_id", "agent_id", "requested_by", "state", "created_at"} {
		if _, ok := inv[k]; !ok {
			t.Fatalf("invitation missing field %q: %v", k, inv)
		}
	}

	// 2. GET /agent_invitations/{id} as requester
	resp, body = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/agent_invitations/"+id, requesterTok, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("get as requester: %d %v", resp.StatusCode, body)
	}

	// 3. PATCH approve as agent owner.
	resp, body = testutil.JSON(t, http.MethodPatch, ts.URL+"/api/v1/agent_invitations/"+id, ownerTok,
		map[string]string{"state": "approved"})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("approve: %d %v", resp.StatusCode, body)
	}
	inv, _ = body["invitation"].(map[string]any)
	if inv["state"] != "approved" {
		t.Fatalf("state = %v, want approved", inv["state"])
	}
	if _, ok := inv["decided_at"]; !ok {
		t.Fatal("decided_at missing on approval")
	}

	// 4. Agent is now a channel member.
	if !st.IsChannelMember(channelID, agentID) {
		t.Fatal("agent should have been added to channel after approval")
	}

	// 5. PATCH again — already terminal, illegal transition → 409.
	resp, body = testutil.JSON(t, http.MethodPatch, ts.URL+"/api/v1/agent_invitations/"+id, ownerTok,
		map[string]string{"state": "rejected"})
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("re-decide approved invitation: status %d (want 409), body %v", resp.StatusCode, body)
	}
}

func TestAgentInvitations_PatchReject(t *testing.T) {
	ts, st, _ := testutil.NewTestServer(t)
	requesterTok := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	ownerTok := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")

	channelID := privateChannel(t, ts.URL, requesterTok, "priv-reject")
	agentID := createAgent(t, ts.URL, ownerTok, "agent-reject")

	resp, body := testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/agent_invitations", requesterTok,
		map[string]any{"channel_id": channelID, "agent_id": agentID})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create: %d %v", resp.StatusCode, body)
	}
	id := body["invitation"].(map[string]any)["id"].(string)

	resp, body = testutil.JSON(t, http.MethodPatch, ts.URL+"/api/v1/agent_invitations/"+id, ownerTok,
		map[string]string{"state": "rejected"})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("reject: %d %v", resp.StatusCode, body)
	}
	if body["invitation"].(map[string]any)["state"] != "rejected" {
		t.Fatalf("state mismatch: %v", body)
	}
	if st.IsChannelMember(channelID, agentID) {
		t.Fatal("rejected invitation must not add agent to channel")
	}
}

func TestAgentInvitations_PostValidation(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	requesterTok := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	ownerTok := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")

	channelID := privateChannel(t, ts.URL, requesterTok, "priv-validation")
	agentID := createAgent(t, ts.URL, ownerTok, "agent-validation")

	// Missing fields.
	resp, _ := testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/agent_invitations", requesterTok,
		map[string]any{"agent_id": agentID})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing channel_id: status %d, want 400", resp.StatusCode)
	}
	resp, _ = testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/agent_invitations", requesterTok,
		map[string]any{"channel_id": channelID})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("missing agent_id: status %d, want 400", resp.StatusCode)
	}

	// Unknown channel / agent.
	resp, _ = testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/agent_invitations", requesterTok,
		map[string]any{"channel_id": "no-such", "agent_id": agentID})
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown channel: status %d, want 404", resp.StatusCode)
	}
	resp, _ = testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/agent_invitations", requesterTok,
		map[string]any{"channel_id": channelID, "agent_id": "no-such"})
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown agent: status %d, want 404", resp.StatusCode)
	}

	// Non-channel-member can't invite. Owner created priv channel; member is not in it.
	resp, _ = testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/agent_invitations", ownerTok,
		map[string]any{"channel_id": channelID, "agent_id": agentID})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("non-member invite: status %d, want 403", resp.StatusCode)
	}

	// Agent already in channel → 409. Use the public general channel
	// (agents auto-join on creation).
	generalID := testutil.GetGeneralChannelID(t, ts.URL, requesterTok)
	resp, _ = testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/agent_invitations", requesterTok,
		map[string]any{"channel_id": generalID, "agent_id": agentID})
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("dup member invite: status %d, want 409", resp.StatusCode)
	}
}

func TestAgentInvitations_PatchValidation(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	requesterTok := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	ownerTok := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")

	channelID := privateChannel(t, ts.URL, requesterTok, "priv-patch-val")
	agentID := createAgent(t, ts.URL, ownerTok, "agent-patch-val")

	resp, body := testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/agent_invitations", requesterTok,
		map[string]any{"channel_id": channelID, "agent_id": agentID})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create: %d %v", resp.StatusCode, body)
	}
	id := body["invitation"].(map[string]any)["id"].(string)

	// Invalid state value → 400.
	resp, _ = testutil.JSON(t, http.MethodPatch, ts.URL+"/api/v1/agent_invitations/"+id, ownerTok,
		map[string]string{"state": "garbage"})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("garbage state: status %d, want 400", resp.StatusCode)
	}
	// owner-action 'expired' is not allowed via API → 400.
	resp, _ = testutil.JSON(t, http.MethodPatch, ts.URL+"/api/v1/agent_invitations/"+id, ownerTok,
		map[string]string{"state": "expired"})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("owner-action expired: status %d, want 400", resp.StatusCode)
	}

	// Non-existent invitation → 404.
	resp, _ = testutil.JSON(t, http.MethodPatch, ts.URL+"/api/v1/agent_invitations/nope", ownerTok,
		map[string]string{"state": "approved"})
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("missing inv: status %d, want 404", resp.StatusCode)
	}
}

func TestAgentInvitations_List(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	requesterTok := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	ownerTok := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")

	channelID := privateChannel(t, ts.URL, requesterTok, "priv-list")
	agentA := createAgent(t, ts.URL, ownerTok, "list-agent-a")
	agentB := createAgent(t, ts.URL, ownerTok, "list-agent-b")

	for _, a := range []string{agentA, agentB} {
		resp, body := testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/agent_invitations", requesterTok,
			map[string]any{"channel_id": channelID, "agent_id": a})
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("seed %s: %d %v", a, resp.StatusCode, body)
		}
	}

	// As owner (default).
	resp, body := testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/agent_invitations", ownerTok, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list owner: %d %v", resp.StatusCode, body)
	}
	invs, _ := body["invitations"].([]any)
	if len(invs) != 2 {
		t.Fatalf("owner list len = %d, want 2", len(invs))
	}

	// As requester.
	resp, body = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/agent_invitations?role=requester", requesterTok, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list requester: %d %v", resp.StatusCode, body)
	}
	invs, _ = body["invitations"].([]any)
	if len(invs) != 2 {
		t.Fatalf("requester list len = %d, want 2", len(invs))
	}

	// Bad role.
	resp, _ = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/agent_invitations?role=bogus", requesterTok, nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad role: %d, want 400", resp.StatusCode)
	}
}

func TestAgentInvitations_GetNotFound(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	tok := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	resp, _ := testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/agent_invitations/nope", tok, nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("missing get: %d, want 404", resp.StatusCode)
	}
}

// Sanitizer must not leak GORM-internal fields. Verifies the response
// keys are exactly the documented contract (飞马 review flag #1).
func TestAgentInvitations_SanitizerKeys(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	requesterTok := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	ownerTok := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")

	channelID := privateChannel(t, ts.URL, requesterTok, "priv-sanitizer")
	agentID := createAgent(t, ts.URL, ownerTok, "agent-sanitizer")
	expiresAt := int64(2_000_000_000_000)

	resp, body := testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/agent_invitations", requesterTok,
		map[string]any{"channel_id": channelID, "agent_id": agentID, "expires_at": expiresAt})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create: %d %v", resp.StatusCode, body)
	}
	inv, _ := body["invitation"].(map[string]any)

	want := map[string]bool{
		"id":             true,
		"channel_id":     true,
		"agent_id":       true,
		"requested_by":   true,
		"state":          true,
		"created_at":     true,
		"expires_at":     true,
		"agent_name":     true, // Bug-029 P0: human label, not raw UUID
		"channel_name":   true,
		"requester_name": true,
		// decided_at omitted on pending — verified below
	}
	for k := range inv {
		if !want[k] {
			t.Errorf("unexpected sanitizer key %q", k)
		}
	}
	if _, ok := inv["decided_at"]; ok {
		t.Errorf("pending invitation should not include decided_at, got %v", inv["decided_at"])
	}
	if int64(inv["expires_at"].(float64)) != expiresAt {
		t.Errorf("expires_at round-trip: got %v", inv["expires_at"])
	}

	// Bug-029 reverse assertion: name fields are populated from the live
	// store JOIN (not raw UUIDs), and the channel_name matches what the
	// requester created above.
	for _, k := range []string{"agent_name", "channel_name", "requester_name"} {
		v, ok := inv[k].(string)
		if !ok {
			t.Errorf("%s missing or non-string in payload: %v", k, inv[k])
			continue
		}
		// raw-UUID guard: an unresolved name must never look like the ID.
		if v == inv["agent_id"] || v == inv["channel_id"] || v == inv["requested_by"] {
			t.Errorf("%s leaks raw UUID: %q", k, v)
		}
	}
	if got := inv["channel_name"]; got != "priv-sanitizer" {
		t.Errorf("channel_name = %v, want priv-sanitizer", got)
	}
}

// Compile-time guard so import "borgee-server/internal/store" stays in
// use even if a future refactor removes the seed call.
var _ = store.AgentInvitationPending

// Empty-input branch: a fresh user with no agents lists as owner.
func TestAgentInvitations_ListEmptyOwner(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)

	registerBody := map[string]any{
		"email": "lonely@test.com", "password": "password123",
		"display_name": "Lonely", "invite_code": "test-invite",
	}
	resp, _ := testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/auth/register", "", registerBody)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		t.Fatalf("register: %d", resp.StatusCode)
	}
	tok := testutil.LoginAs(t, ts.URL, "lonely@test.com", "password123")

	resp, body := testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/agent_invitations", tok, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list: %d %v", resp.StatusCode, body)
	}
	invs, _ := body["invitations"].([]any)
	if len(invs) != 0 {
		t.Fatalf("len = %d, want 0", len(invs))
	}

	resp, body = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/agent_invitations?role=requester", tok, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("requester list: %d %v", resp.StatusCode, body)
	}
}

// Owner (non-admin) reads an invitation for one of their agents. This
// exercises the canSee owner branch (admin path is the only other branch
// covered elsewhere).
func TestAgentInvitations_GetAsAgentOwner(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	requesterTok := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	ownerTok := testutil.LoginAs(t, ts.URL, "member@test.com", "password123") // role=member

	channelID := privateChannel(t, ts.URL, requesterTok, "priv-getowner")
	agentID := createAgent(t, ts.URL, ownerTok, "agent-getowner")

	resp, body := testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/agent_invitations", requesterTok,
		map[string]any{"channel_id": channelID, "agent_id": agentID})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create: %d %v", resp.StatusCode, body)
	}
	id := body["invitation"].(map[string]any)["id"].(string)

	// Agent owner (non-admin) reads → 200.
	resp, body = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/agent_invitations/"+id, ownerTok, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("get as agent owner: %d %v", resp.StatusCode, body)
	}
}

// admin@test.com lists invitations as owner — exercises ListAllAgents
// branch (admins see all-agent invitations).
// ADM-0.3: user-rail GET /api/v1/agent_invitations is owner-scoped (each
// caller sees only their own owned-agent invitations). Cross-user enumeration
// belongs on /admin-api/v1; the user-rail "admin" fixture (now role='member')
// must NOT see the requester's invitation.
func TestAgentInvitations_AdminListSeesAll(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	requesterTok := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	ownerTok := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")
	adminTok := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")

	channelID := privateChannel(t, ts.URL, requesterTok, "priv-adminlist")
	agentID := createAgent(t, ts.URL, ownerTok, "agent-adminlist")

	resp, body := testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/agent_invitations", requesterTok,
		map[string]any{"channel_id": channelID, "agent_id": agentID})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create: %d %v", resp.StatusCode, body)
	}

	resp, body = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/agent_invitations", adminTok, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("admin list: %d %v", resp.StatusCode, body)
	}
	invs, _ := body["invitations"].([]any)
	if len(invs) != 0 {
		t.Fatalf("expected admin user-rail listing to be owner-scoped (0), got %d", len(invs))
	}
}

// Malformed JSON body → 400.
func TestAgentInvitations_BadBody(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	tok := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")

	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/v1/agent_invitations", nil)
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: "borgee_token", Value: tok})
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Body = http.NoBody
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("empty body: %d, want 400", resp.StatusCode)
	}
}

// Non-owner non-admin tries to PATCH → 403.
func TestAgentInvitations_PatchForbidden(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)

	// Register a fresh non-admin user via the public API so we have a
	// non-admin caller that doesn't own the agent.
	registerBody := map[string]any{
		"email":        "third@test.com",
		"password":     "password123",
		"display_name": "Third",
		"invite_code":  "test-invite",
	}
	resp, _ := testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/auth/register", "", registerBody)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		t.Fatalf("register third: %d", resp.StatusCode)
	}
	thirdTok := testutil.LoginAs(t, ts.URL, "third@test.com", "password123")

	requesterTok := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	ownerTok := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")

	channelID := privateChannel(t, ts.URL, requesterTok, "priv-patchforbid")
	agentID := createAgent(t, ts.URL, ownerTok, "agent-patchforbid")

	resp, body := testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/agent_invitations", requesterTok,
		map[string]any{"channel_id": channelID, "agent_id": agentID})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create: %d %v", resp.StatusCode, body)
	}
	id := body["invitation"].(map[string]any)["id"].(string)

	resp, _ = testutil.JSON(t, http.MethodPatch, ts.URL+"/api/v1/agent_invitations/"+id, thirdTok,
		map[string]string{"state": "approved"})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("third-party PATCH: %d, want 403", resp.StatusCode)
	}

	// Same third party tries GET → also 403 (canSee returns false).
	resp, _ = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/agent_invitations/"+id, thirdTok, nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("third-party GET: %d, want 403", resp.StatusCode)
	}
}
