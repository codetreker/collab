package migrations

import (
	"testing"

	"gorm.io/gorm"
)

// runDM71 chains migrations needed for messages table + DM-7.1 ALTER.
func runDM71(t *testing.T, db *gorm.DB) {
	t.Helper()
	e := New(db)
	// messages 表由初始 migration 1 + downstream 多 migration 创建; 我们
	// 只关心 DM-7.1 ADD COLUMN. 直接 seed messages table.
	if err := db.Exec(`CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text',
  reply_to_id TEXT,
  created_at INTEGER NOT NULL,
  edited_at INTEGER,
  deleted_at INTEGER
)`).Error; err != nil {
		t.Fatal(err)
	}
	e.Register(messagesEditHistory)
	if err := e.Run(0); err != nil {
		t.Fatalf("run dm_7_1 chain: %v", err)
	}
}

// TestDM_AddsEditHistoryColumn — acceptance §1.1.
func TestDM_AddsEditHistoryColumn(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	runDM71(t, db)
	cols := pragmaColumns(t, db, "messages")
	c, ok := cols["edit_history"]
	if !ok {
		t.Fatalf("messages missing edit_history column (have %v)", keys(cols))
	}
	if c.notNull {
		t.Errorf("messages.edit_history must be nullable (NULL = no edits)")
	}
}

// TestDM_VersionIs34 — registry literal lock.
func TestDM_VersionIs34(t *testing.T) {
	t.Parallel()
	if got, want := messagesEditHistory.Version, 34; got != want {
		t.Errorf("DM-7.1 Version drift: got %d, want %d", got, want)
	}
	if got, want := messagesEditHistory.Name, "dm_7_1_messages_edit_history"; got != want {
		t.Errorf("DM-7.1 Name drift: got %q, want %q", got, want)
	}
	found := false
	for _, m := range All {
		if m.Version == 34 {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("DM-7.1 (v=34) not registered in migrations.All")
	}
}

// TestDM71_Idempotent — re-run is no-op.
func TestDM71_Idempotent(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	runDM71(t, db)
	runDM71(t, db) // second run no-op
	cols := pragmaColumns(t, db, "messages")
	if _, ok := cols["edit_history"]; !ok {
		t.Error("edit_history column missing after idempotent re-run")
	}
}
