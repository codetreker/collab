// Package migrations — guard_test.go: cover the "early-return when prerequisite
// table missing" branches that 7 forward-only migrations share. Each
// guard returns nil without touching schema (跟 Phase-6 partial-rollout
// 立场 — 不裂表, 不假装存在).
package migrations

import (
	"testing"

	"gorm.io/gorm"
)

// TestPrereqMissingMigrationsAreNoOp registers each guarded migration on a
// fresh DB without seeding its prerequisite table. Each Up MUST return
// nil and not record any side-effect schema. We assert the prerequisite
// table is still absent after Run.
func TestPrereqMissingMigrationsAreNoOp(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name      string
		migration Migration
		prereq    string // prerequisite table the migration guards on
	}{
		{"al_7_1", al71AdminActionsArchivedAt, "admin_actions"},
		{"bpp_8_1", bpp81AdminActionsPluginActions, "admin_actions"},
		{"hb_5_1", hb51AgentStateLogArchivedAt, "agent_state_log"},
		{"chn_14_1", chn141ChannelsDescriptionEditHistory, "channels"},
		{"ap_2_1", ap21UserPermissionsRevoked, "user_permissions"},
		{"adm_3_1", adm31AuditEventsRename, "audit_events"},
		{"dm_7_1", dm71MessagesEditHistory, "messages"},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			db := openMem(t)
			e := New(db)
			e.Register(tc.migration)
			if err := e.Run(0); err != nil {
				t.Fatalf("%s Run on empty DB returned err: %v", tc.name, err)
			}
			// Prerequisite never created → migration short-circuits but is
			// recorded as applied (engine commits the row even if Up was a no-op).
			if exists, err := tableExists(db, tc.prereq); err != nil {
				t.Fatalf("%s table check: %v", tc.name, err)
			} else if exists {
				t.Fatalf("%s should not have created prereq table %q", tc.name, tc.prereq)
			}
		})
	}
}

func tableExists(db *gorm.DB, name string) (bool, error) {
	var n int64
	if err := db.Raw(
		`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?`, name,
	).Row().Scan(&n); err != nil {
		return false, err
	}
	return n > 0, nil
}
