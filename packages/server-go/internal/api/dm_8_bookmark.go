// Package api — dm_8_bookmark.go: DM-8.2 server endpoints for message
// bookmark (per-user owner-only).
//
// Spec: docs/implementation/modules/dm-8-spec.md §1 拆段 DM-8.2.
// Acceptance: docs/qa/acceptance-templates/dm-8.md §AL-9.2.
// Stance: docs/qa/dm-8-stance-checklist.md 立场 ②+③+⑤.
//
// Endpoints (all user-rail, owner-only ACL — 立场 ③):
//
//	POST   /api/v1/messages/{messageID}/bookmark   (toggle on)
//	DELETE /api/v1/messages/{messageID}/bookmark   (toggle off)
//	GET    /api/v1/me/bookmarks                    (list my bookmarks)
//
// admin-rail 0 endpoint — 反向 grep `admin-api.*bookmark` count==0.
// Per-user view 不漏 cross-user UUID — handler returns
// `is_bookmarked` bool only, never raw `bookmarked_by` array (立场 ⑤).
package api

import (
	"log/slog"
	"net/http"
	"strconv"

	"borgee-server/internal/auth"
	"borgee-server/internal/store"
)

// 5 错码字面单源 (跟 CV-6 SearchErrCode / AL-9 AuditErrCode / AP-1/AP-2/
// AP-3/CV-2 v2/CV-3 v2 const 同模式). 改 = 改三处: server const + client
// BOOKMARK_ERR_TOAST + content-lock §3. CI 等价单测守 future drift.
const (
	BookmarkErrCodeNotFound        = "bookmark.not_found"
	BookmarkErrCodeNotMember       = "bookmark.not_member"
	BookmarkErrCodeNotOwner        = "bookmark.not_owner"
	BookmarkErrCodeCrossOrgDenied  = "bookmark.cross_org_denied"
	BookmarkErrCodeInvalidRequest  = "bookmark.invalid_request"
)

// BookmarkListDefault / BookmarkListMax — list endpoint clamp values.
const (
	BookmarkListDefault = 50
	BookmarkListMax     = 200
)

// DM8BookmarkHandler hosts the 3 bookmark endpoints (POST/DELETE/GET).
type DM8BookmarkHandler struct {
	Store  *store.Store
	Logger *slog.Logger
}

// RegisterRoutes wires the user-rail bookmark endpoints behind authMw.
// admin-rail intentionally NOT wired — bookmark is per-user private
// state (ADM-0 §1.3 + ADM-1 §4.1 隐私承诺第 4 行 byte-identical 同源).
func (h *DM8BookmarkHandler) RegisterRoutes(mux *http.ServeMux, authMw func(http.Handler) http.Handler) {
	mux.Handle("POST /api/v1/messages/{messageID}/bookmark", authMw(http.HandlerFunc(h.handleAdd)))
	mux.Handle("DELETE /api/v1/messages/{messageID}/bookmark", authMw(http.HandlerFunc(h.handleRemove)))
	mux.Handle("GET /api/v1/me/bookmarks", authMw(http.HandlerFunc(h.handleListMine)))
}

// handleAdd — POST /api/v1/messages/{messageID}/bookmark.
// Returns 200 {is_bookmarked: true, message_id: "..."} on add or no-op.
func (h *DM8BookmarkHandler) handleAdd(w http.ResponseWriter, r *http.Request) {
	h.handleToggle(w, r, true)
}

// handleRemove — DELETE /api/v1/messages/{messageID}/bookmark.
// Returns 200 {is_bookmarked: false, message_id: "..."} on remove or no-op.
func (h *DM8BookmarkHandler) handleRemove(w http.ResponseWriter, r *http.Request) {
	h.handleToggle(w, r, false)
}

// handleToggle is the shared add/remove path. wantAdd is the caller's
// intent (POST=true, DELETE=false). The store helper performs an atomic
// RMW; if the resulting state already matches the intent (e.g. POST when
// already bookmarked), we surface an idempotent 200 with the current
// state (no error).
func (h *DM8BookmarkHandler) handleToggle(w http.ResponseWriter, r *http.Request, wantAdd bool) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	messageID := r.PathValue("messageID")
	if messageID == "" {
		writeJSONError(w, http.StatusBadRequest, BookmarkErrCodeInvalidRequest)
		return
	}

	// Lookup message to validate existence + channel membership ACL.
	msg, err := h.Store.GetMessageByID(messageID)
	if err != nil || msg == nil {
		writeJSONError(w, http.StatusNotFound, BookmarkErrCodeNotFound)
		return
	}
	// 立场 ③ owner-only ACL — channel.member required (cross-org走 HasCapability
	// AP-3 自动 enforce 通过 IsChannelMember 路径).
	if !h.Store.IsChannelMember(msg.ChannelID, user.ID) {
		writeJSONError(w, http.StatusForbidden, BookmarkErrCodeNotMember)
		return
	}

	// Probe current state to make POST/DELETE idempotent (toggle store
	// would flip every time; we want POST=add-or-noop, DELETE=remove-or-noop).
	already, err := h.Store.IsMessageBookmarkedByUser(messageID, user.ID)
	if err != nil {
		h.Logger.Error("bookmark probe", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	if already == wantAdd {
		// Already in desired state — no-op idempotent response.
		writeJSONResponse(w, http.StatusOK, map[string]any{
			"message_id":    messageID,
			"is_bookmarked": wantAdd,
		})
		return
	}

	// Flip exactly once via the atomic RMW seam.
	added, err := h.Store.ToggleMessageBookmark(messageID, user.ID)
	if err != nil {
		h.Logger.Error("bookmark toggle", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	writeJSONResponse(w, http.StatusOK, map[string]any{
		"message_id":    messageID,
		"is_bookmarked": added,
	})
}

// handleListMine — GET /api/v1/me/bookmarks. Returns the current user's
// bookmarked messages, ordered by message created_at DESC, capped at
// limit (default 50, max 200).
//
// 立场 ⑤ — sanitize 不暴露 raw bookmarked_by JSON array; client gets
// per-message {id, channel_id, sender_id, content, content_type,
// created_at} 加 is_bookmarked: true (永远 true 在此列表).
func (h *DM8BookmarkHandler) handleListMine(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	limit := BookmarkListDefault
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			if n > BookmarkListMax {
				n = BookmarkListMax
			}
			limit = n
		}
	}
	rows, err := h.Store.ListMessagesBookmarkedByUser(user.ID, limit)
	if err != nil {
		h.Logger.Error("bookmark list", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for _, m := range rows {
		out = append(out, map[string]any{
			"id":            m.ID,
			"channel_id":    m.ChannelID,
			"sender_id":     m.SenderID,
			"content":       m.Content,
			"content_type":  m.ContentType,
			"created_at":    m.CreatedAt,
			"is_bookmarked": true,
			// 立场 ⑤ — bookmarked_by raw 不返 (只在自己 list 里就是 true).
		})
	}
	writeJSONResponse(w, http.StatusOK, map[string]any{
		"bookmarks": out,
	})
}
