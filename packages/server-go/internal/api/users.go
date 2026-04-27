package api

import (
	"fmt"
	"log/slog"
	"net/http"

	"borgee-server/internal/auth"
	"borgee-server/internal/store"
)

// UserHandler handles user-related endpoints.
type UserHandler struct {
	Store  *store.Store
	Logger *slog.Logger
}

func (h *UserHandler) RegisterRoutes(mux *http.ServeMux, authMw func(http.Handler) http.Handler) {
	mux.Handle("GET /api/v1/me/permissions", authMw(http.HandlerFunc(h.handleMyPermissions)))
	mux.Handle("GET /api/v1/online", authMw(http.HandlerFunc(h.handleOnlineUsers)))
}

// GET /api/v1/me/permissions
func (h *UserHandler) handleMyPermissions(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var permissions []string
	var details []map[string]any

	// Both admin and member get wildcard permissions on user-side.
	// Admin permissions are handled separately via /admin-api/v1/*.
	if user.Role == "admin" || user.Role == "member" {
		permissions = []string{"*"}
		details = []map[string]any{{"id": 0, "permission": "*", "scope": "*", "granted_by": nil, "granted_at": 0}}
	} else {
		perms, err := h.Store.ListUserPermissions(user.ID)
		if err != nil {
			h.Logger.Error("failed to list permissions", "error", err)
			writeJSONError(w, http.StatusInternalServerError, "Internal server error")
			return
		}
		for _, p := range perms {
			permissions = append(permissions, fmt.Sprintf("%s:%s", p.Permission, p.Scope))
			details = append(details, map[string]any{
				"id":         p.ID,
				"permission": p.Permission,
				"scope":      p.Scope,
				"granted_by": p.GrantedBy,
				"granted_at": p.GrantedAt,
			})
		}
	}
	if details == nil {
		details = []map[string]any{}
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{
		"user_id":     user.ID,
		"role":        user.Role,
		"permissions": permissions,
		"details":     details,
	})
}

// GET /api/v1/online
func (h *UserHandler) handleOnlineUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.Store.GetOnlineUsers()
	if err != nil {
		h.Logger.Error("failed to get online users", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		return
	}

	userIDs := make([]string, len(users))
	for i, u := range users {
		userIDs[i] = u.ID
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{"user_ids": userIDs})
}

// sanitizeUserPublic returns a public-safe user representation.
func sanitizeUserPublic(u *store.User) map[string]any {
	m := map[string]any{
		"id":              u.ID,
		"display_name":    u.DisplayName,
		"role":            u.Role,
		"avatar_url":      u.AvatarURL,
		"require_mention": u.RequireMention,
		"created_at":      u.CreatedAt,
	}
	if u.OwnerID != nil {
		m["owner_id"] = *u.OwnerID
	}
	if u.LastSeenAt != nil {
		m["last_seen_at"] = *u.LastSeenAt
	}
	return m
}
