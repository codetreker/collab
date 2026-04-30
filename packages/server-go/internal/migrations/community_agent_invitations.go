package migrations

import "gorm.io/gorm"

// agentInvitations is migration v3 — Phase 2 / CM-4.0 schema landing.
//
// Blueprint: concept-model.md §4.2 跨 org 邀请 agent 进 channel.
//
// Default flow B (异步审批):
//   1. channel 成员触发邀请 → 写一行 agent_invitations(state='pending').
//   2. 系统给 agent owner 推 system message + 同意/拒绝按钮.
//   3. owner 同意 → state='approved'; 拒绝 → 'rejected'; 超时 → 'expired'.
//
// State machine: pending → {approved, rejected, expired}.
// 三个终态都不再转移 (状态机 helper 在 store.AgentInvitation 落) — 见
// internal/store/agent_invitation.go 状态机单测.
//
// Schema notes:
//   - state 用 TEXT enum + CHECK 约束。v0 直接 enum string；v1 切回时若需要可
//     拆 lookup 表 (state_id INT FK)。审计行见 docs/implementation/PROGRESS.md.
//   - 蓝图字段 decided_at 由 store helper 在 transition 时填，column 允许 NULL.
//   - expires_at 是计算 'expired' 转移的输入；storer 不在迁移层做后台 sweep.
//   - 索引覆盖最常见的查询：按 invitee owner 列待办 / 按 channel 反查活跃邀请.
//
// CM-4.0 严格边界:
//   - 仅落表 + 状态机 helper + 单测.
//   - 不写 HTTP handler / BPP frame / client UI / API — 留给 CM-4.1.
var agentInvitations = Migration{
	Version: 3,
	Name:    "cm_4_0_agent_invitations",
	Up: func(tx *gorm.DB) error {
		stmts := []string{
			`CREATE TABLE IF NOT EXISTS agent_invitations (
  id           TEXT PRIMARY KEY,
  channel_id   TEXT NOT NULL,
  agent_id     TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  state        TEXT NOT NULL DEFAULT 'pending'
                 CHECK (state IN ('pending','approved','rejected','expired')),
  created_at   INTEGER NOT NULL,
  decided_at   INTEGER,
  expires_at   INTEGER
)`,
			`CREATE INDEX IF NOT EXISTS idx_agent_invitations_agent_state
   ON agent_invitations(agent_id, state)`,
			`CREATE INDEX IF NOT EXISTS idx_agent_invitations_channel_state
   ON agent_invitations(channel_id, state)`,
			`CREATE INDEX IF NOT EXISTS idx_agent_invitations_requested_by
   ON agent_invitations(requested_by)`,
		}
		for _, s := range stmts {
			if err := tx.Exec(s).Error; err != nil {
				return err
			}
		}
		return nil
	},
}
