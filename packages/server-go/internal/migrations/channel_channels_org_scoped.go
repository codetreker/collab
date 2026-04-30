package migrations

import (
	"fmt"
	"strings"

	"gorm.io/gorm"
)

// channelsOrgScoped is migration v=11 — Phase 3 / CHN-1.1.
//
// Blueprint: channel-model.md §1.1 Channel = 协作场 + §2 关键不变量
// (Channel 跨 org 共享 / Channel 创建者归属). concept-model.md §1.2
// (agent = 同事) 落到 `channel_members.silent`: agent 加入 channel
// 默认沉默, owner 显式触发后才发言。
//
// Phase 3 第一波 PR 拆分文档 (#265 merged): CHN-1.1 acceptance =
// 数据契约 (跨 org 同名合法 / 同 org 同名拒) + drift (历史 dup-name
// 硬停, 不自动 rename) + agent silent backfill.
//
// What this migration does:
//   1. Pre-flight 检测 (org_id, name) 历史 dup → 硬停 + 报 row 列出,
//      不自动 rename (CHN-1.1 spec)。v0 dev DB 全局 UNIQUE(name)
//      理论阻止 dup, 但防 dogfood DB 错位预先 sweep。
//   2. channels: drop 旧 inline UNIQUE(name) 通过 rebuild
//      (SQLite 不支持 DROP CONSTRAINT — 走 CREATE _new + COPY +
//      DROP + RENAME). 同步加 archived_at INTEGER NULL (蓝图反约束:
//      archive 不删)。
//   3. CREATE UNIQUE INDEX idx_channels_org_id_name ON channels(org_id,
//      name) WHERE deleted_at IS NULL (软删行不占名).
//   4. channel_members: ADD silent INTEGER NOT NULL DEFAULT 0 +
//      ADD org_id_at_join TEXT NOT NULL DEFAULT ''.
//   5. backfill: silent=1 WHERE user_id 是 agent (users.role='agent');
//      org_id_at_join = users.org_id (snapshot, audit).
//   6. CREATE INDEX idx_channel_members_org_at_join.
//
// v0 stance: forward-only, no Down(). Trimmed-schema tolerance via
// hasTable / hasColumn guards (mirrors cm_3 + cm_onboarding patterns).
var channelsOrgScoped = Migration{
	Version: 11,
	Name:    "chn_1_1_channels_org_scoped",
	Up: func(tx *gorm.DB) error {
		channelsExists, err := hasTable(tx, "channels")
		if err != nil {
			return err
		}
		if !channelsExists {
			return nil
		}

		// Channels rebuild path — only when both `name` and `org_id`
		// columns are present (real schema after createSchema + CM-1.1).
		// Trimmed test scaffolds (channels(id) only) skip directly to
		// channel_members extensions.
		hasName, err := hasColumn(tx, "channels", "name")
		if err != nil {
			return err
		}
		hasOrgID, err := hasColumn(tx, "channels", "org_id")
		if err != nil {
			return err
		}
		if hasName && hasOrgID {
			// Step 1 — pre-flight dup detection (cross-org name pairs).
			// Hard-fail with row ids; manual audit required.
			var dups []struct {
				OrgID string `gorm:"column:org_id"`
				Name  string `gorm:"column:name"`
				Cnt   int64  `gorm:"column:cnt"`
			}
			if err := tx.Raw(`
				SELECT org_id, name, COUNT(*) AS cnt
				  FROM channels
				 GROUP BY org_id, name
				HAVING cnt > 1
			`).Scan(&dups).Error; err != nil {
				return err
			}
			if len(dups) > 0 {
				return fmt.Errorf(
					"chn_1_1: %d (org_id, name) duplicate group(s) detected — manual audit required, no auto-rename: %+v",
					len(dups), dups,
				)
			}

			// Step 2 — add archived_at before rebuild so the new schema
			// includes it (PRAGMA-driven copy preserves whatever exists).
			hasArchived, err := hasColumn(tx, "channels", "archived_at")
			if err != nil {
				return err
			}
			if !hasArchived {
				if err := tx.Exec(`ALTER TABLE channels ADD COLUMN archived_at INTEGER`).Error; err != nil {
					return err
				}
			}

			// Step 2 cont. — rebuild channels without inline UNIQUE(name).
			if err := rebuildChannelsDropNameUnique(tx); err != nil {
				return err
			}

			// Step 3 — per-org name UNIQUE; soft-deleted rows excluded so
			// rename-by-tombstone-then-recreate stays viable.
			if err := tx.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_channels_org_id_name
				ON channels(org_id, name) WHERE deleted_at IS NULL`).Error; err != nil {
				return err
			}
		}

		// Step 4 — channel_members extensions. Tolerant of absent table.
		cmExists, err := hasTable(tx, "channel_members")
		if err != nil {
			return err
		}
		if !cmExists {
			return nil
		}
		hasSilent, err := hasColumn(tx, "channel_members", "silent")
		if err != nil {
			return err
		}
		if !hasSilent {
			if err := tx.Exec(`ALTER TABLE channel_members ADD COLUMN silent INTEGER NOT NULL DEFAULT 0`).Error; err != nil {
				return err
			}
		}
		hasOJ, err := hasColumn(tx, "channel_members", "org_id_at_join")
		if err != nil {
			return err
		}
		if !hasOJ {
			if err := tx.Exec(`ALTER TABLE channel_members ADD COLUMN org_id_at_join TEXT NOT NULL DEFAULT ''`).Error; err != nil {
				return err
			}
		}

		// Step 5 — backfill silent=1 for agent rows + org_id_at_join
		// snapshot from users.org_id. Gated on users columns existing.
		usersOK, err := hasTable(tx, "users")
		if err != nil {
			return err
		}
		if usersOK {
			if roleOK, _ := hasColumn(tx, "users", "role"); roleOK {
				if err := tx.Exec(`
					UPDATE channel_members
					   SET silent = 1
					 WHERE user_id IN (SELECT id FROM users WHERE role = 'agent')
				`).Error; err != nil {
					return err
				}
			}
			if orgOK, _ := hasColumn(tx, "users", "org_id"); orgOK {
				if err := tx.Exec(`
					UPDATE channel_members
					   SET org_id_at_join = COALESCE(
					       (SELECT org_id FROM users WHERE users.id = channel_members.user_id),
					       ''
					   )
					 WHERE org_id_at_join = ''
				`).Error; err != nil {
					return err
				}
			}
		}

		// Step 6 — audit-query index.
		if err := tx.Exec(`CREATE INDEX IF NOT EXISTS idx_channel_members_org_at_join
			ON channel_members(org_id_at_join)`).Error; err != nil {
			return err
		}
		return nil
	},
}

// rebuildChannelsDropNameUnique materializes `channels_new` without the
// inline UNIQUE on `name`, copies all rows, drops the old table, and
// renames. Standard SQLite recipe for dropping an inline column
// constraint ("Making Other Kinds of Table Schema Changes" §7).
//
// User indexes (idx_channels_org_id, idx_channels_position,
// idx_channels_group) are captured + reapplied; the implicit autoindex
// from the dropped UNIQUE is intentionally not recreated.
func rebuildChannelsDropNameUnique(tx *gorm.DB) error {
	// Capture column declarations (ordered by cid).
	var cols []struct {
		CID     int     `gorm:"column:cid"`
		Name    string  `gorm:"column:name"`
		Type    string  `gorm:"column:type"`
		NotNull int     `gorm:"column:notnull"`
		Dflt    *string `gorm:"column:dflt_value"`
		PK      int     `gorm:"column:pk"`
	}
	if err := tx.Raw(`PRAGMA table_info(channels)`).Scan(&cols).Error; err != nil {
		return err
	}
	if len(cols) == 0 {
		return nil
	}

	// Capture user-defined indexes (sql IS NOT NULL excludes autoindexes).
	var idxs []struct {
		Name string `gorm:"column:name"`
		SQL  string `gorm:"column:sql"`
	}
	if err := tx.Raw(`SELECT name, sql FROM sqlite_master
		WHERE type='index' AND tbl_name='channels' AND sql IS NOT NULL`).Scan(&idxs).Error; err != nil {
		return err
	}

	defs := make([]string, 0, len(cols))
	names := make([]string, 0, len(cols))
	for _, c := range cols {
		piece := fmt.Sprintf(`"%s" %s`, c.Name, c.Type)
		if c.PK == 1 {
			piece += " PRIMARY KEY"
		}
		if c.NotNull == 1 && c.PK == 0 {
			piece += " NOT NULL"
		}
		if c.Dflt != nil {
			piece += " DEFAULT " + *c.Dflt
		}
		defs = append(defs, piece)
		names = append(names, fmt.Sprintf(`"%s"`, c.Name))
	}
	colList := strings.Join(names, ", ")
	createSQL := fmt.Sprintf(`CREATE TABLE channels_new (%s)`, strings.Join(defs, ", "))
	if err := tx.Exec(createSQL).Error; err != nil {
		return err
	}
	if err := tx.Exec(fmt.Sprintf(
		`INSERT INTO channels_new (%s) SELECT %s FROM channels`, colList, colList,
	)).Error; err != nil {
		return err
	}
	if err := tx.Exec(`DROP TABLE channels`).Error; err != nil {
		return err
	}
	if err := tx.Exec(`ALTER TABLE channels_new RENAME TO channels`).Error; err != nil {
		return err
	}
	// Reapply user indexes (idx_channels_org_id, idx_channels_position, etc.).
	// Each captured `sql` is the original CREATE INDEX statement.
	for _, idx := range idxs {
		if idx.SQL == "" {
			continue
		}
		if err := tx.Exec(idx.SQL).Error; err != nil {
			return fmt.Errorf("reapply index %s: %w", idx.Name, err)
		}
	}
	return nil
}
