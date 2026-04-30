package migrations

import (
	"strings"
	"testing"

	"gorm.io/gorm"
)

// seedChn11Schema stands up a realistic channels + channel_members + users
// surface so chn_1_1 exercises its full body (rebuild, dup pre-flight,
// silent backfill, org_id_at_join snapshot). Mirrors the createSchema
// shape relevant to channel-model.md §1.1 / §2 invariants.
func seedChn11Schema(t *testing.T, db *gorm.DB) {
	t.Helper()
	stmts := []string{
		// channels with the inline UNIQUE(name) that v=11 must rip out.
		`CREATE TABLE channels (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  topic       TEXT DEFAULT '',
  visibility  TEXT DEFAULT 'public',
  created_at  INTEGER NOT NULL,
  created_by  TEXT NOT NULL,
  deleted_at  INTEGER,
  org_id      TEXT NOT NULL DEFAULT ''
)`,
		`CREATE INDEX idx_channels_org_id ON channels(org_id)`,
		`CREATE TABLE channel_members (
  channel_id TEXT,
  user_id    TEXT,
  joined_at  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (channel_id, user_id)
)`,
		`CREATE TABLE users (
  id      TEXT PRIMARY KEY,
  role    TEXT NOT NULL DEFAULT 'member',
  org_id  TEXT NOT NULL DEFAULT ''
)`,
	}
	for _, s := range stmts {
		if err := db.Exec(s).Error; err != nil {
			t.Fatalf("seed: %v\nSQL: %s", err, s)
		}
	}
}

func runCHN11(t *testing.T, db *gorm.DB) {
	t.Helper()
	e := New(db)
	e.Register(chn11ChannelsOrgScoped)
	if err := e.Run(0); err != nil {
		t.Fatalf("run chn_1_1: %v", err)
	}
}

func TestCHN11_AddsArchivedAtAndSilentColumns(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	seedChn11Schema(t, db)
	runCHN11(t, db)

	chCols := pragmaColumns(t, db, "channels")
	if _, ok := chCols["archived_at"]; !ok {
		t.Fatalf("channels missing archived_at (have %v)", keys(chCols))
	}
	if chCols["archived_at"].notNull {
		t.Fatal("archived_at must be nullable (NULL = active)")
	}

	cmCols := pragmaColumns(t, db, "channel_members")
	silent, ok := cmCols["silent"]
	if !ok {
		t.Fatalf("channel_members missing silent (have %v)", keys(cmCols))
	}
	if !silent.notNull {
		t.Fatal("channel_members.silent must be NOT NULL")
	}
	if silent.dflt != "0" {
		t.Fatalf("silent default = %q, want \"0\"", silent.dflt)
	}
	oj, ok := cmCols["org_id_at_join"]
	if !ok {
		t.Fatalf("channel_members missing org_id_at_join (have %v)", keys(cmCols))
	}
	if !oj.notNull || oj.dflt != `''` {
		t.Fatalf("org_id_at_join: notnull=%v dflt=%q", oj.notNull, oj.dflt)
	}
}

func TestCHN11_DropsGlobalNameUniqueAndAddsPerOrgIndex(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	seedChn11Schema(t, db)
	runCHN11(t, db)

	// Per-org composite unique index exists.
	var n int64
	row := db.Raw(
		`SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_channels_org_id_name'`,
	).Row()
	if err := row.Scan(&n); err != nil {
		t.Fatalf("scan: %v", err)
	}
	if n != 1 {
		t.Fatalf("expected idx_channels_org_id_name to exist, got count=%d", n)
	}

	// Cross-org same-name is now legal.
	insert := func(id, name, org string) error {
		return db.Exec(
			`INSERT INTO channels (id, name, topic, visibility, created_at, created_by, org_id)
			 VALUES (?, ?, '', 'public', 1, 'u', ?)`,
			id, name, org,
		).Error
	}
	if err := insert("c1", "general", "orgA"); err != nil {
		t.Fatalf("insert c1: %v", err)
	}
	if err := insert("c2", "general", "orgB"); err != nil {
		t.Fatalf("cross-org same-name should be legal but got: %v", err)
	}
	// Same-org duplicate must still fail (per-org UNIQUE).
	if err := insert("c3", "general", "orgA"); err == nil {
		t.Fatal("same-org duplicate name should fail UNIQUE(org_id, name)")
	} else if !strings.Contains(strings.ToLower(err.Error()), "unique") {
		t.Fatalf("expected UNIQUE violation, got: %v", err)
	}

	// Idx_channels_org_id (the legacy non-unique index) must survive rebuild.
	row = db.Raw(
		`SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_channels_org_id'`,
	).Row()
	_ = row.Scan(&n)
	if n != 1 {
		t.Fatalf("idx_channels_org_id must survive rebuild, got count=%d", n)
	}
}

func TestCHN11_HardFailsOnHistoricDuplicateNoAutoRename(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	// Seed without inline UNIQUE so we can plant a duplicate (org_id, name) row.
	stmts := []string{
		`CREATE TABLE channels (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  topic       TEXT DEFAULT '',
  visibility  TEXT DEFAULT 'public',
  created_at  INTEGER NOT NULL,
  created_by  TEXT NOT NULL,
  deleted_at  INTEGER,
  org_id      TEXT NOT NULL DEFAULT ''
)`,
		`CREATE TABLE channel_members (
  channel_id TEXT,
  user_id    TEXT,
  joined_at  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (channel_id, user_id)
)`,
		`CREATE TABLE users (id TEXT PRIMARY KEY, role TEXT, org_id TEXT)`,
		`INSERT INTO channels (id, name, created_at, created_by, org_id) VALUES ('c1', 'general', 1, 'u', 'orgA')`,
		`INSERT INTO channels (id, name, created_at, created_by, org_id) VALUES ('c2', 'general', 1, 'u', 'orgA')`,
	}
	for _, s := range stmts {
		if err := db.Exec(s).Error; err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	e := New(db)
	e.Register(chn11ChannelsOrgScoped)
	err := e.Run(0)
	if err == nil {
		t.Fatal("expected hard-fail on historic dup (org_id, name)")
	}
	if !strings.Contains(err.Error(), "duplicate") || !strings.Contains(err.Error(), "no auto-rename") {
		t.Fatalf("error must name dup + no auto-rename clause, got: %v", err)
	}
	// Migration must not be recorded.
	applied, _ := e.Applied()
	if _, ok := applied[11]; ok {
		t.Fatal("failed migration must not be recorded in schema_migrations")
	}
}

func TestCHN11_BackfillsAgentSilentAndOrgIDAtJoin(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	seedChn11Schema(t, db)
	// Seed: 1 human (member, orgA), 1 agent (orgA), each in 1 channel.
	for _, s := range []string{
		`INSERT INTO users (id, role, org_id) VALUES ('alice', 'member', 'orgA')`,
		`INSERT INTO users (id, role, org_id) VALUES ('bot1',  'agent',  'orgA')`,
		`INSERT INTO channels (id, name, created_at, created_by, org_id) VALUES ('ch1', 'general', 1, 'alice', 'orgA')`,
		`INSERT INTO channel_members (channel_id, user_id, joined_at) VALUES ('ch1', 'alice', 1)`,
		`INSERT INTO channel_members (channel_id, user_id, joined_at) VALUES ('ch1', 'bot1',  1)`,
	} {
		if err := db.Exec(s).Error; err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	runCHN11(t, db)

	// agent row -> silent = 1, human row -> silent = 0
	var aliceSilent, botSilent int
	db.Raw(`SELECT silent FROM channel_members WHERE user_id='alice'`).Row().Scan(&aliceSilent)
	db.Raw(`SELECT silent FROM channel_members WHERE user_id='bot1'`).Row().Scan(&botSilent)
	if aliceSilent != 0 {
		t.Fatalf("human alice.silent = %d, want 0", aliceSilent)
	}
	if botSilent != 1 {
		t.Fatalf("agent bot1.silent = %d, want 1 (default-silent stance)", botSilent)
	}
	// org_id_at_join snapshot
	var aliceOJ, botOJ string
	db.Raw(`SELECT org_id_at_join FROM channel_members WHERE user_id='alice'`).Row().Scan(&aliceOJ)
	db.Raw(`SELECT org_id_at_join FROM channel_members WHERE user_id='bot1'`).Row().Scan(&botOJ)
	if aliceOJ != "orgA" || botOJ != "orgA" {
		t.Fatalf("org_id_at_join snapshot wrong: alice=%q bot=%q (want orgA both)", aliceOJ, botOJ)
	}
}

func TestCHN11_IsIdempotentOnRerun(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	seedChn11Schema(t, db)
	for i := 0; i < 2; i++ {
		e := New(db)
		e.Register(chn11ChannelsOrgScoped)
		if err := e.Run(0); err != nil {
			t.Fatalf("run #%d: %v", i+1, err)
		}
	}
	var n int64
	if err := db.Raw(`SELECT COUNT(*) FROM schema_migrations WHERE version=11`).Row().Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 1 {
		t.Fatalf("expected exactly one schema_migrations row for v=11, got %d", n)
	}
}

func TestCHN11_ToleratesTrimmedSchema(t *testing.T) {
	t.Parallel()
	// Trimmed scaffold (matches TestDefaultRegistryRunsClean shape):
	// channels(id) + channels.created_by, no channel_members. Migration must
	// not crash on the chn-1.1 step.
	db := openMem(t)
	if err := db.Exec(`CREATE TABLE channels (id TEXT PRIMARY KEY, created_by TEXT)`).Error; err != nil {
		t.Fatalf("seed: %v", err)
	}
	e := New(db)
	e.Register(chn11ChannelsOrgScoped)
	if err := e.Run(0); err != nil {
		t.Fatalf("trimmed run: %v", err)
	}
}
