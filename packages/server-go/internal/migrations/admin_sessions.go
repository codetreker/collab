package migrations

import "gorm.io/gorm"

// adminSessions is migration v5 — Phase 2 / ADM-0.2 schema landing.
//
// Blueprint: admin-model.md §1.2 + §3 — server-side admin session table so
// the cookie value is an opaque random token (not a raw admin id). Required
// by ADM-0 review checklist §ADM-0.2 §1: cookie value 现在是裸 admin ID,
// 必须换 server-side session 引用.
//
// What this migration does:
//   - creates `admin_sessions` table:
//       token       TEXT PRIMARY KEY (32-byte random hex, opaque)
//       admin_id    TEXT NOT NULL (FK → admins.id)
//       created_at  INTEGER NOT NULL (UnixMilli)
//       expires_at  INTEGER NOT NULL (UnixMilli)
//   - index on (admin_id) for revoke-all-by-admin lookups (logout, ADM-0.3
//     backfill 用来撤销旧 admin user 的会话).
//   - index on (expires_at) for sweep job (out of scope this PR).
//
// Field invariants (review checklist §ADM-0.2 §1):
//   - Token is opaque, never derived from admin_id; cookie value MUST be
//     fetched from this table, not parsed.
//   - No nullable fields; rows are deleted on logout / sweep, not soft-deleted.
//
// v0 stance: forward-only, no Down().
var adminSessions = Migration{
	Version: 5,
	Name:    "adm_0_2_admin_sessions",
	Up: func(tx *gorm.DB) error {
		stmts := []string{
			`CREATE TABLE IF NOT EXISTS admin_sessions (
  token       TEXT PRIMARY KEY,
  admin_id    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
)`,
			`CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id)`,
			`CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at)`,
		}
		for _, s := range stmts {
			if err := tx.Exec(s).Error; err != nil {
				return err
			}
		}
		return nil
	},
}
