// Package api_test — agent_config_ack_handler_test.go: BPP-3 unit
// tests for the AgentConfigAckHandlerImpl + AgentOwnerResolver bindings.
//
// Acceptance: docs/qa/acceptance-templates/al-2b.md §2.5 (ack outcomes
// 3 status × log path) + §3.2 fail-soft.
//
// Tests (4):
//   1. HandleAck_AppliedLogsInfo
//   2. HandleAck_RejectedLogsWarn
//   3. HandleAck_StaleLogsWarn
//   4. OwnerOf_ReturnsOwnerForExistingAgent + OwnerOf_ErrorOnMissing
package api_test

import (
	"bytes"
	"log/slog"
	"strings"
	"testing"

	"borgee-server/internal/api"
	"borgee-server/internal/bpp"
	"borgee-server/internal/testutil"
)

func bppNewSlog(buf *bytes.Buffer) *slog.Logger {
	return slog.New(slog.NewTextHandler(buf, &slog.HandlerOptions{Level: slog.LevelInfo}))
}

func TestBPP3_HandleAck_Applied(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	h := &api.AgentConfigAckHandlerImpl{Logger: bppNewSlog(&buf)}
	err := h.HandleAck(bpp.AgentConfigAckFrame{
		Type:          bpp.FrameTypeBPPAgentConfigAck,
		AgentID:       "agent-1",
		SchemaVersion: 5,
		Status:        bpp.AgentConfigAckStatusApplied,
		AppliedAt:     1700000000000,
	}, bpp.AckSessionContext{OwnerUserID: "owner-1"})
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	out := buf.String()
	if !strings.Contains(out, "bpp.agent_config_ack_applied") {
		t.Errorf("missing applied log: %q", out)
	}
	if !strings.Contains(out, "schema_version=5") {
		t.Errorf("missing schema_version log: %q", out)
	}
}

func TestBPP3_HandleAck_Rejected(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	h := &api.AgentConfigAckHandlerImpl{Logger: bppNewSlog(&buf)}
	err := h.HandleAck(bpp.AgentConfigAckFrame{
		Type:          bpp.FrameTypeBPPAgentConfigAck,
		AgentID:       "agent-2",
		SchemaVersion: 7,
		Status:        bpp.AgentConfigAckStatusRejected,
		Reason:        "runtime_crashed",
	}, bpp.AckSessionContext{OwnerUserID: "owner-2"})
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	out := buf.String()
	if !strings.Contains(out, "bpp.agent_config_ack_rejected") {
		t.Errorf("missing rejected log: %q", out)
	}
	if !strings.Contains(out, "runtime_crashed") {
		t.Errorf("missing reason log: %q", out)
	}
}

func TestBPP3_HandleAck_Stale(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	h := &api.AgentConfigAckHandlerImpl{Logger: bppNewSlog(&buf)}
	err := h.HandleAck(bpp.AgentConfigAckFrame{
		Type:          bpp.FrameTypeBPPAgentConfigAck,
		AgentID:       "agent-3",
		SchemaVersion: 3,
		Status:        bpp.AgentConfigAckStatusStale,
		Reason:        "unknown",
	}, bpp.AckSessionContext{OwnerUserID: "owner-3"})
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	out := buf.String()
	if !strings.Contains(out, "bpp.agent_config_ack_stale") {
		t.Errorf("missing stale log: %q", out)
	}
}

func TestBPP3_HandleAck_NilLoggerNoOp(t *testing.T) {
	t.Parallel()
	h := &api.AgentConfigAckHandlerImpl{}
	if err := h.HandleAck(bpp.AgentConfigAckFrame{
		Status: bpp.AgentConfigAckStatusApplied,
	}, bpp.AckSessionContext{}); err != nil {
		t.Errorf("nil logger path should be no-op, got err %v", err)
	}
}

func TestBPP3_OwnerResolver_ResolvesOwner(t *testing.T) {
	t.Parallel()
	ts, s, _ := testutil.NewTestServer(t)
	token := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	agent := testutil.CreateAgent(t, ts.URL, token, "BPP3-Owner-Test")
	agentID := agent["id"].(string)

	owner, err := s.GetUserByEmail("owner@test.com")
	if err != nil || owner == nil {
		t.Fatalf("get owner: %v", err)
	}

	r := &api.AgentOwnerResolver{Store: s}
	resolved, err := r.OwnerOf(agentID)
	if err != nil {
		t.Fatalf("OwnerOf: %v", err)
	}
	if resolved != owner.ID {
		t.Errorf("expected owner %s, got %s", owner.ID, resolved)
	}
}

func TestBPP3_OwnerResolver_MissingAgent(t *testing.T) {
	t.Parallel()
	_, s, _ := testutil.NewTestServer(t)
	r := &api.AgentOwnerResolver{Store: s}
	if _, err := r.OwnerOf("nonexistent-agent-id"); err == nil {
		t.Errorf("expected error for missing agent, got nil")
	}
}

// TestBPP3_OwnerResolver_AgentWithNilOwner covers the nil-OwnerID branch
// (legacy data path — agents row exists but OwnerID is NULL; bpp dispatcher
// will treat as cross-owner reject upstream).
func TestBPP3_OwnerResolver_AgentWithNilOwner(t *testing.T) {
	t.Parallel()
	ts, s, _ := testutil.NewTestServer(t)
	token := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	agent := testutil.CreateAgent(t, ts.URL, token, "BPP3-Nil-Owner")
	agentID := agent["id"].(string)

	// Force OwnerID to nil to simulate legacy/orphan agent row.
	if err := s.DB().Exec("UPDATE users SET owner_id = NULL WHERE id = ?", agentID).Error; err != nil {
		t.Fatalf("nil owner_id: %v", err)
	}

	r := &api.AgentOwnerResolver{Store: s}
	if _, err := r.OwnerOf(agentID); err == nil {
		t.Errorf("expected error for agent with nil OwnerID, got nil")
	}
}
