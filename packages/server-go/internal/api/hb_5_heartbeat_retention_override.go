// Package api — hb_5_heartbeat_retention_override.go: HB-5.2 admin-rail
// override endpoint POST /admin-api/v1/heartbeat-retention/override.
//
// Blueprint: agent-lifecycle.md §2.3 forward-only state log + AL-7 #533
// retention 模式延伸. Spec: docs/implementation/modules/hb-5-spec.md §1
// 拆段 HB-5.2 立场 ②③.
//
// Public surface:
//   - HB5HeartbeatRetentionHandler{Store, Logger}
//   - (h *HB5HeartbeatRetentionHandler) RegisterAdminRoutes(mux, adminMw)
//
// 反约束 (hb-5-spec.md §0 + 立场 ②③):
//   - admin-rail only — RegisterAdminRoutes 走 adminMw; user-rail 不挂.
//   - admin override 必写 admin_actions audit row (ADM-0 §1.3 红线);
//     action 复用 AL-7 既有 audit retention override action const
//     (auth.ActionAuditRetentionOverride 单源, 立场 ② 不挂第 13 项 enum).
//   - retention_days clamp 1..365 (复用 auth.RetentionMinDays /
//     RetentionMaxDays 跟 AL-7 同源).
//   - metadata.target='heartbeat' 字面区分 跟 AL-7 audit override
//     target='admin_actions' 二选一.
package api

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"borgee-server/internal/admin"
	"borgee-server/internal/auth"
	"borgee-server/internal/store"
)

// HB5HeartbeatRetentionHandler hosts the admin-rail POST endpoint that
// validates the proposed heartbeat retention window and writes one
// admin_actions audit row (reusing AL-7 既有 action; metadata.target=
// 'heartbeat' 二选一字面区分).
type HB5HeartbeatRetentionHandler struct {
	Store  *store.Store
	Logger *slog.Logger
}

// RegisterAdminRoutes wires the admin-rail endpoint behind adminMw.
// 立场 ③: admin-rail only.
func (h *HB5HeartbeatRetentionHandler) RegisterAdminRoutes(mux *http.ServeMux, adminMw func(http.Handler) http.Handler) {
	mux.Handle("POST /admin-api/v1/heartbeat-retention/override",
		adminMw(http.HandlerFunc(h.handleOverride)))
}

type hb5OverrideRequest struct {
	RetentionDays int    `json:"retention_days"`
	TargetUserID  string `json:"target_user_id"` // optional — defaults to "system"
}

// handleOverride — POST /admin-api/v1/heartbeat-retention/override.
//
// Validates retention_days ∈ [auth.RetentionMinDays, auth.
// RetentionMaxDays]; on pass writes one admin_actions row reusing AL-7
// 既有 ActionAuditRetentionOverride action const + metadata.target=
// 'heartbeat' 字面区分 (立场 ② 复用 enum 不漂).
func (h *HB5HeartbeatRetentionHandler) handleOverride(w http.ResponseWriter, r *http.Request) {
	a := admin.AdminFromContext(r.Context())
	if a == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	var req hb5OverrideRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	// 立场 ⑥ clamp 1..365 (复用 auth pkg const — AL-7 同源).
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
		"target":         auth.HeartbeatTargetLabel, // 立场 ② byte-identical
		"override_by":    a.ID,
	})
	if err != nil {
		if h.Logger != nil {
			h.Logger.Error("hb5.override marshal", "error", err)
		}
		writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	if _, err := h.Store.InsertAdminAction(
		a.ID, target, auth.ActionAuditRetentionOverride, string(meta),
	); err != nil {
		if h.Logger != nil {
			h.Logger.Error("hb5.override audit insert", "error", err)
		}
		writeJSONError(w, http.StatusInternalServerError, "Failed to write audit")
		return
	}
	writeJSONResponse(w, http.StatusOK, map[string]any{
		"retention_days": req.RetentionDays,
		"target":         auth.HeartbeatTargetLabel,
		"recorded":       true,
	})
}
