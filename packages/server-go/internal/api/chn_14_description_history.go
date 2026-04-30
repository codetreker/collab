// Package api — chn_14_description_history.go: CHN-14 GET description
// edit history endpoints + 0-server-prod 反向 grep守门 helper.
//
// Blueprint: channel-model.md §3 audit forward-only history. Spec:
// docs/implementation/modules/chn-14-spec.md (战马D v0). schema migration
// v=36 ALTER channels ADD description_edit_history TEXT NULL (跟 DM-7.1
// #558 + AL-7.1 + 跨七 milestone ALTER ADD nullable 同模式; CHN-14 第八处).
//
// Public surface:
//   - CHN14DescriptionHistoryHandler{Store, Logger}
//   - (h *CHN14DescriptionHistoryHandler) RegisterUserRoutes(mux, authMw)
//   - (h *CHN14DescriptionHistoryHandler) RegisterAdminRoutes(mux, adminMw)
//
// 反约束 (chn-14-spec.md §0):
//   - 立场 ③ owner-only — user-rail GET 反向断 caller == channel.CreatedBy
//     (member 403); admin readonly admin-rail GET (admin god-mode 不挂
//     PATCH/DELETE — ADM-0 §1.3 红线).
//   - 立场 ⑥ AST 锁链延伸第 22 处 forbidden 3 token 0 hit.
package api

import (
	"log/slog"
	"net/http"

	"borgee-server/internal/admin"
	"borgee-server/internal/auth"
	"borgee-server/internal/store"
)

// CHN14DescriptionHistoryHandler hosts the user-rail and admin-rail GET
// endpoints for channel description edit history. user-rail is owner-only;
// admin-rail is readonly only (no PATCH/DELETE — admin god-mode 不挂).
type CHN14DescriptionHistoryHandler struct {
	Store  *store.Store
	Logger *slog.Logger
}

// RegisterUserRoutes wires GET /api/v1/channels/{channelId}/description/history
// behind authMw. user-rail owner-only (立场 ② owner-only ACL 锁链第 21 处).
func (h *CHN14DescriptionHistoryHandler) RegisterUserRoutes(mux *http.ServeMux, authMw func(http.Handler) http.Handler) {
	mux.Handle("GET /api/v1/channels/{channelId}/description/history",
		authMw(http.HandlerFunc(h.handleUserGet)))
}

// RegisterAdminRoutes wires GET /admin-api/v1/channels/{channelId}/description/history
// behind adminMw. admin readonly — no PATCH/DELETE on this path (反向
// grep 守门; admin god-mode ADM-0 §1.3 红线 — admin 看不能改).
func (h *CHN14DescriptionHistoryHandler) RegisterAdminRoutes(mux *http.ServeMux, adminMw func(http.Handler) http.Handler) {
	mux.Handle("GET /admin-api/v1/channels/{channelId}/description/history",
		adminMw(http.HandlerFunc(h.handleAdminGet)))
}

// handleUserGet — GET /api/v1/channels/{channelId}/description/history.
//
// 立场 ②: caller ≠ channel.CreatedBy → 403 (member-level reject). 历史空时
// 返 `[]`. HappyPath 返 JSON array (server-side store 层 pre-normalized).
func (h *CHN14DescriptionHistoryHandler) handleUserGet(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	channelID := r.PathValue("channelId")
	ch, err := h.Store.GetChannelByID(channelID)
	if err != nil || ch == nil {
		writeJSONError(w, http.StatusNotFound, "Channel not found")
		return
	}
	// 立场 ② owner-only — channel.CreatedBy == user.ID 反向断 (CHN-10 #20
	// + DM-7 #19 owner-only ACL 锁链第 21 处一致).
	if ch.CreatedBy != user.ID {
		writeJSONError(w, http.StatusForbidden, "Only the channel owner can view edit history")
		return
	}
	history, err := h.Store.GetChannelDescriptionHistory(channelID)
	if err != nil {
		if h.Logger != nil {
			h.Logger.Error("chn14.history user", "error", err, "channel_id", channelID)
		}
		writeJSONError(w, http.StatusInternalServerError, "Failed to load history")
		return
	}
	writeJSONResponse(w, http.StatusOK, map[string]any{
		"history": history,
	})
}

// handleAdminGet — GET /admin-api/v1/channels/{channelId}/description/history.
//
// admin readonly. 立场 ② 反约束: 不挂 PATCH/DELETE (反向 grep 守门).
func (h *CHN14DescriptionHistoryHandler) handleAdminGet(w http.ResponseWriter, r *http.Request) {
	a := admin.AdminFromContext(r.Context())
	if a == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	channelID := r.PathValue("channelId")
	ch, err := h.Store.GetChannelByID(channelID)
	if err != nil || ch == nil {
		writeJSONError(w, http.StatusNotFound, "Channel not found")
		return
	}
	history, err := h.Store.GetChannelDescriptionHistory(channelID)
	if err != nil {
		if h.Logger != nil {
			h.Logger.Error("chn14.history admin", "error", err, "channel_id", channelID)
		}
		writeJSONError(w, http.StatusInternalServerError, "Failed to load history")
		return
	}
	writeJSONResponse(w, http.StatusOK, map[string]any{
		"history": history,
	})
}
