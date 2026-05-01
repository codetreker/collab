package migrations

import (
	"testing"

	"gorm.io/gorm"
)

// runCapabilitiesDotNotationBackfill applies migration v=48 on a memory DB.
// Tests the per-token UPDATE map (snake_case → dot-notation 14 行 verb_noun
// 顺序对调) + idempotent guard (hasColumns probe + re-run no-op).
func runCapabilitiesDotNotationBackfill(t *testing.T, db *gorm.DB) {
	t.Helper()
	e := New(db)
	e.Register(capabilitiesDotNotationBackfill)
	if err := e.Run(0); err != nil {
		t.Fatalf("run capabilities_dot_notation_backfill: %v", err)
	}
}

// seedUserPermissionsTable creates the minimal user_permissions schema
// matching legacy store shape.
func seedUserPermissionsTable(t *testing.T, db *gorm.DB) {
	t.Helper()
	if err := db.Exec(`CREATE TABLE IF NOT EXISTS user_permissions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  capability  TEXT NOT NULL,
  scope       TEXT NOT NULL DEFAULT '*',
  granted_by  TEXT,
  granted_at  INTEGER NOT NULL,
  UNIQUE(user_id, capability, scope)
)`).Error; err != nil {
		t.Fatalf("seed user_permissions: %v", err)
	}
}

// TestCapDotBackfill_RewritesAll14Tokens — pin the 14-row mapping.
func TestCapDotBackfill_RewritesAll14Tokens(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	seedUserPermissionsTable(t, db)
	// Seed 14 rows with snake_case literals (one per token, idempotent
	// scope distinct).
	mapping := map[string]string{
		"read_channel":     "channel.read",
		"write_channel":    "channel.write",
		"delete_channel":   "channel.delete",
		"read_artifact":    "artifact.read",
		"write_artifact":   "artifact.write",
		"commit_artifact":  "artifact.commit",
		"iterate_artifact": "artifact.iterate",
		"rollback_artifact": "artifact.rollback",
		"mention_user":     "user.mention",
		"read_dm":          "dm.read",
		"send_dm":          "dm.send",
		"manage_members":   "channel.manage_members",
		"invite_user":      "channel.invite",
		"change_role":      "channel.change_role",
	}
	i := 1
	for old := range mapping {
		if err := db.Exec(
			`INSERT INTO user_permissions (user_id, capability, scope, granted_at) VALUES (?, ?, ?, ?)`,
			"u-1", old, "scope-"+old, int64(i),
		).Error; err != nil {
			t.Fatalf("seed row %q: %v", old, err)
		}
		i++
	}

	runCapabilitiesDotNotationBackfill(t, db)

	// Verify every row was rewritten.
	for old, want := range mapping {
		var got string
		if err := db.Raw(
			`SELECT capability FROM user_permissions WHERE scope = ?`,
			"scope-"+old,
		).Scan(&got).Error; err != nil {
			t.Fatalf("query %q: %v", old, err)
		}
		if got != want {
			t.Errorf("row scope-%q: capability = %q, want %q", old, got, want)
		}
	}
	// Reverse-grep: no row should still hold a snake_case legacy literal.
	for old := range mapping {
		var n int64
		if err := db.Raw(
			`SELECT COUNT(*) FROM user_permissions WHERE capability = ?`, old,
		).Scan(&n).Error; err != nil {
			t.Fatalf("count legacy %q: %v", old, err)
		}
		if n != 0 {
			t.Errorf("legacy literal %q still present (n=%d)", old, n)
		}
	}
}

// TestCapDotBackfill_Idempotent — re-running the migration is a no-op.
// Apply once, snapshot rows, apply via raw Up call again, verify equality.
func TestCapDotBackfill_Idempotent(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	seedUserPermissionsTable(t, db)
	if err := db.Exec(
		`INSERT INTO user_permissions (user_id, capability, scope, granted_at) VALUES (?, ?, ?, ?)`,
		"u-1", "read_channel", "*", int64(1),
	).Error; err != nil {
		t.Fatalf("seed: %v", err)
	}
	runCapabilitiesDotNotationBackfill(t, db)

	var firstPass string
	if err := db.Raw(`SELECT capability FROM user_permissions WHERE user_id = 'u-1'`).
		Scan(&firstPass).Error; err != nil {
		t.Fatalf("first pass query: %v", err)
	}
	if firstPass != "channel.read" {
		t.Fatalf("first pass: got %q, want %q", firstPass, "channel.read")
	}

	// Re-run the Up function directly — must not change the row.
	if err := capabilitiesDotNotationBackfill.Up(db); err != nil {
		t.Fatalf("re-run Up: %v", err)
	}
	var secondPass string
	if err := db.Raw(`SELECT capability FROM user_permissions WHERE user_id = 'u-1'`).
		Scan(&secondPass).Error; err != nil {
		t.Fatalf("second pass query: %v", err)
	}
	if secondPass != firstPass {
		t.Errorf("idempotent broken: second=%q first=%q", secondPass, firstPass)
	}
}

// TestCapDotBackfill_NoopWhenColumnMissing — minimal scaffold (no
// capability column) → migration is no-op, returns nil.
func TestCapDotBackfill_NoopWhenColumnMissing(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	// Create user_permissions without the `capability` column (alternate
	// legacy shape) — migration must gracefully skip.
	if err := db.Exec(
		`CREATE TABLE user_permissions (id INTEGER PRIMARY KEY AUTOINCREMENT, other TEXT)`,
	).Error; err != nil {
		t.Fatalf("seed minimal: %v", err)
	}
	if err := capabilitiesDotNotationBackfill.Up(db); err != nil {
		t.Errorf("no-op path returned err: %v", err)
	}
}

// TestCapDotBackfill_LeavesUnknownLiteralsAlone — rows with non-snake_case
// values (e.g. forward-compat new tokens, malformed strings) should be
// left untouched.
func TestCapDotBackfill_LeavesUnknownLiteralsAlone(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	seedUserPermissionsTable(t, db)
	for i, lit := range []string{"channel.read", "future.token", "garbage"} {
		if err := db.Exec(
			`INSERT INTO user_permissions (user_id, capability, scope, granted_at) VALUES (?, ?, ?, ?)`,
			"u-1", lit, "s-"+string(rune('a'+i)), int64(i+1),
		).Error; err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	runCapabilitiesDotNotationBackfill(t, db)
	for _, lit := range []string{"channel.read", "future.token", "garbage"} {
		var n int64
		if err := db.Raw(
			`SELECT COUNT(*) FROM user_permissions WHERE capability = ?`, lit,
		).Scan(&n).Error; err != nil {
			t.Fatalf("count %q: %v", lit, err)
		}
		if n != 1 {
			t.Errorf("literal %q expected 1 row, got %d", lit, n)
		}
	}
}
