// Package api_test — covbump v2: agent_status state-machine cov.
package api_test

import (
	"errors"
	"testing"
	"time"

	"borgee-server/internal/store"
	"borgee-server/internal/testutil"
	"gorm.io/gorm"
)

// REG-CHN5-cov-bump v2 — agent_status upsert/getter/reaper chain (BPP-2 source).
func TestCHN5_CovBump_AgentStatusChain(t *testing.T) {
	t.Parallel()
	_, s, _ := testutil.NewTestServer(t)

	if _, err := s.GetAgentStatus("nonexistent-agent"); err == nil {
		t.Error("expected ErrRecordNotFound for missing agent")
	} else if !store.IsAgentStatusNotFound(err) {
		t.Errorf("expected not-found, got %v", err)
	}
	if err := s.SetAgentTaskStarted("", "task-1", time.Now()); err == nil {
		t.Error("expected error for empty agent_id (started)")
	}
	if err := s.SetAgentTaskFinished("", "task-1", time.Now()); err == nil {
		t.Error("expected error for empty agent_id (finished)")
	}

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
	if err := s.SetAgentTaskFinished("agent-A", "task-1", now.Add(time.Second)); err != nil {
		t.Fatalf("finished: %v", err)
	}
	row, _ = s.GetAgentStatus("agent-A")
	if row.State != "idle" {
		t.Errorf("expected idle after finished, got %q", row.State)
	}

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

	if _, err := s.ReapStaleBusyToIdle(now, 5*time.Minute); err != nil {
		t.Fatalf("reap noop: %v", err)
	}
	if errors.Is(nil, gorm.ErrRecordNotFound) {
		t.Error("nil should not match ErrRecordNotFound")
	}
}
