package migrations

import (
	"strings"
	"testing"

	"gorm.io/gorm"
)

// runCV61 chains v=13 (CV-1.1 artifacts) → v=36 (CV-6.1 FTS5).
func runCV61(t *testing.T, db *gorm.DB) {
	t.Helper()
	e := New(db)
	e.Register(cv11Artifacts)
	e.Register(cv61ArtifactsFTS)
	if err := e.Run(0); err != nil {
		t.Fatalf("run cv_6_1: %v", err)
	}
}

// REG-CV6-001 (acceptance §1.1) — FTS5 virtual table created.
func TestCV61_CreatesFTS5VirtualTable(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	runCV61(t, db)

	var sql string
	err := db.Raw(`SELECT sql FROM sqlite_master WHERE name='artifacts_fts'`).Scan(&sql).Error
	if err != nil || sql == "" {
		t.Fatalf("artifacts_fts virtual table missing (err=%v)", err)
	}
	if !strings.Contains(strings.ToLower(sql), "fts5") {
		t.Errorf("artifacts_fts must use fts5 module; got: %s", sql)
	}
	if !strings.Contains(sql, "title") || !strings.Contains(sql, "body") {
		t.Errorf("artifacts_fts must index title + body; got: %s", sql)
	}
}

// REG-CV6-001b — three triggers byte-identical names.
func TestCV61_HasTriggers(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	runCV61(t, db)

	for _, name := range []string{"artifacts_ai", "artifacts_au", "artifacts_ad"} {
		var n int64
		if err := db.Raw(`SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name=?`, name).Scan(&n).Error; err != nil {
			t.Fatalf("scan trigger %s: %v", name, err)
		}
		if n != 1 {
			t.Errorf("trigger %s missing", name)
		}
	}
}

// REG-CV6-001c — INSERT trigger sync. Insert an artifact, FTS should
// match.
func TestCV61_TriggerSyncOnInsert(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	runCV61(t, db)

	if err := db.Exec(`INSERT INTO artifacts
		(id, channel_id, type, title, body, current_version, created_at)
		VALUES ('art-1', 'ch-A', 'markdown', 'Roadmap Q3', '# Hello world plan', 1, 1700000000000)`).Error; err != nil {
		t.Fatalf("insert artifact: %v", err)
	}
	var n int64
	if err := db.Raw(`SELECT COUNT(*) FROM artifacts_fts WHERE artifacts_fts MATCH ?`, "hello").Scan(&n).Error; err != nil {
		t.Fatalf("MATCH query: %v", err)
	}
	if n != 1 {
		t.Errorf("FTS5 should find 'hello' after insert; got count=%d", n)
	}
}

// REG-CV6-001d — UPDATE trigger sync.
func TestCV61_TriggerSyncOnUpdate(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	runCV61(t, db)

	if err := db.Exec(`INSERT INTO artifacts
		(id, channel_id, type, title, body, current_version, created_at)
		VALUES ('art-2', 'ch-A', 'markdown', 'Old', 'first content', 1, 1700000000000)`).Error; err != nil {
		t.Fatalf("insert: %v", err)
	}
	if err := db.Exec(`UPDATE artifacts SET body = ? WHERE id = ?`, "totally different uniquezebra rare", "art-2").Error; err != nil {
		t.Fatalf("update: %v", err)
	}
	var n int64
	if err := db.Raw(`SELECT COUNT(*) FROM artifacts_fts WHERE artifacts_fts MATCH ?`, "uniquezebra").Scan(&n).Error; err != nil {
		t.Fatalf("MATCH new: %v", err)
	}
	if n != 1 {
		t.Errorf("FTS5 should match new body 'uniquezebra' after UPDATE; got %d", n)
	}
	// Old content gone from index.
	if err := db.Raw(`SELECT COUNT(*) FROM artifacts_fts WHERE artifacts_fts MATCH ?`, "first").Scan(&n).Error; err != nil {
		t.Fatalf("MATCH old: %v", err)
	}
	if n != 0 {
		t.Errorf("FTS5 should not match old body 'first' after UPDATE; got %d", n)
	}
}

// REG-CV6-001e — DELETE trigger sync.
func TestCV61_TriggerSyncOnDelete(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	runCV61(t, db)

	if err := db.Exec(`INSERT INTO artifacts
		(id, channel_id, type, title, body, current_version, created_at)
		VALUES ('art-3', 'ch-A', 'markdown', 'Doomed', 'soondeleted marker', 1, 1700000000000)`).Error; err != nil {
		t.Fatalf("insert: %v", err)
	}
	if err := db.Exec(`DELETE FROM artifacts WHERE id = 'art-3'`).Error; err != nil {
		t.Fatalf("delete: %v", err)
	}
	var n int64
	if err := db.Raw(`SELECT COUNT(*) FROM artifacts_fts WHERE artifacts_fts MATCH ?`, "soondeleted").Scan(&n).Error; err != nil {
		t.Fatalf("MATCH: %v", err)
	}
	if n != 0 {
		t.Errorf("FTS5 should not match deleted artifact; got %d", n)
	}
}

// REG-CV6-001f — initial backfill picks up legacy rows on migration run.
// Insert before running v=36, then run, then search.
func TestCV61_BackfillExistingRows(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	// Run only CV-1.1 first.
	e1 := New(db)
	e1.Register(cv11Artifacts)
	if err := e1.Run(0); err != nil {
		t.Fatalf("run cv_1_1: %v", err)
	}
	// Seed legacy artifact.
	if err := db.Exec(`INSERT INTO artifacts
		(id, channel_id, type, title, body, current_version, created_at)
		VALUES ('art-legacy', 'ch-A', 'markdown', 'Legacy doc', 'legacybackfill token here', 1, 1700000000000)`).Error; err != nil {
		t.Fatalf("seed legacy: %v", err)
	}
	// Now run v=36 — should backfill.
	e2 := New(db)
	e2.Register(cv61ArtifactsFTS)
	if err := e2.Run(0); err != nil {
		t.Fatalf("run cv_6_1: %v", err)
	}
	var n int64
	if err := db.Raw(`SELECT COUNT(*) FROM artifacts_fts WHERE artifacts_fts MATCH ?`, "legacybackfill").Scan(&n).Error; err != nil {
		t.Fatalf("MATCH: %v", err)
	}
	if n != 1 {
		t.Errorf("FTS5 should find legacy backfilled row; got %d", n)
	}
}

// REG-CV6-001g — registry.go 字面锁 v=36.
func TestCV61_RegistryHasV36(t *testing.T) {
	t.Parallel()
	for _, m := range All {
		if m.Version == 36 {
			if m.Name != "cv_6_1_artifacts_fts" {
				t.Errorf("v=36 name drift: got %q, want %q", m.Name, "cv_6_1_artifacts_fts")
			}
			return
		}
	}
	t.Fatal("v=36 (CV-6.1) not registered in migrations.All")
}

// REG-CV6-001h — idempotent (CREATE *_IF_NOT_EXISTS + schema_migrations gate).
func TestCV61_Idempotent(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	runCV61(t, db)

	e := New(db)
	e.Register(cv11Artifacts)
	e.Register(cv61ArtifactsFTS)
	if err := e.Run(0); err != nil {
		t.Fatalf("re-run cv_6_1: %v", err)
	}
}
