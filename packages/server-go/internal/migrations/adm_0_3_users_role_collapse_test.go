package migrations

import (
	"testing"

	"gorm.io/gorm"
)

// schemaForADM03 stands up the trimmed surface adm03UsersRoleCollapse needs
// (users + admins + user_permissions; sessions intentionally omitted to
// exercise the hasTable gate for the future-only sessions branch).
func schemaForADM03(t *testing.T, db *gorm.DB) {
	t.Helper()
	stmts := []string{
		`CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT,
  password_hash TEXT,
  role          TEXT NOT NULL DEFAULT 'member',
  display_name  TEXT,
  deleted_at    INTEGER
)`,
		`CREATE TABLE admins (
  id            TEXT PRIMARY KEY,
  login         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
)`,
		`CREATE UNIQUE INDEX idx_admins_login ON admins(login)`,
		`CREATE TABLE user_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  permission TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '*',
  granted_by TEXT,
  granted_at INTEGER NOT NULL
)`,
	}
	for _, s := range stmts {
		if err := db.Exec(s).Error; err != nil {
			t.Fatalf("schema: %v", err)
		}
	}
}

// seedAdmin inserts a users.role='admin' row + a (*, *) wildcard user_permission
// (the ADM-0.2 splice that ADM-0.3 sweeps). Returns the user id so tests can
// assert downstream cleanup.
func seedAdmin(t *testing.T, db *gorm.DB, id, email, hash string) {
	t.Helper()
	if err := db.Exec(
		`INSERT INTO users (id, email, password_hash, role, display_name) VALUES (?, ?, ?, 'admin', ?)`,
		id, email, hash, email,
	).Error; err != nil {
		t.Fatalf("insert admin user: %v", err)
	}
	if err := db.Exec(
		`INSERT INTO user_permissions (user_id, permission, scope, granted_at) VALUES (?, '*', '*', 1)`,
		id,
	).Error; err != nil {
		t.Fatalf("insert wildcard perm: %v", err)
	}
}

func runADM03(t *testing.T, db *gorm.DB) {
	t.Helper()
	if err := adm03UsersRoleCollapse.Up(db); err != nil {
		t.Fatalf("adm-0.3 up: %v", err)
	}
}

// 3.A: post-migration users WHERE role='admin' = 0.
// 3.B: legacy admin lands in admins table (login = email, hash carried).
// 3.C: orphan user_permissions for the admin user are gone.
func TestADM03_BackfillAndCollapse(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	schemaForADM03(t, db)
	seedAdmin(t, db, "u-legacy-1", "legacy@example.com", "$2a$10$abc")

	runADM03(t, db)

	// 3.A — collapse.
	var n int64
	if err := db.Raw(`SELECT COUNT(*) FROM users WHERE role='admin'`).Row().Scan(&n); err != nil {
		t.Fatalf("count admin users: %v", err)
	}
	if n != 0 {
		t.Fatalf("3.A: expected 0 admin users, got %d", n)
	}

	// 3.B — admins table now has the login.
	var login, hash string
	row := db.Raw(`SELECT login, password_hash FROM admins WHERE login = ?`, "legacy@example.com").Row()
	if err := row.Scan(&login, &hash); err != nil {
		t.Fatalf("3.B: expected admins row for legacy login: %v", err)
	}
	if login != "legacy@example.com" || hash != "$2a$10$abc" {
		t.Fatalf("3.B: hash/login not carried (login=%q hash=%q)", login, hash)
	}

	// 3.C — wildcard user_permissions for the deleted admin is swept.
	if err := db.Raw(`SELECT COUNT(*) FROM user_permissions WHERE user_id = ?`, "u-legacy-1").Row().Scan(&n); err != nil {
		t.Fatalf("count perms: %v", err)
	}
	if n != 0 {
		t.Fatalf("3.C: expected 0 orphan perms, got %d", n)
	}
}

// 3.D: idempotent — running the migration twice yields the same end state.
func TestADM03_Idempotent(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	schemaForADM03(t, db)
	seedAdmin(t, db, "u-legacy-2", "twice@example.com", "$2a$10$xyz")

	runADM03(t, db)
	// Second run must not panic, must not double-insert, must not error.
	runADM03(t, db)

	var n int64
	if err := db.Raw(`SELECT COUNT(*) FROM admins WHERE login = ?`, "twice@example.com").Row().Scan(&n); err != nil {
		t.Fatalf("count admins: %v", err)
	}
	if n != 1 {
		t.Fatalf("3.D: expected exactly 1 admins row, got %d", n)
	}
}

// 3.D bis: re-applying when an admins row already exists (env bootstrap path)
// must not duplicate; ON CONFLICT(login) DO NOTHING is the gate.
func TestADM03_PreexistingAdminLogin(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	schemaForADM03(t, db)
	// Bootstrap already inserted this login with a different hash.
	if err := db.Exec(
		`INSERT INTO admins (id, login, password_hash, created_at) VALUES ('a-pre', 'shared@example.com', '$2a$10$BOOT', 1)`,
	).Error; err != nil {
		t.Fatalf("seed bootstrap admin: %v", err)
	}
	seedAdmin(t, db, "u-shared", "shared@example.com", "$2a$10$LEGACY")

	runADM03(t, db)

	var hash string
	row := db.Raw(`SELECT password_hash FROM admins WHERE login = ?`, "shared@example.com").Row()
	if err := row.Scan(&hash); err != nil {
		t.Fatalf("scan: %v", err)
	}
	if hash != "$2a$10$BOOT" {
		t.Fatalf("conflict path overwrote bootstrap admin: got %q", hash)
	}

	// And the legacy users.role='admin' row is still gone.
	var n int64
	if err := db.Raw(`SELECT COUNT(*) FROM users WHERE role='admin'`).Row().Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Fatalf("expected 0 admin users after conflict path, got %d", n)
	}
}

// hasTable gate must skip cleanly when sessions / admins / user_permissions
// don't exist in the schema (trimmed migration-test fixtures).
func TestADM03_TolerantToTrimmedSchema(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	// Only the bare users table — no admins, no user_permissions, no sessions.
	if err := db.Exec(`CREATE TABLE users (
  id   TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'member'
)`).Error; err != nil {
		t.Fatalf("schema: %v", err)
	}
	if err := db.Exec(`INSERT INTO users (id, role) VALUES ('u', 'admin')`).Error; err != nil {
		t.Fatalf("seed: %v", err)
	}

	runADM03(t, db)

	var n int64
	if err := db.Raw(`SELECT COUNT(*) FROM users WHERE role='admin'`).Row().Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Fatalf("expected 0 admin users in trimmed schema, got %d", n)
	}
}

// hasTable gate must also skip when the users table itself is absent.
func TestADM03_NoUsersTable(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	// No users table at all.
	if err := adm03UsersRoleCollapse.Up(db); err != nil {
		t.Fatalf("expected no-op on missing users table: %v", err)
	}
}
