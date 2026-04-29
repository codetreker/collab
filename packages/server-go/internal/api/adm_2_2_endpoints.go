// adm_2_2_endpoints.go — ADM-2.2 user-rail + admin-rail audit + impersonate
// REST endpoints. 跟 ADM-1 spec §2 wire 衔接.
//
// User-rail (走 authMw, /api/v1/me/*):
//   - GET  /api/v1/me/admin-actions          (立场 ④ 只见自己)
//   - GET  /api/v1/me/impersonation-grant    (业主端红横幅查询当前 grant 状态)
//   - POST /api/v1/me/impersonation-grant    (业主授权 24h, 立场 ⑦)
//   - DELETE /api/v1/me/impersonation-grant  (业主主动撤销)
//
// Admin-rail (走 adminMw, /admin-api/v1/audit-log):
//   - GET  /admin-api/v1/audit-log           (立场 ③ admin 互可见 + 三 filter)
//
// 反约束 (stance §1 立场 ④ + ADM2-NEG-005 反向 grep):
//   - 不开 GET /api/v1/audit-log (无 /me/) — 全站 audit log 不对全体 user
//     公开 (蓝图 §1.4 字面 "避免跨 org 隐私泄漏"); CI grep
//     `GET /api/v1/audit-log[^/]` count==0 锁
//   - user-rail GET 忽略 ?target_user_id 参数 (跨业主 inject 防线)
package api

import (
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"borgee-server/internal/admin"
	"borgee-server/internal/auth"
	"borgee-server/internal/store"
)

// ADM2Handler hosts both user-rail (audit list + impersonate CRUD) and
// admin-rail (audit-log) endpoints. We keep them in one struct because
// they share the Store backend; routing is split via separate Register*
// methods called from server.go with the respective middleware.
type ADM2Handler struct {
	Store  *store.Store
	Logger *slog.Logger
}

// RegisterUserRoutes wires the user-rail endpoints behind authMw (走
// borgee_token cookie / Bearer). 立场 ④ + ⑦.
func (h *ADM2Handler) RegisterUserRoutes(mux *http.ServeMux, authMw func(http.Handler) http.Handler) {
	mux.Handle("GET /api/v1/me/admin-actions", authMw(http.HandlerFunc(h.handleListMyAdminActions)))
	mux.Handle("GET /api/v1/me/impersonation-grant", authMw(http.HandlerFunc(h.handleGetMyImpersonateGrant)))
	mux.Handle("POST /api/v1/me/impersonation-grant", authMw(http.HandlerFunc(h.handleCreateMyImpersonateGrant)))
	mux.Handle("DELETE /api/v1/me/impersonation-grant", authMw(http.HandlerFunc(h.handleRevokeMyImpersonateGrant)))
}

// RegisterAdminRoutes wires the admin-rail audit log endpoint behind adminMw
// (走 borgee_admin_session cookie). 立场 ③.
func (h *ADM2Handler) RegisterAdminRoutes(mux *http.ServeMux, adminMw func(http.Handler) http.Handler) {
	mux.Handle("GET /admin-api/v1/audit-log", adminMw(http.HandlerFunc(h.handleAdminAuditLog)))
}

// handleListMyAdminActions — GET /api/v1/me/admin-actions.
//
// 立场 ④ user 只见自己: WHERE target_user_id = current_user_id.
// 反约束: ?target_user_id 参数 server 忽略 (跨业主 inject 防线 — 测试反向断言).
func (h *ADM2Handler) handleListMyAdminActions(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	limit := parseLimit(r, 50, 200)
	rows, err := h.Store.ListAdminActionsForTargetUser(user.ID, limit)
	if err != nil {
		h.Logger.Error("list admin_actions for user", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	out := make([]map[string]any, len(rows))
	for i, r := range rows {
		out[i] = sanitizeAdminAction(r, false /* admin_view */)
	}
	writeJSONResponse(w, http.StatusOK, map[string]any{"actions": out})
}

// handleAdminAuditLog — GET /admin-api/v1/audit-log.
//
// 立场 ③ admin 之间互可见: 默认无 WHERE; ?actor_id / ?action / ?target_user_id
// 三 filter 是 UI 收敛, 不是分桶. user cookie 走 admin-rail → admin.RequireAdmin
// middleware 已 401 (REG-ADM0-002 共享底线, 立场 ⑥ admin/user 二轨拆死).
func (h *ADM2Handler) handleAdminAuditLog(w http.ResponseWriter, r *http.Request) {
	a := admin.AdminFromContext(r.Context())
	if a == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	filters := store.AdminActionListFilters{
		ActorID:      r.URL.Query().Get("actor_id"),
		Action:       r.URL.Query().Get("action"),
		TargetUserID: r.URL.Query().Get("target_user_id"),
	}
	limit := parseLimit(r, 100, 500)
	rows, err := h.Store.ListAdminActionsForAdmin(filters, limit)
	if err != nil {
		h.Logger.Error("list admin_actions for admin", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	out := make([]map[string]any, len(rows))
	for i, r := range rows {
		out[i] = sanitizeAdminAction(r, true /* admin_view */)
	}
	writeJSONResponse(w, http.StatusOK, map[string]any{"actions": out})
}

// handleGetMyImpersonateGrant — GET /api/v1/me/impersonation-grant.
//
// Returns the user's currently active grant (or `null` body) — used by
// client BannerImpersonate.tsx to render the 24h red banner with countdown.
// 立场 ⑦ + content-lock §2.
func (h *ADM2Handler) handleGetMyImpersonateGrant(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	g, err := h.Store.ActiveImpersonationGrant(user.ID)
	if err != nil {
		h.Logger.Error("active impersonate grant", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	writeJSONResponse(w, http.StatusOK, map[string]any{
		"grant": sanitizeImpersonateGrant(g),
	})
}

// handleCreateMyImpersonateGrant — POST /api/v1/me/impersonation-grant.
//
// 蓝图 §3 字面 "由 user 创建" — 业主自己 grant. 24h 固定期限 (server 端,
// 立场 ⑦ 反约束: 不接受 client 传 expires_at). 重复 grant in-cooldown → 409.
func (h *ADM2Handler) handleCreateMyImpersonateGrant(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	g, err := h.Store.GrantImpersonation(user.ID)
	if err != nil {
		// store err is either grant_already_active (409) or db (500).
		if strings.Contains(err.Error(), "grant_already_active") {
			writeJSONError(w, http.StatusConflict, "impersonate.grant_already_active")
			return
		}
		h.Logger.Error("grant impersonate", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	writeJSONResponse(w, http.StatusCreated, map[string]any{
		"grant": sanitizeImpersonateGrant(g),
	})
}

// handleRevokeMyImpersonateGrant — DELETE /api/v1/me/impersonation-grant.
// 业主主动撤销; no-op if no active grant.
func (h *ADM2Handler) handleRevokeMyImpersonateGrant(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if err := h.Store.RevokeImpersonation(user.ID); err != nil {
		h.Logger.Error("revoke impersonate", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// sanitizeAdminAction renders an admin_actions row for JSON. adminView=true
// includes actor_id (admin-rail 互可见); adminView=false omits actor_id raw
// (user-rail 只见自己, 渲染走 client 端 lookup admin_username).
//
// 反约束 (stance §2 ADM2-NEG-001): 此函数不渲染 raw UUID 包装的"模板字面"
// (e.g. `{admin_id}`); body 渲染走 client RenderAdminActionDMBody (server
// 端 system DM 走 store helper RenderAdminActionDMBody).
func sanitizeAdminAction(row store.AdminAction, adminView bool) map[string]any {
	out := map[string]any{
		"id":             row.ID,
		"target_user_id": row.TargetUserID,
		"action":         row.Action,
		"metadata":       row.Metadata,
		"created_at":     row.CreatedAt,
	}
	if adminView {
		out["actor_id"] = row.ActorID
	}
	// user-rail 不返 actor_id raw — client 渲染时调 admin lookup endpoint
	// 把 UUID 翻成 admin_username (跟 system DM body 同源避免 UUID 漏出).
	return out
}

// sanitizeImpersonateGrant renders a grant for JSON, or null when nil.
// expires_at 是 Unix ms — client 走 setInterval(1000) 重算 remaining
// (跟 content-lock §2 红横幅 24h 倒计时 wire).
func sanitizeImpersonateGrant(g *store.ImpersonationGrant) map[string]any {
	if g == nil {
		return nil
	}
	out := map[string]any{
		"id":         g.ID,
		"user_id":    g.UserID,
		"granted_at": g.GrantedAt,
		"expires_at": g.ExpiresAt,
	}
	if g.RevokedAt != nil {
		out["revoked_at"] = *g.RevokedAt
	} else {
		out["revoked_at"] = nil
	}
	return out
}

// parseLimit reads ?limit= with sensible defaults + caps.
func parseLimit(r *http.Request, def, max int) int {
	q := r.URL.Query().Get("limit")
	if q == "" {
		return def
	}
	n, err := strconv.Atoi(q)
	if err != nil || n <= 0 {
		return def
	}
	if n > max {
		return max
	}
	return n
}
