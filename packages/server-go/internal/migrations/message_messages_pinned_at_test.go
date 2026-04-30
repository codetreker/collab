package migrations

import (
	"testing"
)

// TestDM_AddsPinnedAtColumn — acceptance §1.1.
// messages.pinned_at must exist as nullable INTEGER (NULL = unpinned).
func TestDM_AddsPinnedAtColumn(t *testing.T) {
	db := openMem(t)
	if err := db.Exec(`CREATE TABLE IF NOT EXISTS messages (
  id           TEXT PRIMARY KEY,
  channel_id   TEXT NOT NULL,
  sender_id    TEXT NOT NULL,
  content      TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text',
  reply_to_id  TEXT,
  created_at   INTEGER NOT NULL,
  edited_at    INTEGER,
  deleted_at   INTEGER,
  org_id       TEXT NOT NULL DEFAULT ''
)`).Error; err != nil {
		t.Fatalf("seed messages: %v", err)
	}
	e := New(db)
	e.Register(dm101MessagesPinnedAt)
	if err := e.Run(0); err != nil {
		t.Fatalf("run dm_10_1: %v", err)
	}
	cols := pragmaColumns(t, db, "messages")
	c, ok := cols["pinned_at"]
	if !ok {
		t.Fatalf("messages missing pinned_at column (have %v)", keys(cols))
	}
	if c.notNull {
		t.Errorf("messages.pinned_at must be nullable (NULL = unpinned)")
	}
}

// TestDM_HasSparseIdx — acceptance §1.2.
// idx_messages_pinned_at must be created with WHERE pinned_at IS NOT NULL
// (sparse index 跟 ap_2_1 / al_7_1 / hb_5_1 同模式).
func TestDM_HasSparseIdx(t *testing.T) {
	db := openMem(t)
	if err := db.Exec(`CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, sender_id TEXT,
  content TEXT, content_type TEXT, created_at INTEGER NOT NULL
)`).Error; err != nil {
		t.Fatalf("seed: %v", err)
	}
	e := New(db)
	e.Register(dm101MessagesPinnedAt)
	if err := e.Run(0); err != nil {
		t.Fatalf("run: %v", err)
	}
	var sql string
	if err := db.Raw(
		`SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_messages_pinned_at'`,
	).Scan(&sql).Error; err != nil {
		t.Fatalf("idx query: %v", err)
	}
	if sql == "" {
		t.Fatal("idx_messages_pinned_at not created")
	}
	// Sparse partial index — must contain WHERE pinned_at IS NOT NULL clause.
	if !containsAll(sql, "pinned_at IS NOT NULL", "channel_id", "pinned_at") {
		t.Errorf("idx not sparse / missing channel_id+pinned_at: %q", sql)
	}
}

// TestDM_VersionIs45 — acceptance §1.3.
// migration must be registered at v=45 (team-lead 占号 reservation).
func TestDM_VersionIs45(t *testing.T) {
	if dm101MessagesPinnedAt.Version != 45 {
		t.Errorf("DM-10.1 version expected 45, got %d", dm101MessagesPinnedAt.Version)
	}
}

// TestDM101_Idempotent — acceptance §1.4.
// Re-running migration must be a no-op (forward-only stance shared with
// AL-7.1 + DM-7.1 + AP-2.1 + HB-5.1 + AP-1.1 + AP-3.1 跨七 milestone).
func TestDM101_Idempotent(t *testing.T) {
	db := openMem(t)
	if err := db.Exec(`CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, sender_id TEXT,
  content TEXT, content_type TEXT, created_at INTEGER NOT NULL
)`).Error; err != nil {
		t.Fatalf("seed: %v", err)
	}
	e := New(db)
	e.Register(dm101MessagesPinnedAt)
	if err := e.Run(0); err != nil {
		t.Fatalf("first: %v", err)
	}
	// Re-run — must skip cleanly.
	e2 := New(db)
	e2.Register(dm101MessagesPinnedAt)
	if err := e2.Run(0); err != nil {
		t.Fatalf("re-run: %v", err)
	}
	cols := pragmaColumns(t, db, "messages")
	if _, ok := cols["pinned_at"]; !ok {
		t.Errorf("idempotent re-run lost pinned_at column")
	}
}

// containsAll reports whether s contains every needle.
func containsAll(s string, needles ...string) bool {
	for _, n := range needles {
		found := false
		for i := 0; i+len(n) <= len(s); i++ {
			if s[i:i+len(n)] == n {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}
