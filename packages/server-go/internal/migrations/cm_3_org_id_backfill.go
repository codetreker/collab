package migrations

import "gorm.io/gorm"

// cm3OrgIDBackfill is migration v9 — CM-3 / Phase 1 close-out.
//
// Blueprint: docs/qa/cm-3-resource-ownership-checklist.md (#200, 野马).
// Scope: 4 resource tables (channels, messages, workspace_files, remote_nodes).
// `agents` are users with role='agent' and inherit users.org_id from CM-1.1
// (v=2). `user_settings` is explicitly out of scope per #200 §1 row ⑤.
//
// What this migration does:
//   - cm_1_1_organizations (v=2) already added the org_id columns + indexes.
//     v=9 only backfills legacy rows: any row whose org_id is still '' takes
//     the org_id of its creator/sender/uploader.
//   - For channels: org_id <- users.org_id WHERE users.id = created_by
//   - For messages: org_id <- users.org_id WHERE users.id = sender_id
//   - For workspace_files / remote_nodes: same pattern via user_id
//
// Idempotent + tolerant: each per-table backfill is gated on whether the
// table AND its foreign-key column exist, so older migration tests that
// stand up trimmed schemas don't blow up. The forward-only contract is
// preserved (we never drop or rewrite anything; if the table is absent
// there is nothing to backfill).
//
// v0 stance: legacy dev DBs may still have rows where the creator user has
// org_id='' (pre-CM-1.2). Those stay '' here; CrossOrg(actor, '') is
// permissive (returns false) so unstamped rows fall through to existing
// membership/owner checks. v1 hard-flips the column NOT NULL (no default ''),
// gated on a real backfill PR.
var cm3OrgIDBackfill = Migration{
	Version: 9,
	Name:    "cm_3_org_id_backfill",
	Up: func(tx *gorm.DB) error {
		type backfill struct {
			table  string
			fk     string // column on the resource row that points at users.id
			update string
		}
		jobs := []backfill{
			{"channels", "created_by", `UPDATE channels SET org_id = (
			  SELECT u.org_id FROM users u WHERE u.id = channels.created_by
			) WHERE (org_id IS NULL OR org_id = '')
			  AND created_by IS NOT NULL
			  AND EXISTS (SELECT 1 FROM users u WHERE u.id = channels.created_by AND u.org_id != '')`},
			{"messages", "sender_id", `UPDATE messages SET org_id = (
			  SELECT u.org_id FROM users u WHERE u.id = messages.sender_id
			) WHERE (org_id IS NULL OR org_id = '')
			  AND sender_id IS NOT NULL
			  AND EXISTS (SELECT 1 FROM users u WHERE u.id = messages.sender_id AND u.org_id != '')`},
			{"workspace_files", "user_id", `UPDATE workspace_files SET org_id = (
			  SELECT u.org_id FROM users u WHERE u.id = workspace_files.user_id
			) WHERE (org_id IS NULL OR org_id = '')
			  AND user_id IS NOT NULL
			  AND EXISTS (SELECT 1 FROM users u WHERE u.id = workspace_files.user_id AND u.org_id != '')`},
			{"remote_nodes", "user_id", `UPDATE remote_nodes SET org_id = (
			  SELECT u.org_id FROM users u WHERE u.id = remote_nodes.user_id
			) WHERE (org_id IS NULL OR org_id = '')
			  AND user_id IS NOT NULL
			  AND EXISTS (SELECT 1 FROM users u WHERE u.id = remote_nodes.user_id AND u.org_id != '')`},
		}
		for _, j := range jobs {
			ok, err := hasColumn(tx, j.table, "org_id")
			if err != nil || !ok {
				continue
			}
			fkOk, err := hasColumn(tx, j.table, j.fk)
			if err != nil || !fkOk {
				continue
			}
			if err := tx.Exec(j.update).Error; err != nil {
				return err
			}
		}
		return nil
	},
}

// hasColumn returns true if the given table exists and has the named column.
// SQLite-specific (PRAGMA table_info); migrations target SQLite per the
// project's data-layer choice (concept-model §data).
func hasColumn(tx *gorm.DB, table, col string) (bool, error) {
	rows, err := tx.Raw(`PRAGMA table_info(` + table + `)`).Rows()
	if err != nil {
		return false, err
	}
	defer rows.Close()
	for rows.Next() {
		var (
			cid       int
			name      string
			ctype     string
			notnull   int
			dfltValue any
			pk        int
		)
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dfltValue, &pk); err != nil {
			return false, err
		}
		if name == col {
			return true, nil
		}
	}
	return false, nil
}
