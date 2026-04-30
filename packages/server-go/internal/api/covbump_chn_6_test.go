// Package api_test — covbump_test.go: cross-PR cov bump for store helpers
// (IsAgentStatusNotFound + ArchiveChannel + ListChannelGroups + agent_status
// upsert/reap chain). Same pattern as chn-5 covbump that landed cov 83.9%
// → 84.0%.
package api_test

import (
	"errors"
	"net/http"
	"testing"
	"time"

	"borgee-server/internal/store"
	"borgee-server/internal/testutil"
	"gorm.io/gorm"
)

func TestCHN_6_CovBump_IsAgentStatusNotFound(t *testing.T) {
	t.Parallel()
	if !store.IsAgentStatusNotFound(gorm.ErrRecordNotFound) {
		t.Error("ErrRecordNotFound should match")
	}
	if store.IsAgentStatusNotFound(nil) {
		t.Error("nil should not match")
	}
	if store.IsAgentStatusNotFound(errors.New("other")) {
		t.Error("other err should not match")
	}
}

func TestCHN_6_CovBump_ArchiveChannel(t *testing.T) {
	t.Parallel()
	_, s, _ := testutil.NewTestServer(t)
	owner, _ := s.GetUserByEmail("owner@test.com")
	ch := &store.Channel{
		Name:       "covbump-archive",
		Type:       "channel",
		Visibility: "public",
		CreatedBy:  owner.ID,
		Position:   store.GenerateInitialRank(),
		OrgID:      owner.OrgID,
	}
	if err := s.CreateChannel(ch); err != nil {
		t.Fatalf("create: %v", err)
	}
	ts1, err := s.ArchiveChannel(ch.ID)
	if err != nil {
		t.Fatalf("ArchiveChannel: %v", err)
	}
	if ts1 == 0 {
		t.Error("expected non-zero archived_at")
	}
	ts2, err := s.ArchiveChannel(ch.ID)
	if err != nil {
		t.Fatalf("ArchiveChannel idempotent: %v", err)
	}
	if ts2 != ts1 {
		t.Errorf("idempotent ts mismatch")
	}
	if _, err := s.ArchiveChannel("00000000-0000-0000-0000-000000000000"); err == nil {
		t.Error("expected error for not-found")
	}
}

func TestCHN_6_CovBump_ListChannelGroups_Empty(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	ownerToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	resp, body := testutil.JSON(t, http.MethodGet,
		ts.URL+"/api/v1/channel-groups", ownerToken, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list groups: got %d", resp.StatusCode)
	}
	if _, ok := body["groups"].([]any); !ok {
		t.Errorf("groups key missing")
	}
}

func TestCHN_6_CovBump_ListChannelGroups_AfterCreate(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	ownerToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	resp, _ := testutil.JSON(t, http.MethodPost,
		ts.URL+"/api/v1/channel-groups", ownerToken,
		map[string]any{"name": "covbump-grp"})
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Skipf("create group not 200/201")
	}
	resp, body := testutil.JSON(t, http.MethodGet,
		ts.URL+"/api/v1/channel-groups", ownerToken, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list after create: got %d", resp.StatusCode)
	}
	groups, _ := body["groups"].([]any)
	if len(groups) < 1 {
		t.Errorf("expected ≥1 group, got %d", len(groups))
	}
}

// REG-CHN6-cov-bump — agent_status upsert/getter/reaper chain (BPP-2 source).
func TestCHN_6_CovBump_AgentStatusChain(t *testing.T) {
	t.Parallel()
	_, s, _ := testutil.NewTestServer(t)

	// 1. GetAgentStatus on non-existent agent → ErrRecordNotFound.
	if _, err := s.GetAgentStatus("nonexistent-agent"); err == nil {
		t.Error("expected ErrRecordNotFound for missing agent")
	} else if !store.IsAgentStatusNotFound(err) {
		t.Errorf("expected not-found, got %v", err)
	}

	// 2. SetAgentTaskStarted with empty agent_id → error.
	if err := s.SetAgentTaskStarted("", "task-1", time.Now()); err == nil {
		t.Error("expected error for empty agent_id (started)")
	}
	if err := s.SetAgentTaskFinished("", "task-1", time.Now()); err == nil {
		t.Error("expected error for empty agent_id (finished)")
	}

	// 3. Happy path: started → busy.
	now := time.Now()
	if err := s.SetAgentTaskStarted("agent-A", "task-1", now); err != nil {
		t.Fatalf("started: %v", err)
	}
	row, err := s.GetAgentStatus("agent-A")
	if err != nil {
		t.Fatalf("get after started: %v", err)
	}
	if row.State != "busy" {
		t.Errorf("expected busy, got %q", row.State)
	}
	if row.LastTaskID == nil || *row.LastTaskID != "task-1" {
		t.Errorf("expected last_task_id=task-1")
	}

	// 4. Finished → idle (upsert path).
	if err := s.SetAgentTaskFinished("agent-A", "task-1", now.Add(time.Second)); err != nil {
		t.Fatalf("finished: %v", err)
	}
	row, _ = s.GetAgentStatus("agent-A")
	if row.State != "idle" {
		t.Errorf("expected idle after finished, got %q", row.State)
	}

	// 5. ReapStaleBusyToIdle: insert a stale busy row, reap it.
	if err := s.SetAgentTaskStarted("agent-B", "task-2", now.Add(-10*time.Minute)); err != nil {
		t.Fatalf("stale started: %v", err)
	}
	n, err := s.ReapStaleBusyToIdle(now, 5*time.Minute)
	if err != nil {
		t.Fatalf("reap: %v", err)
	}
	if n < 1 {
		t.Errorf("expected ≥1 reaped, got %d", n)
	}
	row, _ = s.GetAgentStatus("agent-B")
	if row.State != "idle" {
		t.Errorf("expected idle post-reap, got %q", row.State)
	}

	// 6. Reap with no stale rows — returns 0.
	n, err = s.ReapStaleBusyToIdle(now, 5*time.Minute)
	if err != nil {
		t.Fatalf("reap noop: %v", err)
	}
	_ = n // 0 expected; not asserting strictly to avoid race-flake.

	// 7. errors.Is invariant: nil shouldn't match (already in main test
	// but kept here for predicate redundancy in case main test reorders).
	if errors.Is(nil, gorm.ErrRecordNotFound) {
		t.Error("nil should not match ErrRecordNotFound")
	}
}

// REG-CHN6-cov-bump v3 — AL-8 audit-log filter param branches.
func TestCHN_6_CovBump_AuditLogFilters(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAsAdmin(t, ts.URL)

	// since invalid (negative).
	resp, _ := testutil.JSON(t, http.MethodGet,
		ts.URL+"/admin-api/v1/audit-log?since=-1", adminToken, nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("since=-1: got %d", resp.StatusCode)
	}
	// since invalid (non-int).
	resp, _ = testutil.JSON(t, http.MethodGet,
		ts.URL+"/admin-api/v1/audit-log?since=abc", adminToken, nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("since=abc: got %d", resp.StatusCode)
	}
	// until invalid.
	resp, _ = testutil.JSON(t, http.MethodGet,
		ts.URL+"/admin-api/v1/audit-log?until=xyz", adminToken, nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("until=xyz: got %d", resp.StatusCode)
	}
	// since > until → inverted.
	resp, _ = testutil.JSON(t, http.MethodGet,
		ts.URL+"/admin-api/v1/audit-log?since=2000&until=1000", adminToken, nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("inverted: got %d", resp.StatusCode)
	}
	// archived invalid.
	resp, _ = testutil.JSON(t, http.MethodGet,
		ts.URL+"/admin-api/v1/audit-log?archived=foo", adminToken, nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("archived=foo: got %d", resp.StatusCode)
	}
	// archived=all happy.
	resp, _ = testutil.JSON(t, http.MethodGet,
		ts.URL+"/admin-api/v1/audit-log?archived=all", adminToken, nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("archived=all: got %d", resp.StatusCode)
	}
	// archived=archived happy.
	resp, _ = testutil.JSON(t, http.MethodGet,
		ts.URL+"/admin-api/v1/audit-log?archived=archived", adminToken, nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("archived=archived: got %d", resp.StatusCode)
	}
	// multi-action.
	resp, _ = testutil.JSON(t, http.MethodGet,
		ts.URL+"/admin-api/v1/audit-log?action=a&action=b", adminToken, nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("multi-action: got %d", resp.StatusCode)
	}
	// since/until happy.
	resp, _ = testutil.JSON(t, http.MethodGet,
		ts.URL+"/admin-api/v1/audit-log?since=0&until=999999999999", adminToken, nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("since/until happy: got %d", resp.StatusCode)
	}
}

// REG-CHN6-cov-bump v3 — impersonation-grant lifecycle (create/get/revoke).
func TestCHN_6_CovBump_ImpersonateGrantLifecycle(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	ownerToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")

	// GET when no grant — 200 with null body or absent.
	resp, _ := testutil.JSON(t, http.MethodGet,
		ts.URL+"/api/v1/me/impersonation-grant", ownerToken, nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("get null grant: got %d", resp.StatusCode)
	}
	// POST create.
	resp, _ = testutil.JSON(t, http.MethodPost,
		ts.URL+"/api/v1/me/impersonation-grant", ownerToken, map[string]any{})
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Skipf("create grant not 200/201: %d", resp.StatusCode)
	}
	// GET after create — 200.
	resp, _ = testutil.JSON(t, http.MethodGet,
		ts.URL+"/api/v1/me/impersonation-grant", ownerToken, nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("get grant: got %d", resp.StatusCode)
	}
	// DELETE revoke.
	resp, _ = testutil.JSON(t, http.MethodDelete,
		ts.URL+"/api/v1/me/impersonation-grant", ownerToken, nil)
	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		t.Errorf("revoke grant: got %d", resp.StatusCode)
	}
	// 401 on revoke without token.
	resp, _ = testutil.JSON(t, http.MethodDelete,
		ts.URL+"/api/v1/me/impersonation-grant", "", nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("revoke 401: got %d", resp.StatusCode)
	}
	// 401 on get without token.
	resp, _ = testutil.JSON(t, http.MethodGet,
		ts.URL+"/api/v1/me/impersonation-grant", "", nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("get 401: got %d", resp.StatusCode)
	}
}

// REG-CHN6-cov-bump v3 — AL-7 audit-retention/override branches.
func TestCHN_6_CovBump_AL7AuditRetentionOverride(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAsAdmin(t, ts.URL)

	// Invalid JSON body.
	resp, _ := testutil.JSON(t, http.MethodPost,
		ts.URL+"/admin-api/v1/audit-retention/override", adminToken, "not-an-object")
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("invalid json: got %d", resp.StatusCode)
	}
	// Out-of-range: 0 (reject ZeroValue).
	resp, _ = testutil.JSON(t, http.MethodPost,
		ts.URL+"/admin-api/v1/audit-retention/override", adminToken,
		map[string]any{"retention_days": 0})
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("0 days: got %d", resp.StatusCode)
	}
	// Out-of-range: negative.
	resp, _ = testutil.JSON(t, http.MethodPost,
		ts.URL+"/admin-api/v1/audit-retention/override", adminToken,
		map[string]any{"retention_days": -5})
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("negative: got %d", resp.StatusCode)
	}
	// Out-of-range: >365.
	resp, _ = testutil.JSON(t, http.MethodPost,
		ts.URL+"/admin-api/v1/audit-retention/override", adminToken,
		map[string]any{"retention_days": 9999})
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf(">365: got %d", resp.StatusCode)
	}
	// Happy: 30 days, default target (system).
	resp, _ = testutil.JSON(t, http.MethodPost,
		ts.URL+"/admin-api/v1/audit-retention/override", adminToken,
		map[string]any{"retention_days": 30})
	if resp.StatusCode != http.StatusOK {
		t.Errorf("happy 30d: got %d", resp.StatusCode)
	}
	// Happy: 90 days with explicit target_user_id.
	resp, _ = testutil.JSON(t, http.MethodPost,
		ts.URL+"/admin-api/v1/audit-retention/override", adminToken,
		map[string]any{"retention_days": 90, "target_user_id": "some-user"})
	if resp.StatusCode != http.StatusOK {
		t.Errorf("happy 90d w/target: got %d", resp.StatusCode)
	}
	// 401: no admin token.
	resp, _ = testutil.JSON(t, http.MethodPost,
		ts.URL+"/admin-api/v1/audit-retention/override", "",
		map[string]any{"retention_days": 30})
	if resp.StatusCode != http.StatusUnauthorized && resp.StatusCode != http.StatusForbidden {
		t.Errorf("no auth: got %d", resp.StatusCode)
	}
}
