// Package api — al_7_audit_retention_override.go: AL-7.2 admin-rail
// override endpoint POST /admin-api/v1/audit-retention/override.
//
// Blueprint: admin-model.md ADM-0 §1.3 红线 (admin 操作必走 audit row).
// Spec: docs/implementation/modules/al-7-spec.md §1 拆段 AL-7.2 立场 ②③.
//
// Public surface:
//   - AL7AuditRetentionHandler{Store, Logger}
//   - (h *AL7AuditRetentionHandler) RegisterAdminRoutes(mux, adminMw)
//
// 反约束 (al-7-spec.md §0 + 立场 ②③):
//   - admin-rail only — RegisterAdminRoutes 走 adminMw (admin cookie middleware
//     必经); 反向 grep `audit_retention_override` 在 user-rail handler 0 hit.
//   - admin override 必写 admin_actions audit row (ADM-0 §1.3 红线 — admin
//     操作必留痕); action='audit_retention_override' 字面 (auth.
//     ActionAuditRetentionOverride const 单源, 跟 al_7_1 migration CHECK
//     12-tuple 同源).
//   - retention_days clamp 1..365 (RetentionMinDays..RetentionMaxDays);
//     0 / 负 / >365 reject 400 — 反 0 / 负 / 非数 / >365 reject (立场 ⑥).
package api

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"borgee-server/internal/admin"
	"borgee-server/internal/auth"
	"borgee-server/internal/store"
)

// AL7AuditRetentionHandler hosts the admin-rail POST endpoint that
// (a) clamps + validates the proposed retention window and (b) writes
// one admin_actions audit row so the override is visible in the existing
// /admin-api/v1/audit-log feed (no new endpoint, 立场 ① 不裂表).
type AL7AuditRetentionHandler struct {
	Store  *store.Store
	Logger *slog.Logger
}

// RegisterAdminRoutes wires the admin-rail endpoint behind adminMw.
// 立场 ③: admin-rail only. user-rail (`/api/v1/...`) 不挂 — 反向 grep
// 在 user-rail handler 0 hit (ADM2Handler.RegisterUserRoutes 不挂此 path).
func (h *AL7AuditRetentionHandler) RegisterAdminRoutes(mux *http.ServeMux, adminMw func(http.Handler) http.Handler) {
	mux.Handle("POST /admin-api/v1/audit-retention/override",
		adminMw(http.HandlerFunc(h.handleOverride)))
}

type al7OverrideRequest struct {
	RetentionDays int    `json:"retention_days"`
	TargetUserID  string `json:"target_user_id"` // optional — defaults to "system"
}

// handleOverride — POST /admin-api/v1/audit-retention/override.
//
// Validates retention_days ∈ [RetentionMinDays, RetentionMaxDays]; on
// pass writes one admin_actions row with action='audit_retention_
// override' (ADM-0 §1.3 红线). admin override is recorded as audit
// metadata; the live RetentionSweeper window remains the compile-time
// const RetentionDays (立场 ⑥ 字面单源 — runtime hot-mutate 留 v3, v0
// 仅留痕).
func (h *AL7AuditRetentionHandler) handleOverride(w http.ResponseWriter, r *http.Request) {
	a := admin.AdminFromContext(r.Context())
	if a == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	var req al7OverrideRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	// 立场 ⑥ clamp 1..365 — 反 0/负/非数/>365 reject. 0 = ZeroValue → reject
	// (Go decoder defaults missing field to 0 — admin 必显式填).
	if req.RetentionDays < auth.RetentionMinDays || req.RetentionDays > auth.RetentionMaxDays {
		writeJSONError(w, http.StatusBadRequest, "retention_days must be in [1, 365]")
		return
	}
	target := req.TargetUserID
	if target == "" {
		target = auth.SystemActorID
	}
	meta, err := json.Marshal(map[string]any{
		"retention_days": req.RetentionDays,
		"override_by":    a.ID,
	})
	if err != nil {
		if h.Logger != nil {
			h.Logger.Error("al7.override marshal", "error", err)
		}
		writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	if _, err := h.Store.InsertAdminAction(
		a.ID, target, auth.ActionAuditRetentionOverride, string(meta),
	); err != nil {
		if h.Logger != nil {
			h.Logger.Error("al7.override audit insert", "error", err)
		}
		writeJSONError(w, http.StatusInternalServerError, "Failed to write audit")
		return
	}
	writeJSONResponse(w, http.StatusOK, map[string]any{
		"retention_days": req.RetentionDays,
		"recorded":       true,
	})
}
