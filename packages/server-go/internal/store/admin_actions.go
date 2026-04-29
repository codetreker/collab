// Package store — ADM-2.2 admin_actions audit + impersonate_grants helpers.
//
// Blueprint: docs/blueprint/admin-model.md §1.4 (谁能看到什么 + 三红线) +
// §2 不变量 (受影响者必感知 + Audit 100% 留痕 + 分层可见).
// Spec: docs/implementation/modules/adm-2-spec.md §2.
// Content lock: docs/qa/adm-2-content-lock.md §1 (5 system DM 模板).
//
// Public surface (跟 ADM-1 deferred 2 行兑现锚):
//   - InsertAdminAction(actorID, targetUserID, action, metadata) — 写一行 audit
//   - EmitAdminActionSystemDM(actorLogin, targetUserID, action, ts, ctx) — 受
//     影响者必收 system DM, body 字面 byte-identical 跟 content-lock §1
//   - ListAdminActionsForTargetUser(userID, limit) — user 侧 GET
//     /api/v1/me/admin-actions 走此 (WHERE target_user_id=)
//   - ListAdminActionsForAdmin(filters, limit) — admin 侧 GET
//     /admin-api/v1/audit-log 走此 (无 WHERE 默认全可见)
//
// 立场反查 (stance §1 7 立场):
//   ① 每写必留痕 — 此 helper 是写动作 wrap 后的唯一 audit 入口, 反向 grep
//      `skip_audit\|noAudit\|bypassAudit` count==0
//   ② 受影响者必感知 — EmitAdminActionSystemDM 强制下发, body 含 actorLogin
//      (admin.Login, admins 表) 非 raw UUID
//   ⑤ forward-only — InsertAdminAction 不返 row.ID for update; UPDATE/DELETE
//      路径不存在 (反向 grep `UPDATE admin_actions\|DELETE FROM admin_actions`
//      count==0 除 migration)
//   ⑥ admin ∉ 业务路径 — actorID 是 admins.id (独立表, 跟 ADM-0 红线对齐)
package store

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// AdminAction is one row of admin_actions table (ADM-2.1 schema v=22).
type AdminAction struct {
	ID           string `gorm:"column:id;primaryKey"`
	ActorID      string `gorm:"column:actor_id"`
	TargetUserID string `gorm:"column:target_user_id"`
	Action       string `gorm:"column:action"`
	Metadata     string `gorm:"column:metadata"`
	CreatedAt    int64  `gorm:"column:created_at"`
}

// TableName is required because gorm pluralizes by default — table name is
// `admin_actions` (matches migration v=22 字面).
func (AdminAction) TableName() string { return "admin_actions" }

// AdminActionListFilters narrows the admin-side audit log query.
// All fields optional. Empty string = no filter on that axis.
type AdminActionListFilters struct {
	ActorID      string
	Action       string
	TargetUserID string
}

// InsertAdminAction writes one audit row. action must be in the 5-字面
// whitelist (delete_channel / suspend_user / change_role / reset_password /
// start_impersonation) — schema CHECK enforces; this is just the insert.
//
// 立场 ⑤ forward-only: returns no update handle. Errors only on db.
func (s *Store) InsertAdminAction(actorID, targetUserID, action, metadata string) (string, error) {
	if actorID == "" || targetUserID == "" || action == "" {
		return "", errors.New("actor_id, target_user_id, action all required (蓝图 §1.4 红线 1 受影响者必有)")
	}
	row := AdminAction{
		ID:           uuid.NewString(),
		ActorID:      actorID,
		TargetUserID: targetUserID,
		Action:       action,
		Metadata:     metadata, // server-validated JSON, schema 不挂 CHECK
		CreatedAt:    time.Now().UnixMilli(),
	}
	if err := s.db.Create(&row).Error; err != nil {
		return "", err
	}
	return row.ID, nil
}

// ListAdminActionsForTargetUser returns the most recent admin_actions rows
// where target_user_id = userID. Used by GET /api/v1/me/admin-actions
// (user cookie). 立场 ④ user 只见自己.
//
// 反约束: this is the ONLY query path for user-side audit; ?target_user_id
// inject 防线在 handler 层忽略 (走 current user_id 不接受参数覆写).
func (s *Store) ListAdminActionsForTargetUser(userID string, limit int) ([]AdminAction, error) {
	if userID == "" {
		return nil, errors.New("user_id required")
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var rows []AdminAction
	err := s.db.Where("target_user_id = ?", userID).
		Order("created_at DESC").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}

// ListAdminActionsForAdmin returns the most recent admin_actions rows,
// optionally filtered. Used by GET /admin-api/v1/audit-log (admin cookie).
// 立场 ③ admin 之间互可见: 默认无 WHERE 全可见, filter 只是 UI 收敛.
func (s *Store) ListAdminActionsForAdmin(f AdminActionListFilters, limit int) ([]AdminAction, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	q := s.db.Model(&AdminAction{})
	if f.ActorID != "" {
		q = q.Where("actor_id = ?", f.ActorID)
	}
	if f.Action != "" {
		q = q.Where("action = ?", f.Action)
	}
	if f.TargetUserID != "" {
		q = q.Where("target_user_id = ?", f.TargetUserID)
	}
	var rows []AdminAction
	err := q.Order("created_at DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

// AdminActionDMContext carries the per-action substitution data for system
// DM body rendering (跟 content-lock §1 5 模板对齐).
type AdminActionDMContext struct {
	ChannelName string // for delete_channel: "#foo"
	Reason      string // for suspend_user
	OldRole     string // for change_role
	NewRole     string // for change_role
	ExpiresAt   int64  // for start_impersonation (Unix ms)
}

// RenderAdminActionDMBody returns the system DM body for the given action.
// 字面 byte-identical 跟 docs/qa/adm-2-content-lock.md §1 5 模板.
//
// 反约束 (stance §2 ADM2-NEG-001 + ADM2-NEG-009):
//   - actorLogin 必须是 admins.Login (具体名), 调用方传; 此函数不接受 admin
//     UUID, 反向 grep `\{admin_id\}|\{actor_id\}` 在 body literal count==0
//   - ts 走 time.Format("2006-01-02 15:04") 本地化; 不渲染 epoch ms 字面
func RenderAdminActionDMBody(actorLogin, action string, ts time.Time, ctx AdminActionDMContext) string {
	tsStr := ts.Format("2006-01-02 15:04")
	switch action {
	case "delete_channel":
		// "你的 channel #{channel_name} 被 admin {admin_username} 于 {ts} 删除。详情见设置页"隐私 → 影响记录"。"
		return fmt.Sprintf("你的 channel %s 被 admin %s 于 %s 删除。详情见设置页\"隐私 → 影响记录\"。", ctx.ChannelName, actorLogin, tsStr)
	case "suspend_user":
		reason := ctx.Reason
		if reason == "" {
			reason = "(未提供原因)"
		}
		return fmt.Sprintf("你的账号被 admin %s 于 %s 暂停: %s。详情见设置页\"隐私 → 影响记录\"。", actorLogin, tsStr, reason)
	case "change_role":
		return fmt.Sprintf("你的账号角色被 admin %s 于 %s 从 %s 调整为 %s。详情见设置页\"隐私 → 影响记录\"。", actorLogin, tsStr, ctx.OldRole, ctx.NewRole)
	case "reset_password":
		return fmt.Sprintf("你的登录密码被 admin %s 于 %s 重置, 请重新生成。详情见设置页\"隐私 → 影响记录\"。", actorLogin, tsStr)
	case "start_impersonation":
		expStr := time.UnixMilli(ctx.ExpiresAt).Format("2006-01-02 15:04")
		return fmt.Sprintf("admin %s 已对你的账号开启 24h impersonate, 起于 %s, 至 %s。可在设置页随时撤销。", actorLogin, tsStr, expStr)
	default:
		return ""
	}
}

// ImpersonationGrant is one row of impersonation_grants table (ADM-2.2).
//
// Schema (本 PR 同期落, 跟 ADM-2.1 admin_actions 共享 ADM-2 milestone — 新协议
// 一 milestone 一 PR):
//   id           TEXT PK (UUID)
//   user_id      TEXT NOT NULL (FK users.id 业主自己 grant)
//   granted_at   INTEGER NOT NULL (Unix ms)
//   expires_at   INTEGER NOT NULL (granted_at + 24h)
//   revoked_at   INTEGER NULL (业主主动撤销; NULL 表示有效)
type ImpersonationGrant struct {
	ID        string `gorm:"column:id;primaryKey"`
	UserID    string `gorm:"column:user_id"`
	GrantedAt int64  `gorm:"column:granted_at"`
	ExpiresAt int64  `gorm:"column:expires_at"`
	RevokedAt *int64 `gorm:"column:revoked_at"`
}

func (ImpersonationGrant) TableName() string { return "impersonation_grants" }

// GrantImpersonation creates a 24h grant. Returns 409-style error if a non-
// expired non-revoked grant already exists (业主 cooldown 防重复 grant).
//
// 立场 ⑦ impersonate 显眼: grant 期 24h 固定 (反约束: 不接受 client 传期限);
// 业主撤销走 RevokeImpersonation (UPDATE revoked_at 唯一允许的写, 不删行
// — 留 audit 痕跡, 跟立场 ⑤ forward-only 同精神).
func (s *Store) GrantImpersonation(userID string) (*ImpersonationGrant, error) {
	if userID == "" {
		return nil, errors.New("user_id required")
	}
	now := time.Now().UnixMilli()
	// Reject duplicate active grant (cooldown).
	var existing ImpersonationGrant
	err := s.db.Where("user_id = ? AND expires_at > ? AND revoked_at IS NULL", userID, now).
		First(&existing).Error
	if err == nil {
		return nil, errors.New("impersonate.grant_already_active")
	}
	g := &ImpersonationGrant{
		ID:        uuid.NewString(),
		UserID:    userID,
		GrantedAt: now,
		ExpiresAt: now + 24*60*60*1000, // 24h
	}
	if err := s.db.Create(g).Error; err != nil {
		return nil, err
	}
	return g, nil
}

// RevokeImpersonation marks the active grant for userID as revoked. No-op if
// no active grant.
func (s *Store) RevokeImpersonation(userID string) error {
	if userID == "" {
		return errors.New("user_id required")
	}
	now := time.Now().UnixMilli()
	return s.db.Model(&ImpersonationGrant{}).
		Where("user_id = ? AND expires_at > ? AND revoked_at IS NULL", userID, now).
		Update("revoked_at", now).Error
}

// ActiveImpersonationGrant returns the user's currently-active grant or nil.
// 立场 ⑦ admin 写动作前 server 校验 grant 存在: server-side gate, plug 入
// admin handler.
func (s *Store) ActiveImpersonationGrant(userID string) (*ImpersonationGrant, error) {
	if userID == "" {
		return nil, errors.New("user_id required")
	}
	now := time.Now().UnixMilli()
	var g ImpersonationGrant
	err := s.db.Where("user_id = ? AND expires_at > ? AND revoked_at IS NULL", userID, now).
		First(&g).Error
	if err != nil {
		return nil, nil // no active grant — caller treats as 403 if needed
	}
	return &g, nil
}
