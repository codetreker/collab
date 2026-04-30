package migrations

import "gorm.io/gorm"

// organizations is migration v2 — Phase 1 / CM-1.1 schema landing.
//
// Blueprint: concept-model.md §1.1 + §2 — 1 person = 1 org, UI 永久不暴露;
// 数据层 org first-class.
//
// What this migration does:
//   - creates `organizations` table (id, name, created_at)
//   - adds `users.org_id TEXT NOT NULL DEFAULT ''` + idx_users_org_id
//   - adds `org_id` columns + indexes on the four "resource" tables that
//     CM-3 will populate at write time (channels, messages, workspace_files,
//     remote_nodes). Default '' is a v0 placeholder; CM-3 will start filling
//     real values, and v0 dev DBs are expected to be wiped (audit row in
//     docs/implementation/README.md, v0 debt table).
//
// v0 stance: NOT NULL DEFAULT '' is intentional — see audit row
// "users.org_id NOT NULL: 直接加列". v1 backfill is tracked separately
// (forward-only migration that flips defaults after a real backfill PR).
var organizations = Migration{
	Version: 2,
	Name:    "cm_1_1_organizations",
	Up: func(tx *gorm.DB) error {
		stmts := []string{
			`CREATE TABLE IF NOT EXISTS organizations (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`,
			`ALTER TABLE users           ADD COLUMN org_id TEXT NOT NULL DEFAULT ''`,
			`ALTER TABLE channels        ADD COLUMN org_id TEXT NOT NULL DEFAULT ''`,
			`ALTER TABLE messages        ADD COLUMN org_id TEXT NOT NULL DEFAULT ''`,
			`ALTER TABLE workspace_files ADD COLUMN org_id TEXT NOT NULL DEFAULT ''`,
			`ALTER TABLE remote_nodes    ADD COLUMN org_id TEXT NOT NULL DEFAULT ''`,
			`CREATE INDEX IF NOT EXISTS idx_users_org_id           ON users(org_id)`,
			`CREATE INDEX IF NOT EXISTS idx_channels_org_id        ON channels(org_id)`,
			`CREATE INDEX IF NOT EXISTS idx_messages_org_id        ON messages(org_id)`,
			`CREATE INDEX IF NOT EXISTS idx_workspace_files_org_id ON workspace_files(org_id)`,
			`CREATE INDEX IF NOT EXISTS idx_remote_nodes_org_id    ON remote_nodes(org_id)`,
		}
		for _, s := range stmts {
			if err := tx.Exec(s).Error; err != nil {
				return err
			}
		}
		return nil
	},
}
