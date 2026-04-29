// Package auth — capabilities.go: AP-1 立场 ③ capability const 白名单
// (≤30, byte-identical 跟 spec §1 ③ + 蓝图 auth-permissions.md §1).
//
// 单源协议: 所有 endpoint authz 必须用本文件 const, 严禁 hardcode 字面
// permission name. 反约束 grep 锁:
//
//   git grep -nE 'HasCapability\("[a-z_]+"' packages/server-go/internal/api/
//   # 期望 0 hit (应改为 HasCapability(ctx, auth.CommitArtifact, scope))
//
// Spec锚: docs/implementation/modules/ap-1-spec.md §1 立场 ③ + §2 反约束 #1.
// 蓝图锚: docs/blueprint/auth-permissions.md §1 (ABAC + UI bundle 混合).
//
// admin god-mode capability 不在此白名单 — admin 走 /admin-api/* 单独
// middleware (admin.RequireAdmin), ADM-0 §1.3 红线 + spec §1 立场 ③ 字面.
package auth

// v1 capability 字面白名单 (spec §1 立场 ③ byte-identical).
//
// 改 = 改三处+: spec §1 ③ + 蓝图 auth-permissions.md §1 + acceptance
// `docs/qa/acceptance-templates/ap-1.md` §字面锁 + 此 const.
const (
	// channel scope (`*` / `channel:<id>`)
	ReadChannel   = "read_channel"
	WriteChannel  = "write_channel"
	DeleteChannel = "delete_channel"

	// artifact scope (`*` / `channel:<id>` / `artifact:<id>`)
	ReadArtifact     = "read_artifact"
	WriteArtifact    = "write_artifact"
	CommitArtifact   = "commit_artifact"
	IterateArtifact  = "iterate_artifact"
	RollbackArtifact = "rollback_artifact"

	// messaging
	MentionUser = "mention_user"
	ReadDM      = "read_dm"
	SendDM      = "send_dm"

	// channel admin (channel-scoped)
	ManageMembers = "manage_members"
	InviteUser    = "invite_user"
	ChangeRole    = "change_role"
)

// Capabilities is the canonical full list (membership lookup + future
// CI lint reflection). Reverse grep guards drift — adding a new
// capability MUST also add it here.
var Capabilities = map[string]bool{
	ReadChannel:      true,
	WriteChannel:     true,
	DeleteChannel:    true,
	ReadArtifact:     true,
	WriteArtifact:    true,
	CommitArtifact:   true,
	IterateArtifact:  true,
	RollbackArtifact: true,
	MentionUser:      true,
	ReadDM:           true,
	SendDM:           true,
	ManageMembers:    true,
	InviteUser:       true,
	ChangeRole:       true,
}
