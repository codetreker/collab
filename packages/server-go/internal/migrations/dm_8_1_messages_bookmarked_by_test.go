package migrations

import (
	"testing"

	"gorm.io/gorm"
)

// runDM81 chains migrations needed for messages table + DM-8.1 ALTER.
func runDM81(t *testing.T, db *gorm.DB) {
	t.Helper()
	e := New(db)
	// Seed messages table directly (DM-8.1 only adds the bookmarked_by column).
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
	e.Register(dm81MessagesBookmarkedBy)
	if err := e.Run(0); err != nil {
		t.Fatalf("run dm_8_1 chain: %v", err)
	}
}

// TestDM81_AddsBookmarkedByColumn — acceptance §1.1.
func TestDM81_AddsBookmarkedByColumn(t *testing.T) {
	db := openMem(t)
	runDM81(t, db)
	cols := pragmaColumns(t, db, "messages")
	c, ok := cols["bookmarked_by"]
	if !ok {
		t.Fatalf("messages missing bookmarked_by column (have %v)", keys(cols))
	}
	if c.notNull {
		t.Errorf("messages.bookmarked_by must be nullable (NULL = no bookmarks)")
	}
}

// TestDM81_RegistryHasV36 — registry literal lock.
func TestDM81_RegistryHasV36(t *testing.T) {
	if got, want := dm81MessagesBookmarkedBy.Version, 36; got != want {
		t.Errorf("DM-8.1 Version drift: got %d, want %d", got, want)
	}
	if got, want := dm81MessagesBookmarkedBy.Name, "dm_8_1_messages_bookmarked_by"; got != want {
		t.Errorf("DM-8.1 Name drift: got %q, want %q", got, want)
	}
	found := false
	for _, m := range All {
		if m.Version == 36 {
			if m.Name != "dm_8_1_messages_bookmarked_by" {
				t.Errorf("v=36 name drift: got %q, want %q", m.Name, "dm_8_1_messages_bookmarked_by")
			}
			found = true
			break
		}
	}
	if !found {
		t.Fatal("DM-8.1 (v=36) not registered in migrations.All")
	}
}

// TestDM81_Idempotent — re-run is no-op.
func TestDM81_Idempotent(t *testing.T) {
	db := openMem(t)
	runDM81(t, db)
	runDM81(t, db) // second run no-op
	cols := pragmaColumns(t, db, "messages")
	if _, ok := cols["bookmarked_by"]; !ok {
		t.Error("bookmarked_by column missing after idempotent re-run")
	}
}
