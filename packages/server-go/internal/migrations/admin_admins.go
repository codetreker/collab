package migrations

import "gorm.io/gorm"

// admins is migration v4 — Phase 2 / ADM-0.1 schema landing.
//
// Blueprint: admin-model.md §1.2 + §3 — admin 走独立 `admins` 表,
// 永不出现在 users 表。R3 PR #188 + implementation R3 PR #189 锁定。
//
// What this migration does:
//   - creates `admins` table with strict 4-field schema:
//       id            TEXT PRIMARY KEY (UUID, NOT NULL)
//       login         TEXT NOT NULL UNIQUE
//       password_hash TEXT NOT NULL (bcrypt cost ≥ 10, set by bootstrap)
//       created_at    INTEGER NOT NULL (UnixMilli)
//
// Field invariants (ADM-0 review checklist §ADM-0.1 §1):
//   - NO org_id / role / is_admin / email columns. Admins are not in any
//     organization (admin-model §1.2: 无 promote, 与 user/org 模型完全分裂).
//   - login UNIQUE so bootstrap can re-run idempotently via INSERT OR IGNORE.
//
// Coexistence: ADM-0.1 keeps the legacy `users.role='admin'` path alive (双轨
// 并存); ADM-0.2 cuts the user-side path and ADM-0.3 backfills + drops the
// 'admin' enum value.
//
// v0 stance: forward-only, no Down(). Per migrations.go contract: "v0 is
// 'delete db and rebuild'; v1+ relies on backups."
var admins = Migration{
	Version: 4,
	Name:    "adm_0_1_admins",
	Up: func(tx *gorm.DB) error {
		stmts := []string{
			`CREATE TABLE IF NOT EXISTS admins (
  id            TEXT PRIMARY KEY,
  login         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
)`,
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_login ON admins(login)`,
		}
		for _, s := range stmts {
			if err := tx.Exec(s).Error; err != nil {
				return err
			}
		}
		return nil
	},
}
