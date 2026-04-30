package migrations

import "gorm.io/gorm"

// adm03UsersRoleCollapse is migration v=10 — Phase 2 / ADM-0.3 close-out.
//
// Blueprint: docs/implementation/modules/adm-0-review-checklist.md §ADM-0.3
// (line 115-149). admin-model.md §1.2: admins live exclusively in the
// `admins` table (ADM-0.1, v=4); ADM-0.2 cut the user-rail short-circuit;
// this migration deletes any leftover users.role='admin' rows so the
// user-rail enum collapses to {'member', 'agent'}.
//
// Version: 10
//   - 9 = CM-3 org_id backfill (#208)
//   - 10 = ADM-0.3 (this migration)
//
// What this migration does (顺序锁 — 飞马 #191 review checklist 红线 #2):
//   1. INSERT INTO admins (login, password_hash, ...) SELECT email, hash, ...
//      FROM users WHERE role='admin' ON CONFLICT(login) DO NOTHING.
//      Idempotent: re-runs are safe; existing admins (env bootstrap or
//      prior backfill) keep their row.
//   2. DELETE FROM sessions WHERE user_id IN (admin user ids) — vacuous
//      in v0 (user auth is stateless JWT, no sessions table). Gated on
//      hasTable() so future migrations that introduce a sessions table
//      get cleaned automatically.
//   3. DELETE FROM user_permissions WHERE user_id IN (admin user ids) —
//      cleans the (*, *) wildcard row testutil/server.go used to splice
//      in per ADM-0.2 (since RequirePermission lost the role short-circuit).
//      Without this, orphan permission rows would survive the user delete.
//   4. DELETE FROM users WHERE role='admin' — the actual collapse.
//
// Post-migration invariants (review checklist §2 — reverse 断言):
//   - 3.A: SELECT COUNT(*) FROM users WHERE role='admin' = 0
//   - 3.B: legacy admins land in admins table (login + bcrypt hash carried)
//   - 3.C: no orphan rows in user_permissions for deleted users
//   - 3.D: re-running the migration is a no-op (ON CONFLICT + WHERE filters)
//
// CHECK constraint note: the checklist asks for a literal
// `ALTER TABLE users ADD CONSTRAINT users_role_chk CHECK (role IN ('member','agent'))`
// but SQLite does not support ADD CONSTRAINT post-create. Enforcement is by
// data invariant (no admin row survives this migration) + the schema
// invariant test below; v1 hard-flip via CREATE TABLE … _new + RENAME is
// tracked separately (forward-only audit row).
//
// v0 stance: forward-only, no Down(). "delete db and rebuild" contract.
var adm03UsersRoleCollapse = Migration{
	Version: 10,
	Name:    "adm_0_3_users_role_collapse",
	Up: func(tx *gorm.DB) error {
		// Skip entirely if `users` table is absent (migration tests that
		// stand up trimmed schemas — same pattern as cm_3_org_id_backfill).
		usersExists, err := hasTable(tx, "users")
		if err != nil {
			return err
		}
		if !usersExists {
			return nil
		}

		// Step 1 — backfill into admins. login := users.email (admin-model
		// §1.2: admins.login is what the operator types at /admin-api/auth).
		// password_hash carries straight across (bcrypt cost ≥ 10 already).
		// id := lower-hex of randomblob(16) so re-applies don't collide.
		// created_at := strftime ms to match ADM-0.1's int64 ms scale.
		adminsExists, err := hasTable(tx, "admins")
		if err != nil {
			return err
		}
		// Only attempt the admins backfill when the source columns exist.
		// Trimmed migration-test schemas may register a bare users(id, role)
		// table; in that case we skip step 1 and proceed straight to the
		// collapse, which is still safe (admins table also won't exist for
		// those tests, and the data invariant holds either way).
		emailCol, err := hasColumn(tx, "users", "email")
		if err != nil {
			return err
		}
		hashCol, err := hasColumn(tx, "users", "password_hash")
		if err != nil {
			return err
		}
		if adminsExists && emailCol && hashCol {
			const insertAdmins = `
INSERT OR IGNORE INTO admins (id, login, password_hash, created_at)
SELECT lower(hex(randomblob(16))),
       u.email,
       u.password_hash,
       CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM users u
 WHERE u.role = 'admin'
   AND u.email IS NOT NULL
   AND u.email != ''
   AND u.password_hash IS NOT NULL
   AND u.password_hash != ''`
			if err := tx.Exec(insertAdmins).Error; err != nil {
				return err
			}
		}

		// Step 2 — revoke any user-rail sessions for admin users. v0 has no
		// `sessions` table (JWT is stateless), so this is a vacuous gate;
		// kept here so a future user-session table inherits the cleanup
		// without re-touching this migration (forward-only).
		sessionsExists, err := hasTable(tx, "sessions")
		if err != nil {
			return err
		}
		if sessionsExists {
			const deleteSessions = `
DELETE FROM sessions
 WHERE user_id IN (SELECT id FROM users WHERE role = 'admin')`
			if err := tx.Exec(deleteSessions).Error; err != nil {
				return err
			}
		}

		// Step 3 — drop user_permissions belonging to soon-to-be-deleted
		// admins. This is the ADM-0.2 wildcard `(*, *)` cleanup the team-lead
		// flagged: testutil seeded a (*, *) row for every Role:"admin"
		// fixture as a workaround when the role short-circuit was removed.
		// Post-collapse those rows would orphan (no FK in user_permissions),
		// so we sweep them now.
		permsExists, err := hasTable(tx, "user_permissions")
		if err != nil {
			return err
		}
		if permsExists {
			const deletePerms = `
DELETE FROM user_permissions
 WHERE user_id IN (SELECT id FROM users WHERE role = 'admin')`
			if err := tx.Exec(deletePerms).Error; err != nil {
				return err
			}
		}

		// Step 4 — the collapse itself. After this, users.role ∈ {'member',
		// 'agent'} as data invariant (CHECK enforcement deferred — see
		// migration doc comment).
		const deleteAdminUsers = `DELETE FROM users WHERE role = 'admin'`
		if err := tx.Exec(deleteAdminUsers).Error; err != nil {
			return err
		}

		return nil
	},
}

// hasTable reports whether a table named `name` exists in the SQLite schema.
// Mirrors hasColumn (cm_3_org_id_backfill.go) — the migration framework
// targets SQLite per concept-model §data, so PRAGMA-style introspection is
// the cheapest gate for tolerating trimmed test schemas.
func hasTable(tx *gorm.DB, name string) (bool, error) {
	var n int64
	row := tx.Raw(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name = ?`, name).Row()
	if err := row.Scan(&n); err != nil {
		return false, err
	}
	return n > 0, nil
}
