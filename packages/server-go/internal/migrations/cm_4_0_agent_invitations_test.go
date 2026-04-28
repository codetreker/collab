package migrations

import (
	"testing"
)

func TestCM40_CreatesAgentInvitationsTable(t *testing.T) {
	db := openMem(t)

	e := New(db)
	e.Register(cm40AgentInvitations)
	if err := e.Run(0); err != nil {
		t.Fatalf("run: %v", err)
	}

	cols := pragmaColumns(t, db, "agent_invitations")
	want := []struct {
		name    string
		notNull bool
	}{
		// id is PRIMARY KEY — SQLite PRAGMA reports notnull=0 for PK columns,
		// the PK constraint itself enforces non-null. Verified separately via
		// .pk below.
		{"id", false},
		{"channel_id", true},
		{"agent_id", true},
		{"requested_by", true},
		{"state", true},
		{"created_at", true},
		{"decided_at", false},
		{"expires_at", false},
	}
	for _, w := range want {
		c, ok := cols[w.name]
		if !ok {
			t.Fatalf("agent_invitations missing column %q (have %v)", w.name, keys(cols))
		}
		if c.notNull != w.notNull {
			t.Fatalf("agent_invitations.%s notNull=%v want %v", w.name, c.notNull, w.notNull)
		}
	}
	if !cols["id"].pk {
		t.Fatal("agent_invitations.id should be PRIMARY KEY")
	}
}

func TestCM40_CreatesIndexes(t *testing.T) {
	db := openMem(t)

	e := New(db)
	e.Register(cm40AgentInvitations)
	if err := e.Run(0); err != nil {
		t.Fatalf("run: %v", err)
	}

	wantIdx := []string{
		"idx_agent_invitations_agent_state",
		"idx_agent_invitations_channel_state",
		"idx_agent_invitations_requested_by",
	}
	for _, name := range wantIdx {
		var n int64
		row := db.Raw(
			"SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name=?",
			name,
		).Row()
		if err := row.Scan(&n); err != nil {
			t.Fatalf("scan %s: %v", name, err)
		}
		if n != 1 {
			t.Fatalf("expected index %s to exist (got count=%d)", name, n)
		}
	}
}

func TestCM40_CheckConstraintRejectsBadState(t *testing.T) {
	db := openMem(t)

	e := New(db)
	e.Register(cm40AgentInvitations)
	if err := e.Run(0); err != nil {
		t.Fatalf("run: %v", err)
	}

	// Allowed states: pending / approved / rejected / expired. Insert each.
	for _, s := range []string{"pending", "approved", "rejected", "expired"} {
		err := db.Exec(
			"INSERT INTO agent_invitations (id, channel_id, agent_id, requested_by, state, created_at) VALUES (?, ?, ?, ?, ?, ?)",
			"id-"+s, "ch-1", "ag-1", "u-1", s, int64(1),
		).Error
		if err != nil {
			t.Fatalf("insert state=%s: %v", s, err)
		}
	}

	// Disallowed state: CHECK constraint must reject.
	err := db.Exec(
		"INSERT INTO agent_invitations (id, channel_id, agent_id, requested_by, state, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		"id-bogus", "ch-1", "ag-1", "u-1", "completed", int64(1),
	).Error
	if err == nil {
		t.Fatal("expected CHECK constraint to reject state='completed'")
	}
}

func TestCM40_DefaultsStateToPending(t *testing.T) {
	db := openMem(t)

	e := New(db)
	e.Register(cm40AgentInvitations)
	if err := e.Run(0); err != nil {
		t.Fatalf("run: %v", err)
	}

	if err := db.Exec(
		"INSERT INTO agent_invitations (id, channel_id, agent_id, requested_by, created_at) VALUES (?, ?, ?, ?, ?)",
		"i-1", "ch-1", "ag-1", "u-1", int64(1),
	).Error; err != nil {
		t.Fatalf("insert: %v", err)
	}

	var got string
	if err := db.Raw("SELECT state FROM agent_invitations WHERE id='i-1'").Row().Scan(&got); err != nil {
		t.Fatalf("scan: %v", err)
	}
	if got != "pending" {
		t.Fatalf("default state = %q, want %q", got, "pending")
	}
}

func TestCM40_IsIdempotentOnRerun(t *testing.T) {
	db := openMem(t)

	for i := 0; i < 2; i++ {
		e := New(db)
		e.Register(cm40AgentInvitations)
		if err := e.Run(0); err != nil {
			t.Fatalf("run #%d: %v", i+1, err)
		}
	}

	var n int64
	if err := db.Raw("SELECT COUNT(*) FROM schema_migrations WHERE version=3").Row().Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 1 {
		t.Fatalf("expected exactly one schema_migrations row for v3, got %d", n)
	}
}
