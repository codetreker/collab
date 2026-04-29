package migrations

import (
	"os"
	"strings"
	"testing"

	"gorm.io/gorm"
)

// runHB51 chains al_1_4_agent_state_log → hb_5_1 archived_at extension.
// agent_state_log is created in v=25 (AL-1.4); HB-5.1 only adds a
// nullable column + sparse idx so chain is short.
func runHB51(t *testing.T, db *gorm.DB) {
	t.Helper()
	e := New(db)
	e.Register(al14AgentStateLog)
	e.Register(hb51AgentStateLogArchivedAt)
	if err := e.Run(0); err != nil {
		t.Fatalf("run hb_5_1 chain: %v", err)
	}
}

// TestHB51_AddsArchivedAtColumn — acceptance §1.1.
//
// agent_state_log.archived_at must exist as nullable INTEGER (NULL =
// active row, sweeper UPDATE archived_at=now to archive).
func TestHB51_AddsArchivedAtColumn(t *testing.T) {
	db := openMem(t)
	runHB51(t, db)
	cols := pragmaColumns(t, db, "agent_state_log")
	c, ok := cols["archived_at"]
	if !ok {
		t.Fatalf("agent_state_log missing archived_at column (have %v)", keys(cols))
	}
	if c.notNull {
		t.Errorf("agent_state_log.archived_at must be nullable (NULL = active 行)")
	}
}

// TestHB51_HasSparseIdx — acceptance §1.1.
//
// idx_agent_state_log_archived_at must be created with WHERE archived_at IS
// NOT NULL (sparse index 跟 al_7_1 / ap_2_1 同模式).
func TestHB51_HasSparseIdx(t *testing.T) {
	db := openMem(t)
	runHB51(t, db)
	var sql string
	if err := db.Raw(`SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_agent_state_log_archived_at'`).Scan(&sql).Error; err != nil {
		t.Fatalf("query idx: %v", err)
	}
	if sql == "" {
		t.Fatal("idx_agent_state_log_archived_at not created")
	}
	// Sparse WHERE byte-identical with AL-7.1 same-mode partial index.
	if !contains(sql, "WHERE archived_at IS NOT NULL") {
		t.Errorf("expected sparse WHERE clause; got %q", sql)
	}
}

// TestHB51_VersionIs35 — registry literal lock.
func TestHB51_VersionIs35(t *testing.T) {
	if got, want := hb51AgentStateLogArchivedAt.Version, 35; got != want {
		t.Errorf("HB-5.1 Version drift: got %d, want %d (post AL-7.1 v=33)", got, want)
	}
	if got, want := hb51AgentStateLogArchivedAt.Name, "hb_5_1_agent_state_log_archived_at"; got != want {
		t.Errorf("HB-5.1 Name drift: got %q, want %q", got, want)
	}
	found := false
	for _, m := range All {
		if m.Version == 35 {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("HB-5.1 (v=35) not registered in migrations.All")
	}
}

// TestHB51_Idempotent — re-running chain against an already-applied DB
// is a no-op (schema_migrations gate).
func TestHB51_Idempotent(t *testing.T) {
	db := openMem(t)
	runHB51(t, db)
	runHB51(t, db) // second run no-op
	cols := pragmaColumns(t, db, "agent_state_log")
	if _, ok := cols["archived_at"]; !ok {
		t.Error("archived_at column missing after idempotent re-run")
	}
}

// TestHB51_NoAdminActionsEnumDrift — acceptance §1.2 + 立场 ② 反断.
//
// HB-5.1 must NOT extend admin_actions CHECK enum (12 项 byte-identical
// 跟 AL-7.1 不动). Only AL-7.1 'audit_retention_override' is added by
// AL-7 chain — HB-5 reuses that action with metadata.target='heartbeat'.
func TestHB51_NoAdminActionsEnumDrift(t *testing.T) {
	body, err := os.ReadFile("hb_5_1_agent_state_log_archived_at.go")
	if err != nil {
		t.Fatalf("read hb_5_1: %v", err)
	}
	if strings.Contains(string(body), "'heartbeat_retention_override'") ||
		strings.Contains(string(body), `"heartbeat_retention_override"`) {
		t.Error("HB-5 立场 ② broken — must reuse AL-7 'audit_retention_override' action, not extend CHECK enum")
	}
}
