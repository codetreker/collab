package admin_test

import (
	"testing"

	"borgee-server/internal/admin"
	"borgee-server/internal/migrations"
	tdb "borgee-server/internal/testutil/db"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// hashAt returns a bcrypt hash for plain at the given cost. Used to satisfy
// review checklist invariant "bcrypt cost ≥ 10" (the package's MinBcryptCost).
func hashAt(t *testing.T, plain string, cost int) string {
	t.Helper()
	h, err := bcrypt.GenerateFromPassword([]byte(plain), cost)
	if err != nil {
		t.Fatalf("bcrypt: %v", err)
	}
	return string(h)
}

// openMigratedDB returns a fresh in-memory DB with the migrations engine
// applied through the full registry. The engine's earlier migrations (CM-1.1,
// AP-0-bis, ...) ALTER `users` / `channels` / `messages` / `workspace_files` /
// `remote_nodes`, and AP-0-bis (v=8) reads users.role / users.deleted_at and
// inserts into user_permissions, so we seed those Phase-0 tables and
// columns first — same pattern the migrations package's own tests use
// (see seedLegacyTables in cm_1_1_organizations_test.go).
func openMigratedDB(t *testing.T) *gorm.DB {
	t.Helper()
	db := tdb.Open(t)
	for _, name := range []string{"channels", "messages", "workspace_files", "remote_nodes"} {
		if err := db.Exec("CREATE TABLE " + name + " (id TEXT PRIMARY KEY)").Error; err != nil {
			t.Fatalf("seed %s: %v", name, err)
		}
	}
	// users needs role + deleted_at for AP-0-bis backfill predicate.
	if err := db.Exec(`CREATE TABLE users (
  id         TEXT PRIMARY KEY,
  role       TEXT,
  deleted_at INTEGER
)`).Error; err != nil {
		t.Fatalf("seed users: %v", err)
	}
	if err := db.Exec(`CREATE TABLE user_permissions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  permission  TEXT NOT NULL,
  scope       TEXT NOT NULL,
  granted_at  INTEGER NOT NULL
)`).Error; err != nil {
		t.Fatalf("seed user_permissions: %v", err)
	}
	if err := migrations.Default(db).Run(0); err != nil {
		t.Fatalf("migrations: %v", err)
	}
	return db
}

// TestBootstrap_1A_PanicsOnMissingEnv covers review checklist invariant 1.A:
// "env 未设 → server 启动 fail-loud (panic with clear message)".
//
// We exercise BootstrapWith directly so we don't have to manipulate process
// env state in tests. cmd/collab/main.go calls Bootstrap which delegates to
// BootstrapWith using os.Getenv — equivalent fail-loud behavior.
func TestBootstrap_1A_PanicsOnMissingEnv(t *testing.T) {
	db := openMigratedDB(t)

	t.Run("missing login", func(t *testing.T) {
		defer func() {
			if r := recover(); r == nil {
				t.Fatal("expected panic on missing BORGEE_ADMIN_LOGIN")
			}
		}()
		_ = admin.BootstrapWith(db, "", hashAt(t, "pw", 10))
	})

	t.Run("missing password hash", func(t *testing.T) {
		defer func() {
			if r := recover(); r == nil {
				t.Fatal("expected panic on missing BORGEE_ADMIN_PASSWORD_HASH")
			}
		}()
		_ = admin.BootstrapWith(db, "root", "")
	})

	t.Run("rejects non-bcrypt hash", func(t *testing.T) {
		defer func() {
			if r := recover(); r == nil {
				t.Fatal("expected panic on non-bcrypt hash")
			}
		}()
		_ = admin.BootstrapWith(db, "root", "plain-text-not-bcrypt")
	})

	t.Run("rejects bcrypt cost < 10", func(t *testing.T) {
		defer func() {
			if r := recover(); r == nil {
				t.Fatal("expected panic on bcrypt cost < 10")
			}
		}()
		_ = admin.BootstrapWith(db, "root", hashAt(t, "pw", 4))
	})
}

// TestBootstrap_1B_Idempotent covers review checklist invariant 1.B:
// "env 设了相同 login 重启 server → admins 表不重复插".
//
// Run BootstrapWith twice with the same login; admins row count must equal 1.
func TestBootstrap_1B_Idempotent(t *testing.T) {
	db := openMigratedDB(t)

	if err := admin.BootstrapWith(db, "root", hashAt(t, "secret", 10)); err != nil {
		t.Fatalf("first bootstrap: %v", err)
	}
	if err := admin.BootstrapWith(db, "root", hashAt(t, "secret", 10)); err != nil {
		t.Fatalf("second bootstrap: %v", err)
	}

	var n int64
	if err := db.Table("admins").Where("login = ?", "root").Count(&n).Error; err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 1 {
		t.Fatalf("admins WHERE login='root' count = %d, want 1 (idempotent)", n)
	}
}
