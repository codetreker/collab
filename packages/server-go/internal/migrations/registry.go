package migrations

import "gorm.io/gorm"

// All is the canonical, ordered list of versioned migrations applied by the
// server on startup.
//
// Rules:
//   - Version is strictly increasing. Never reuse or renumber.
//   - Once a migration is on main, its body is immutable. To change schema,
//     append a new migration.
//   - Phase 0 / INFRA-1a ships with one "dummy" migration that proves the
//     framework end-to-end. Real Phase 1 schema (organizations, users.org_id,
//     ...) lands as version 2+.
var All = []Migration{
	{
		Version: 1,
		Name:    "infra_1a_dummy_marker",
		Up: func(tx *gorm.DB) error {
			// G0.1 acceptance: prove the engine can run a migration that
			// touches schema. Creating an inert marker table is enough to
			// demonstrate forward-only behavior end-to-end without polluting
			// the production schema. Subsequent migrations replace this with
			// real DDL.
			return tx.Exec(`CREATE TABLE IF NOT EXISTS _migrations_marker (
  version INTEGER PRIMARY KEY,
  note    TEXT
)`).Error
		},
	},
	cm11Organizations,
	cm40AgentInvitations,
}

// Default returns an Engine wired to db with All registered.
func Default(db *gorm.DB) *Engine {
	e := New(db)
	e.RegisterAll(All)
	return e
}
