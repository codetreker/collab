package migrations

import (
	"testing"

	"gorm.io/gorm"
)

// runCHN141 chains migrations needed for channels table + CHN-14.1 ALTER.
func runCHN141(t *testing.T, db *gorm.DB) {
	t.Helper()
	e := New(db)
	// channels 表由初始 migration 1 + downstream 多 migration 创建; 我们
	// 只关心 CHN-14.1 ADD COLUMN. 直接 seed channels table.
	if err := db.Exec(`CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'channel',
  visibility TEXT NOT NULL DEFAULT 'public',
  topic TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  archived_at INTEGER,
  deleted_at INTEGER
)`).Error; err != nil {
		t.Fatal(err)
	}
	e.Register(chn141ChannelsDescriptionEditHistory)
	if err := e.Run(0); err != nil {
		t.Fatalf("run chn_14_1 chain: %v", err)
	}
}

// TestCHN141_AddsDescriptionEditHistoryColumn — acceptance §1.1.
func TestCHN141_AddsDescriptionEditHistoryColumn(t *testing.T) {
	db := openMem(t)
	runCHN141(t, db)
	cols := pragmaColumns(t, db, "channels")
	c, ok := cols["description_edit_history"]
	if !ok {
		t.Fatalf("channels missing description_edit_history column (have %v)", keys(cols))
	}
	if c.notNull {
		t.Errorf("channels.description_edit_history must be nullable (NULL = no edits)")
	}
}

// TestCHN141_VersionIs44 — registry literal lock.
func TestCHN141_VersionIs44(t *testing.T) {
	if got, want := chn141ChannelsDescriptionEditHistory.Version, 44; got != want {
		t.Errorf("CHN-14.1 Version drift: got %d, want %d", got, want)
	}
	if got, want := chn141ChannelsDescriptionEditHistory.Name, "chn_14_1_channels_description_edit_history"; got != want {
		t.Errorf("CHN-14.1 Name drift: got %q, want %q", got, want)
	}
	found := false
	for _, m := range All {
		if m.Version == 44 {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("CHN-14.1 (v=44) not registered in migrations.All")
	}
}

// TestCHN141_Idempotent — re-run is no-op.
func TestCHN141_Idempotent(t *testing.T) {
	db := openMem(t)
	runCHN141(t, db)
	runCHN141(t, db) // second run no-op
	cols := pragmaColumns(t, db, "channels")
	if _, ok := cols["description_edit_history"]; !ok {
		t.Error("description_edit_history column missing after idempotent re-run")
	}
}
