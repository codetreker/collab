package migrations

import "testing"

// TestADM_CreatesAdminsTable verifies that migration v=4 creates the
// `admins` table with the strict 4-field schema locked by ADM-0 review
// checklist §ADM-0.1: id / login / password_hash / created_at and nothing
// else (no org_id, role, is_admin, email — admin-model §1.2 hardline).
func TestADM_CreatesAdminsTable(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	seedLegacyTables(t, db)

	e := New(db)
	e.RegisterAll(All)
	if err := e.Run(0); err != nil {
		t.Fatalf("run: %v", err)
	}

	cols := pragmaColumns(t, db, "admins")
	want := map[string]bool{"id": true, "login": true, "password_hash": true, "created_at": true}
	for k := range want {
		if _, ok := cols[k]; !ok {
			t.Errorf("admins missing column %q", k)
		}
	}
	// Reject any extra column — review checklist red line: 不准多 org_id /
	// role / is_admin / email or anything else.
	for k := range cols {
		if !want[k] {
			t.Errorf("admins has unexpected column %q (only id/login/password_hash/created_at allowed)", k)
		}
	}
}

// TestADM_LoginUnique verifies the UNIQUE(login) invariant. Bootstrap
// idempotency relies on this — see admin.BootstrapWith ON CONFLICT(login)
// DO NOTHING.
func TestADM_LoginUnique(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	seedLegacyTables(t, db)

	e := New(db)
	e.RegisterAll(All)
	if err := e.Run(0); err != nil {
		t.Fatalf("run: %v", err)
	}

	if err := db.Exec(
		`INSERT INTO admins (id, login, password_hash, created_at) VALUES (?, ?, ?, ?)`,
		"id-1", "root", "$2a$10$x", 1,
	).Error; err != nil {
		t.Fatalf("first insert: %v", err)
	}
	err := db.Exec(
		`INSERT INTO admins (id, login, password_hash, created_at) VALUES (?, ?, ?, ?)`,
		"id-2", "root", "$2a$10$y", 2,
	).Error
	if err == nil {
		t.Fatal("duplicate login insert succeeded; want UNIQUE constraint failure")
	}
}

// TestADM_VersionPosition pins the migration version to 4. The migration
// version is immutable once on main; this test fails loud if a future PR
// renumbers (review checklist §ADM-0.1: schema_migrations v 号必须紧跟 main
// 当前最大 v + 1, 单调递增, 不准跳号).
func TestADM_VersionPosition(t *testing.T) {
	t.Parallel()
	if adm01Admins.Version != 4 {
		t.Fatalf("adm_0_1_admins version = %d, want 4", adm01Admins.Version)
	}
	if adm01Admins.Name != "adm_0_1_admins" {
		t.Fatalf("adm_0_1_admins name = %q, want \"adm_0_1_admins\"", adm01Admins.Name)
	}
}
