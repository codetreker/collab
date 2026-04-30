package migrations

import (
	"testing"

	"gorm.io/gorm"
)

// seedLegacyTables creates the minimal Phase-0 tables that CM-1.1 ALTERs.
// The real schema is built by store.createSchema; the migration only cares
// that these table names exist with at least one column so ALTER TABLE ADD
// COLUMN works against sqlite.
//
// AP-0-bis (v=8) reads users.role / users.deleted_at and writes to
// user_permissions, so those columns + that table are seeded too — otherwise
// the registry-wide tests (TestDefaultRegistryRunsClean, ADM-0.1, etc.) that
// run All migrations end-to-end would crash on the AP-0-bis SQL.
func seedLegacyTables(t *testing.T, db *gorm.DB) {
	t.Helper()
	for _, name := range []string{"channels", "messages", "workspace_files", "remote_nodes"} {
		if err := db.Exec("CREATE TABLE " + name + " (id TEXT PRIMARY KEY)").Error; err != nil {
			t.Fatalf("create %s: %v", name, err)
		}
	}
	// users needs role + deleted_at for AP-0-bis backfill predicate.
	if err := db.Exec(`CREATE TABLE users (
  id         TEXT PRIMARY KEY,
  role       TEXT,
  deleted_at INTEGER
)`).Error; err != nil {
		t.Fatalf("create users: %v", err)
	}
	if err := db.Exec(`CREATE TABLE user_permissions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  permission  TEXT NOT NULL,
  scope       TEXT NOT NULL,
  granted_at  INTEGER NOT NULL
)`).Error; err != nil {
		t.Fatalf("create user_permissions: %v", err)
	}
}

func TestCM_CreatesOrganizationsTable(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	seedLegacyTables(t, db)

	e := New(db)
	e.Register(organizations)
	if err := e.Run(0); err != nil {
		t.Fatalf("run: %v", err)
	}

	// organizations exists and has expected columns.
	cols := pragmaColumns(t, db, "organizations")
	for _, want := range []string{"id", "name", "created_at"} {
		if _, ok := cols[want]; !ok {
			t.Fatalf("organizations missing column %q (have %v)", want, keys(cols))
		}
	}
	if !cols["id"].pk {
		t.Fatal("organizations.id should be PRIMARY KEY")
	}
	if !cols["name"].notNull {
		t.Fatal("organizations.name should be NOT NULL")
	}
}

func TestCM_AddsOrgIDToResourceTables(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	seedLegacyTables(t, db)

	e := New(db)
	e.Register(organizations)
	if err := e.Run(0); err != nil {
		t.Fatalf("run: %v", err)
	}

	for _, table := range []string{"users", "channels", "messages", "workspace_files", "remote_nodes"} {
		cols := pragmaColumns(t, db, table)
		c, ok := cols["org_id"]
		if !ok {
			t.Fatalf("%s missing org_id (have %v)", table, keys(cols))
		}
		if !c.notNull {
			t.Fatalf("%s.org_id should be NOT NULL", table)
		}
		// SQLite reports the default literal verbatim including quotes.
		if c.dflt != `''` {
			t.Fatalf("%s.org_id default = %q, want \"''\"", table, c.dflt)
		}
	}
}

func TestCM_CreatesOrgIDIndexes(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	seedLegacyTables(t, db)

	e := New(db)
	e.Register(organizations)
	if err := e.Run(0); err != nil {
		t.Fatalf("run: %v", err)
	}

	wantIdx := []string{
		"idx_users_org_id",
		"idx_channels_org_id",
		"idx_messages_org_id",
		"idx_workspace_files_org_id",
		"idx_remote_nodes_org_id",
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

func TestCommunityOrganizations_IsIdempotentOnRerun(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	seedLegacyTables(t, db)

	for i := 0; i < 2; i++ {
		e := New(db)
		e.Register(organizations)
		if err := e.Run(0); err != nil {
			t.Fatalf("run #%d: %v", i+1, err)
		}
	}

	// schema_migrations records exactly one row for v2.
	var n int64
	if err := db.Raw("SELECT COUNT(*) FROM schema_migrations WHERE version=2").Row().Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 1 {
		t.Fatalf("expected exactly one schema_migrations row for v2, got %d", n)
	}
}

// --- helpers --------------------------------------------------------------

type colInfo struct {
	notNull bool
	pk      bool
	dflt    string
}

func pragmaColumns(t *testing.T, db *gorm.DB, table string) map[string]colInfo {
	t.Helper()
	rows, err := db.Raw("PRAGMA table_info(" + table + ")").Rows()
	if err != nil {
		t.Fatalf("pragma %s: %v", table, err)
	}
	defer rows.Close()
	out := map[string]colInfo{}
	for rows.Next() {
		var (
			cid     int
			name    string
			ctype   string
			notnull int
			dflt    *string
			pk      int
		)
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			t.Fatalf("scan: %v", err)
		}
		ci := colInfo{notNull: notnull != 0, pk: pk != 0}
		if dflt != nil {
			ci.dflt = *dflt
		}
		out[name] = ci
	}
	return out
}

func keys(m map[string]colInfo) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
