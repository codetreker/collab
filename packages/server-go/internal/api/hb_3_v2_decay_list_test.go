// Package api_test — hb_3_v2_decay_list_test.go: HB-3 v2.2 GET endpoint
// tests.

package api_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"borgee-server/internal/store"
	"borgee-server/internal/testutil"
)

// hb3v2SeedAgentWithHeartbeat creates owner + agent and inserts an
// agent_runtimes row with the given lastHeartbeatAt (Unix ms). Returns
// (ownerToken, agentID).
func hb3v2SeedAgentWithHeartbeat(t *testing.T, ts *httptest.Server,
	s *store.Store, ageMs int64) (string, string) {
	t.Helper()
	ownerToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	owner, _ := s.GetUserByEmail("owner@test.com")
	agentEmail := "agent-hb3v2@test.com"
	agentRole := "agent"
	agent := &store.User{
		DisplayName: "AgentHB3V2",
		Role:        agentRole,
		Email:       &agentEmail,
		OrgID:       owner.OrgID,
		OwnerID:     &owner.ID,
	}
	if err := s.CreateUser(agent); err != nil {
		t.Fatalf("create agent: %v", err)
	}
	now := time.Now().UnixMilli()
	heartbeat := now - ageMs
	if err := s.DB().Exec(`INSERT INTO agent_runtimes
		(agent_id, endpoint_url, process_kind, status, last_error_reason,
		 last_heartbeat_at, created_at, updated_at)
		VALUES (?, '', 'hermes', 'running', NULL, ?, ?, ?)`,
		agent.ID, heartbeat, now, now).Error; err != nil {
		t.Fatalf("seed agent_runtimes: %v", err)
	}
	return ownerToken, agent.ID
}

// TestHB3V2_DecayList_HappyPath — acceptance §2.2 (fresh).
func TestHB3V2_DecayList_HappyPath(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	ownerToken, agentID := hb3v2SeedAgentWithHeartbeat(t, ts, s, 5_000) // 5s ago → fresh

	resp, body := testutil.JSON(t, "GET",
		ts.URL+"/api/v1/agents/"+agentID+"/heartbeat-decay", ownerToken, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("happy: %d %v", resp.StatusCode, body)
	}
	if body["state"] != "fresh" {
		t.Errorf("state: got %v, want fresh", body["state"])
	}
	if body["agent_id"] != agentID {
		t.Errorf("agent_id: got %v, want %s", body["agent_id"], agentID)
	}
}

// TestHB3V2_DecayList_StaleState — acceptance §2.2 (stale).
func TestHB3V2_DecayList_StaleState(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	ownerToken, agentID := hb3v2SeedAgentWithHeartbeat(t, ts, s, 45_000) // 45s ago → stale

	_, body := testutil.JSON(t, "GET",
		ts.URL+"/api/v1/agents/"+agentID+"/heartbeat-decay", ownerToken, nil)
	if body["state"] != "stale" {
		t.Errorf("state: got %v, want stale", body["state"])
	}
}

// TestHB3V2_DecayList_DeadState — acceptance §2.2 (dead).
func TestHB3V2_DecayList_DeadState(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	ownerToken, agentID := hb3v2SeedAgentWithHeartbeat(t, ts, s, 120_000) // 120s ago → dead

	_, body := testutil.JSON(t, "GET",
		ts.URL+"/api/v1/agents/"+agentID+"/heartbeat-decay", ownerToken, nil)
	if body["state"] != "dead" {
		t.Errorf("state: got %v, want dead", body["state"])
	}
}

// TestHB3V2_DecayList_CrossOwnerReject — acceptance §2.2.
func TestHB3V2_DecayList_CrossOwnerReject(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	_, agentID := hb3v2SeedAgentWithHeartbeat(t, ts, s, 5_000)
	memberToken := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")
	resp, _ := testutil.JSON(t, "GET",
		ts.URL+"/api/v1/agents/"+agentID+"/heartbeat-decay", memberToken, nil)
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("cross-owner: got %d, want 403", resp.StatusCode)
	}
}

// TestHB3V2_DecayList_Unauthorized401 — acceptance §2.2.
func TestHB3V2_DecayList_Unauthorized401(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	resp, _ := testutil.JSON(t, "GET",
		ts.URL+"/api/v1/agents/some-id/heartbeat-decay", "", nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("unauth: got %d, want 401", resp.StatusCode)
	}
}

// TestHB3V2_DecayList_AgentNotFound404 — acceptance §2.2.
func TestHB3V2_DecayList_AgentNotFound404(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	ownerToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	resp, _ := testutil.JSON(t, "GET",
		ts.URL+"/api/v1/agents/nonexistent/heartbeat-decay", ownerToken, nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("not found: got %d, want 404", resp.StatusCode)
	}
}

// TestHB3V2_DecayList_NoRuntimeRowYieldsDead — acceptance §1.3 nil-safe.
// agent without agent_runtimes row → dead state (DeriveDecayState
// last=0 nil-safe behavior).
func TestHB3V2_DecayList_NoRuntimeRowYieldsDead(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	ownerToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	owner, _ := s.GetUserByEmail("owner@test.com")
	agentEmail := "agent-hb3v2-no-rt@test.com"
	agentRole := "agent"
	agent := &store.User{
		DisplayName: "AgentHB3V2NoRT",
		Role:        agentRole,
		Email:       &agentEmail,
		OrgID:       owner.OrgID,
		OwnerID:     &owner.ID,
	}
	if err := s.CreateUser(agent); err != nil {
		t.Fatalf("create agent: %v", err)
	}
	// Note: NO agent_runtimes row inserted.
	_, body := testutil.JSON(t, "GET",
		ts.URL+"/api/v1/agents/"+agent.ID+"/heartbeat-decay", ownerToken, nil)
	if body["state"] != "dead" {
		t.Errorf("no runtime row: got %v, want dead (DeriveDecayState last=0 → dead)", body["state"])
	}
}
