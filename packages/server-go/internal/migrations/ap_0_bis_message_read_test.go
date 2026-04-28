package migrations

import (
	"testing"

	"gorm.io/gorm"
)

// seedAgentMinimal creates a minimal users + user_permissions schema and
// inserts one agent row with only message.send (i.e. pre-AP-0-bis state).
// Returns the agent id.
//
// We don't use the full store.Migrate() blob here because we want to verify
// AP-0-bis migration behavior in isolation, not its interaction with the
// legacy bootstrap. The two row schemas mirror what models.go declares for
// User and UserPermission at the columns the migration touches.
func seedAgentMinimalSchema(t *testing.T, db *gorm.DB) {
	t.Helper()
	if err := db.Exec(`CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role        TEXT NOT NULL,
  deleted_at  INTEGER
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

func seedLegacyAgent(t *testing.T, db *gorm.DB, id string) {
	t.Helper()
	if err := db.Exec(`INSERT INTO users (id, display_name, role) VALUES (?, ?, 'agent')`, id, "agent-"+id).Error; err != nil {
		t.Fatalf("insert agent: %v", err)
	}
	if err := db.Exec(`INSERT INTO user_permissions (user_id, permission, scope, granted_at) VALUES (?, 'message.send', '*', 1)`, id).Error; err != nil {
		t.Fatalf("insert send perm: %v", err)
	}
}

func countReadPerm(t *testing.T, db *gorm.DB, userID string) int {
	t.Helper()
	var n int64
	if err := db.Raw(`SELECT COUNT(*) FROM user_permissions WHERE user_id = ? AND permission = 'message.read' AND scope = '*'`, userID).Row().Scan(&n); err != nil {
		t.Fatalf("count read: %v", err)
	}
	return int(n)
}

func TestAP0Bis_BackfillsMessageReadForLegacyAgents(t *testing.T) {
	db := openMem(t)
	seedAgentMinimalSchema(t, db)
	seedLegacyAgent(t, db, "agent-1")

	e := New(db)
	e.Register(ap0BisMessageRead)
	if err := e.Run(0); err != nil {
		t.Fatalf("run: %v", err)
	}

	if got := countReadPerm(t, db, "agent-1"); got != 1 {
		t.Fatalf("expected 1 message.read row for agent-1 after backfill, got %d", got)
	}
}

func TestAP0Bis_Idempotent(t *testing.T) {
	db := openMem(t)
	seedAgentMinimalSchema(t, db)
	seedLegacyAgent(t, db, "agent-1")

	// First run: backfill creates the row.
	e := New(db)
	e.Register(ap0BisMessageRead)
	if err := e.Run(0); err != nil {
		t.Fatalf("first run: %v", err)
	}

	// Wipe schema_migrations so the engine re-applies, simulating the
	// "delete db / partial state" scenario the WHERE NOT EXISTS guard exists for.
	if err := db.Exec(`DELETE FROM schema_migrations`).Error; err != nil {
		t.Fatalf("wipe schema_migrations: %v", err)
	}

	e2 := New(db)
	e2.Register(ap0BisMessageRead)
	if err := e2.Run(0); err != nil {
		t.Fatalf("second run: %v", err)
	}

	if got := countReadPerm(t, db, "agent-1"); got != 1 {
		t.Fatalf("expected exactly 1 message.read row after re-run (idempotency), got %d", got)
	}
}

func TestAP0Bis_SkipsNonAgentRoles(t *testing.T) {
	db := openMem(t)
	seedAgentMinimalSchema(t, db)
	if err := db.Exec(`INSERT INTO users (id, display_name, role) VALUES ('member-1', 'Member', 'member')`).Error; err != nil {
		t.Fatalf("insert member: %v", err)
	}
	if err := db.Exec(`INSERT INTO users (id, display_name, role) VALUES ('admin-1', 'Admin', 'admin')`).Error; err != nil {
		t.Fatalf("insert admin: %v", err)
	}

	e := New(db)
	e.Register(ap0BisMessageRead)
	if err := e.Run(0); err != nil {
		t.Fatalf("run: %v", err)
	}

	if got := countReadPerm(t, db, "member-1"); got != 0 {
		t.Fatalf("members should not get message.read backfill; got %d rows", got)
	}
	if got := countReadPerm(t, db, "admin-1"); got != 0 {
		t.Fatalf("admins should not get message.read backfill; got %d rows", got)
	}
}

func TestAP0Bis_SkipsSoftDeletedAgents(t *testing.T) {
	db := openMem(t)
	seedAgentMinimalSchema(t, db)
	if err := db.Exec(`INSERT INTO users (id, display_name, role, deleted_at) VALUES ('zombie', 'Zombie', 'agent', 100)`).Error; err != nil {
		t.Fatalf("insert deleted agent: %v", err)
	}

	e := New(db)
	e.Register(ap0BisMessageRead)
	if err := e.Run(0); err != nil {
		t.Fatalf("run: %v", err)
	}

	if got := countReadPerm(t, db, "zombie"); got != 0 {
		t.Fatalf("soft-deleted agent should not be backfilled; got %d", got)
	}
}
