package migrations

import (
	"testing"

	"gorm.io/gorm"
)

// runAP11 runs migration v=24 (AP-1.1) on a memory DB. Requires the
// user_permissions table to exist first; we create it inline (matching
// the legacy store schema) so tests don't depend on store init.
func runAP11(t *testing.T, db *gorm.DB) {
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
	e.Register(ap11UserPermissionsExpires)
	if err := e.Run(0); err != nil {
		t.Fatalf("run ap_1_1: %v", err)
	}
}

// TestAP11_AddsExpiresAtColumn pins acceptance §1.1 — schema 加列 nullable
// (NULL = 永久, 跟蓝图 §1.2 字面承袭). 反向: 不挂 NOT NULL, 现网行
// expires_at 全 NULL = 行为零变.
func TestAP11_AddsExpiresAtColumn(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	runAP11(t, db)

	cols := pragmaColumns(t, db, "user_permissions")
	c, ok := cols["expires_at"]
	if !ok {
		t.Fatalf("user_permissions missing expires_at column (have %v)", keys(cols))
	}
	if c.notNull {
		t.Errorf("user_permissions.expires_at must be nullable (NULL = 永久, 蓝图 §1.2 字面)")
	}
}

// TestAP11_HasSparseIndex pins acceptance §1.2 — partial index 覆盖
// expires_at IS NOT NULL 行 (sweeper 热路径 v2+ 业务化时挂).
func TestAP11_HasSparseIndex(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	runAP11(t, db)

	const idx = "idx_user_permissions_expires"
	var sql string
	err := db.Raw(`SELECT sql FROM sqlite_master WHERE type='index' AND name=?`, idx).Scan(&sql).Error
	if err != nil || sql == "" {
		t.Fatalf("missing index %s (err=%v)", idx, err)
	}
	if !containsCI(sql, "WHERE expires_at IS NOT NULL") {
		t.Errorf("index %s must be partial (WHERE expires_at IS NOT NULL) — sparse 覆盖 sweeper 路径; got: %s", idx, sql)
	}
}

// TestAP11_NullExpiresIsLegit pins acceptance §1.3 — NULL expires_at 是
// 合法终态 (永久, 现网行为不变).
func TestAP11_NullExpiresIsLegit(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	runAP11(t, db)

	if err := db.Exec(`INSERT INTO user_permissions
		(user_id, permission, scope, granted_at)
		VALUES ('u-1', 'message.read', '*', 1700000000000)`).Error; err != nil {
		t.Fatalf("insert without expires_at: %v", err)
	}
	var n int64
	if err := db.Raw(`SELECT COUNT(*) FROM user_permissions WHERE user_id='u-1' AND expires_at IS NULL`).Row().Scan(&n); err != nil {
		t.Fatalf("query: %v", err)
	}
	if n != 1 {
		t.Errorf("expected 1 NULL-expires row, got %d", n)
	}
}

// TestAP11_AcceptsExplicitExpires pins acceptance §1.3 — schema 接受
// expires_at 显式赋值 (v2+ 业务化时 server 端写, v1 留 schema slot).
func TestAP11_AcceptsExplicitExpires(t *testing.T) {
	t.Parallel()
	db := openMem(t)
	runAP11(t, db)

	if err := db.Exec(`INSERT INTO user_permissions
		(user_id, permission, scope, granted_at, expires_at)
		VALUES ('u-2', 'workspace.read', 'artifact:art-1', 1700000000000, 1800000000000)`).Error; err != nil {
		t.Fatalf("insert with expires_at: %v", err)
	}
	var ts *int64
	if err := db.Raw(`SELECT expires_at FROM user_permissions WHERE user_id='u-2'`).Row().Scan(&ts); err != nil {
		t.Fatalf("query: %v", err)
	}
	if ts == nil || *ts != 1800000000000 {
		t.Errorf("expected expires_at=1800000000000, got %v", ts)
	}
}

// TestAP11_RegistryHasV24 pins v=24 sequencing — registry.go 字面锁,
// AL-1b.1 v=21 / ADM-2.1 v=22 / ADM-2.2 v=23 / **AP-1.1 v=24**.
func TestAP11_RegistryHasV24(t *testing.T) {
	t.Parallel()
	for _, m := range All {
		if m.Version == 24 {
			if m.Name != "ap_1_1_user_permissions_expires" {
				t.Errorf("v=24 name drift: got %q, want %q", m.Name, "ap_1_1_user_permissions_expires")
			}
			return
		}
	}
	t.Fatal("v=24 (AP-1.1) not registered in migrations.All")
}
