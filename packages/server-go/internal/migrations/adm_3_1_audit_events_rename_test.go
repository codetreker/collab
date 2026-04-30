package migrations

import (
	"testing"

	"gorm.io/gorm"
)

// runADM31 chains adm_2_1 → ap_2_1 → bpp_8_1 → al_7_1 → adm_3_1
// admin_actions migrations. Last step renames table → audit_events
// + creates view alias.
func runADM31(t *testing.T, db *gorm.DB) {
	t.Helper()
	if err := db.Exec(`CREATE TABLE IF NOT EXISTS user_permissions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  permission  TEXT NOT NULL,
  scope       TEXT NOT NULL DEFAULT '*',
  granted_by  TEXT,
  granted_at  INTEGER NOT NULL,
  UNIQUE(user_id, permission, scope)
)`).Error; err != nil {
		t.Fatalf("seed user_permissions: %v", err)
	}
	e := New(db)
	e.Register(adm21AdminActions)
	e.Register(ap21UserPermissionsRevoked)
	e.Register(bpp81AdminActionsPluginActions)
	e.Register(al71AdminActionsArchivedAt)
	e.Register(adm31AuditEventsRename)
	if err := e.Run(0); err != nil {
		t.Fatalf("run adm_3_1 chain: %v", err)
	}
}

// TestADM31_AuditEventsTableExists — acceptance §1.1.
// After RENAME, the new audit_events table must exist as a real table
// (not view) with the original schema preserved.
func TestADM31_AuditEventsTableExists(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	runADM31(t, db)
	var typ string
	if err := db.Raw(
		`SELECT type FROM sqlite_master WHERE name='audit_events' AND type='table'`,
	).Scan(&typ).Error; err != nil {
		t.Fatalf("query: %v", err)
	}
	if typ != "table" {
		t.Errorf("audit_events expected table, got %q", typ)
	}
}

// TestADM31_AdminActionsViewExists — acceptance §1.2.
// After RENAME, admin_actions must exist as a VIEW (alias backward compat).
func TestADM31_AdminActionsViewExists(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	runADM31(t, db)
	var typ string
	if err := db.Raw(
		`SELECT type FROM sqlite_master WHERE name='admin_actions'`,
	).Scan(&typ).Error; err != nil {
		t.Fatalf("query: %v", err)
	}
	if typ != "view" {
		t.Errorf("admin_actions expected view (alias), got %q", typ)
	}
}

// TestADM31_ViewSelectRoundtrip — acceptance §1.3.
// SELECT FROM admin_actions (view) must return the same rows as
// SELECT FROM audit_events (table). View is read-transparent.
func TestADM31_ViewSelectRoundtrip(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	runADM31(t, db)

	// Insert via the table (canonical write path post-RENAME).
	if err := db.Exec(`INSERT INTO audit_events (id, actor_id, target_user_id, action, metadata, created_at)
		VALUES ('e1', 'admin-1', 'user-1', 'suspend_user', '{}', 1700000000000)`).Error; err != nil {
		t.Fatalf("insert audit_events: %v", err)
	}

	var fromTable, fromView string
	if err := db.Raw(`SELECT action FROM audit_events WHERE id = 'e1'`).Scan(&fromTable).Error; err != nil {
		t.Fatalf("table select: %v", err)
	}
	if err := db.Raw(`SELECT action FROM admin_actions WHERE id = 'e1'`).Scan(&fromView).Error; err != nil {
		t.Fatalf("view select: %v", err)
	}
	if fromTable != fromView || fromTable != "suspend_user" {
		t.Errorf("view round-trip: table=%q view=%q", fromTable, fromView)
	}
}

// TestADM31_ViewInsertRoutedToTable — acceptance §1.4.
// INSERT into admin_actions view must route through INSTEAD OF trigger
// to audit_events table (backward compat for legacy gorm
// `(AdminAction).TableName() == "admin_actions"`).
func TestADM31_ViewInsertRoutedToTable(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	runADM31(t, db)

	if err := db.Exec(`INSERT INTO admin_actions (id, actor_id, target_user_id, action, metadata, created_at)
		VALUES ('e2', 'admin-1', 'user-1', 'delete_channel', '{}', 1700000000001)`).Error; err != nil {
		t.Fatalf("insert via view: %v", err)
	}

	var count int64
	if err := db.Raw(`SELECT COUNT(*) FROM audit_events WHERE id = 'e2'`).Scan(&count).Error; err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 1 {
		t.Errorf("INSTEAD OF trigger broken — expected 1 audit_events row from view INSERT, got %d", count)
	}
}

// TestADM31_VersionIs43 — acceptance §1.5.
// migration must be registered at v=43 (team-lead 占号 reservation).
func TestADM31_VersionIs43(t *testing.T) {
	t.Parallel()
	if adm31AuditEventsRename.Version != 43 {
		t.Errorf("ADM-3.1 version expected 43, got %d", adm31AuditEventsRename.Version)
	}
}

// TestADM31_Idempotent — acceptance §1.6.
// Re-running migration must be a no-op (forward-only stance shared with
// ADM-2.1 + AL-7.1 + AP-2.1 + BPP-8.1 + AP-1.1 + AP-3.1).
func TestADM31_Idempotent(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	runADM31(t, db)

	// Re-run only the rename migration — must skip cleanly.
	e := New(db)
	e.Register(adm31AuditEventsRename)
	if err := e.Run(0); err != nil {
		t.Fatalf("idempotent re-run: %v", err)
	}

	// audit_events still exists as table.
	var typ string
	db.Raw(`SELECT type FROM sqlite_master WHERE name='audit_events'`).Scan(&typ)
	if typ != "table" {
		t.Errorf("idempotent re-run lost audit_events table type, got %q", typ)
	}
}
