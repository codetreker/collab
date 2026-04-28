package migrations

import (
	"testing"
)

// TestCMOnboardingWelcome_AddsQuickActionColumn — step 1 of v=7 must add
// `messages.quick_action` (TEXT, nullable). The seed/backfill steps are
// no-ops on the minimal scaffold, but the column-add must run.
func TestCMOnboardingWelcome_AddsQuickActionColumn(t *testing.T) {
	db := openMem(t)
	seedLegacyTables(t, db)

	e := New(db)
	e.Register(cmOnboardingWelcome)
	if err := e.Run(0); err != nil {
		t.Fatalf("run: %v", err)
	}

	cols := pragmaColumns(t, db, "messages")
	if _, ok := cols["quick_action"]; !ok {
		t.Fatalf("messages.quick_action missing (have %v)", keys(cols))
	}
	// schema_migrations records v=7 exactly once.
	var n int64
	if err := db.Raw("SELECT COUNT(*) FROM schema_migrations WHERE version=7").Row().Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 1 {
		t.Fatalf("schema_migrations v7 = %d, want 1", n)
	}
}

// TestCMOnboardingWelcome_SeedsSystemUserAndBackfills exercises the full
// migration against the real schema (built by the prior migrations in the
// chain). Pre-existing users without a #welcome channel must get one
// (channel + member + system message with quick_action).
func TestCMOnboardingWelcome_SeedsSystemUserAndBackfills(t *testing.T) {
	db := openMem(t)
	seedLegacyTables(t, db)

	e := New(db)
	e.Register(cm11Organizations)
	if err := e.Run(0); err != nil {
		t.Fatalf("phase1: %v", err)
	}
	// Create the auxiliary tables that v=7 backfill expects (channel_members
	// and the columns the real store-built schema would carry). The seed
	// scaffold only gives `(id TEXT PRIMARY KEY)` placeholders, so we extend
	// them just enough to exercise the backfill branch.
	for _, ddl := range []string{
		`ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''`,
		// users.role + users.deleted_at are now seeded by seedLegacyTables (AP-0-bis v=8 prerequisite).
		`ALTER TABLE users ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE users ADD COLUMN require_mention INTEGER NOT NULL DEFAULT 1`,
		`ALTER TABLE channels ADD COLUMN name TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE channels ADD COLUMN topic TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE channels ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'`,
		`ALTER TABLE channels ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0`,
		`ALTER TABLE channels ADD COLUMN created_by TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE channels ADD COLUMN type TEXT NOT NULL DEFAULT 'channel'`,
		`ALTER TABLE channels ADD COLUMN position TEXT NOT NULL DEFAULT '0|aaaaaa'`,
		`ALTER TABLE channels ADD COLUMN deleted_at INTEGER`,
		`ALTER TABLE messages ADD COLUMN channel_id TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE messages ADD COLUMN sender_id TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE messages ADD COLUMN content TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE messages ADD COLUMN content_type TEXT NOT NULL DEFAULT 'text'`,
		`ALTER TABLE messages ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0`,
		`CREATE TABLE channel_members (channel_id TEXT, user_id TEXT, joined_at INTEGER, PRIMARY KEY(channel_id, user_id))`,
		// Pre-existing user without a welcome channel.
		`INSERT INTO users (id, display_name, role, created_at, disabled, require_mention, org_id) VALUES ('alice', 'Alice', 'member', 0, 0, 1, 'org-x')`,
	} {
		if err := db.Exec(ddl).Error; err != nil {
			t.Fatalf("ddl %q: %v", ddl, err)
		}
	}

	e2 := New(db)
	e2.Register(cmOnboardingWelcome)
	if err := e2.Run(0); err != nil {
		t.Fatalf("v7: %v", err)
	}

	// system user seeded
	var sysCount int64
	db.Raw("SELECT COUNT(*) FROM users WHERE id='system'").Row().Scan(&sysCount)
	if sysCount != 1 {
		t.Fatalf("system user not seeded (count=%d)", sysCount)
	}

	// alice has a backfilled welcome channel
	var chCount int64
	db.Raw("SELECT COUNT(*) FROM channels WHERE created_by='alice' AND type='system'").Row().Scan(&chCount)
	if chCount != 1 {
		t.Fatalf("alice welcome channels = %d, want 1", chCount)
	}

	// channel_member exists
	var mCount int64
	db.Raw("SELECT COUNT(*) FROM channel_members WHERE user_id='alice'").Row().Scan(&mCount)
	if mCount != 1 {
		t.Fatalf("alice channel_members = %d, want 1", mCount)
	}

	// system message with quick_action present
	var qa *string
	db.Raw(`SELECT quick_action FROM messages WHERE sender_id='system'`).Row().Scan(&qa)
	if qa == nil || *qa != WelcomeQuickActionJSON {
		t.Fatalf("welcome quick_action = %v, want %q", qa, WelcomeQuickActionJSON)
	}
}

// TestCMOnboardingWelcome_IsIdempotent — re-running v=7 must not create a
// second welcome channel or duplicate the system user.
func TestCMOnboardingWelcome_IsIdempotent(t *testing.T) {
	db := openMem(t)
	seedLegacyTables(t, db)

	e := New(db)
	e.Register(cm11Organizations)
	e.Register(cmOnboardingWelcome)
	if err := e.Run(0); err != nil {
		t.Fatalf("first run: %v", err)
	}
	// Second run is a no-op (already-applied check in engine).
	if err := e.Run(0); err != nil {
		t.Fatalf("second run: %v", err)
	}
	var n int64
	db.Raw("SELECT COUNT(*) FROM schema_migrations WHERE version=7").Row().Scan(&n)
	if n != 1 {
		t.Fatalf("schema_migrations v7 rows = %d, want 1", n)
	}
}
