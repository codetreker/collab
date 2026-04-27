package api

import (
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"time"

	"borgee-server/internal/auth"
	"borgee-server/internal/store"

	"golang.org/x/crypto/bcrypt"
)

type AdminHandler struct {
	Store  *store.Store
	Logger *slog.Logger
}

func (h *AdminHandler) RegisterRoutes(mux *http.ServeMux, authMw func(http.Handler) http.Handler) {
	wrap := func(f http.HandlerFunc) http.Handler { return authMw(http.HandlerFunc(f)) }
	h.registerRoutes(mux, "/admin-api/v1", wrap)
}

func (h *AdminHandler) RegisterAppRoutes(mux *http.ServeMux, authMw func(http.Handler) http.Handler) {
	wrap := func(f http.HandlerFunc) http.Handler {
		return authMw(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := auth.UserFromContext(r.Context())
			if user == nil {
				writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
				return
			}
			if user.Role != "admin" {
				writeJSONError(w, http.StatusForbidden, "Forbidden")
				return
			}
			f(w, r)
		}))
	}
	h.registerRoutes(mux, "/api/v1/admin", wrap)
}

func (h *AdminHandler) registerRoutes(mux *http.ServeMux, prefix string, wrap func(http.HandlerFunc) http.Handler) {
	mux.Handle("GET "+prefix+"/stats", wrap(h.handleStats))
	mux.Handle("GET "+prefix+"/users", wrap(h.handleListUsers))
	mux.Handle("POST "+prefix+"/users", wrap(h.handleCreateUser))
	mux.Handle("PATCH "+prefix+"/users/{id}", wrap(h.handleUpdateUser))
	mux.Handle("DELETE "+prefix+"/users/{id}", wrap(h.handleDeleteUser))
	mux.Handle("GET "+prefix+"/users/{id}/agents", wrap(h.handleListUserAgents))
	mux.Handle("POST "+prefix+"/users/{id}/api-key", wrap(h.handleGenerateAPIKey))
	mux.Handle("DELETE "+prefix+"/users/{id}/api-key", wrap(h.handleDeleteAPIKey))
	mux.Handle("GET "+prefix+"/users/{id}/permissions", wrap(h.handleGetPermissions))
	mux.Handle("POST "+prefix+"/users/{id}/permissions", wrap(h.handleGrantPermission))
	mux.Handle("DELETE "+prefix+"/users/{id}/permissions", wrap(h.handleRevokePermission))
	mux.Handle("POST "+prefix+"/invites", wrap(h.handleCreateInvite))
	mux.Handle("GET "+prefix+"/invites", wrap(h.handleListInvites))
	mux.Handle("DELETE "+prefix+"/invites/{code}", wrap(h.handleDeleteInvite))
	mux.Handle("GET "+prefix+"/channels", wrap(h.handleListChannels))
	mux.Handle("DELETE "+prefix+"/channels/{id}/force", wrap(h.handleForceDeleteChannel))
}

func (h *AdminHandler) handleStats(w http.ResponseWriter, r *http.Request) {
	var userCount int64
	if err := h.Store.DB().Model(&store.User{}).Where("deleted_at IS NULL").Count(&userCount).Error; err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to count users")
		return
	}

	var channelCount int64
	if err := h.Store.DB().Model(&store.Channel{}).Where("deleted_at IS NULL").Count(&channelCount).Error; err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to count channels")
		return
	}

	online, err := h.Store.GetOnlineUsers()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to count online users")
		return
	}

	// CM-1.3: surface per-org aggregation. Blueprint §2 — organizations
	// is data-layer first-class; admin stats must show "按 org 聚合".
	byOrg, err := h.Store.StatsByOrg()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to aggregate by org")
		return
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{
		"user_count":    userCount,
		"channel_count": channelCount,
		"online_count":  len(online),
		"by_org":        byOrg,
	})
}

func (h *AdminHandler) handleListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.Store.ListAdminUsers()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to list users")
		return
	}

	result := make([]map[string]any, len(users))
	for i, u := range users {
		result[i] = sanitizeUserAdmin(&u)
	}
	writeJSONResponse(w, http.StatusOK, map[string]any{"users": result})
}

func sanitizeUserAdmin(u *store.User) map[string]any {
	m := map[string]any{
		"id":              u.ID,
		"display_name":    u.DisplayName,
		"role":            u.Role,
		"avatar_url":      u.AvatarURL,
		"require_mention": u.RequireMention,
		"disabled":        u.Disabled,
		"created_at":      u.CreatedAt,
	}
	if u.Email != nil {
		m["email"] = *u.Email
	}
	if u.OwnerID != nil {
		m["owner_id"] = *u.OwnerID
	}
	if u.DeletedAt != nil {
		m["deleted_at"] = *u.DeletedAt
	}
	if u.LastSeenAt != nil {
		m["last_seen_at"] = *u.LastSeenAt
	}
	return m
}

func (h *AdminHandler) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID          string `json:"id"`
		Email       string `json:"email"`
		Password    string `json:"password"`
		DisplayName string `json:"display_name"`
		Role        string `json:"role"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	if body.DisplayName == "" {
		writeJSONError(w, http.StatusBadRequest, "display_name is required")
		return
	}
	if body.Role == "" {
		body.Role = "member"
	}
	if body.Role != "member" {
		writeJSONError(w, http.StatusBadRequest, "role must be member")
		return
	}
	if body.Email == "" || body.Password == "" {
		writeJSONError(w, http.StatusBadRequest, "email and password are required")
		return
	}

	user := &store.User{
		ID:          body.ID,
		DisplayName: body.DisplayName,
		Role:        body.Role,
	}

	if body.Email != "" {
		user.Email = &body.Email
	}
	if body.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Failed to hash password")
			return
		}
		user.PasswordHash = string(hash)
	}

	if err := h.Store.CreateUser(user); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to create user")
		return
	}

	// CM-1.2: admin-created humans get an auto-org too (same contract as
	// /api/v1/auth/register). Blueprint §1.1: 1 person = 1 org in v0.
	if _, err := h.Store.CreateOrgForUser(user, body.DisplayName+"'s org"); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to create organization")
		return
	}

	h.Store.GrantDefaultPermissions(user.ID, user.Role)
	h.Store.AddUserToPublicChannels(user.ID)

	writeJSONResponse(w, http.StatusCreated, map[string]any{"user": sanitizeUserAdmin(user)})
}

func (h *AdminHandler) handleUpdateUser(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	target, err := h.Store.GetUserByID(id)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "User not found")
		return
	}

	var body struct {
		DisplayName    *string `json:"display_name"`
		Password       *string `json:"password"`
		Role           *string `json:"role"`
		RequireMention *bool   `json:"require_mention"`
		Disabled       *bool   `json:"disabled"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	if body.Role != nil {
		newRole := *body.Role
		if newRole != "member" {
			writeJSONError(w, http.StatusBadRequest, "role must be member")
			return
		}
	}

	updates := map[string]any{}
	if body.DisplayName != nil {
		updates["display_name"] = *body.DisplayName
	}
	if body.Password != nil {
		hash, err := bcrypt.GenerateFromPassword([]byte(*body.Password), bcrypt.DefaultCost)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Failed to hash password")
			return
		}
		updates["password_hash"] = string(hash)
	}
	if body.Role != nil {
		updates["role"] = *body.Role
	}
	if body.RequireMention != nil {
		updates["require_mention"] = *body.RequireMention
	}
	if body.Disabled != nil {
		updates["disabled"] = *body.Disabled
		if *body.Disabled {
			h.cascadeDisableAgents(target.ID, true)
		} else {
			h.cascadeDisableAgents(target.ID, false)
		}
	}

	if len(updates) > 0 {
		if err := h.Store.UpdateUser(id, updates); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Failed to update user")
			return
		}
	}

	updated, _ := h.Store.GetUserByID(id)
	if updated == nil {
		updated = target
	}
	writeJSONResponse(w, http.StatusOK, map[string]any{"user": sanitizeUserAdmin(updated)})
}

func (h *AdminHandler) cascadeDisableAgents(ownerID string, disable bool) {
	agents, err := h.Store.ListAgentsByOwner(ownerID)
	if err != nil {
		return
	}
	for _, agent := range agents {
		if disable {
			h.Store.UpdateUser(agent.ID, map[string]any{"disabled": true})
		} else {
			if agent.DeletedAt == nil {
				h.Store.UpdateUser(agent.ID, map[string]any{"disabled": false})
			}
		}
	}
}

func (h *AdminHandler) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	if _, err := h.Store.GetUserByID(id); err != nil {
		writeJSONError(w, http.StatusNotFound, "User not found")
		return
	}

	if err := h.Store.SoftDeleteUser(id); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to delete user")
		return
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *AdminHandler) handleGenerateAPIKey(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := h.Store.GetUserByID(id); err != nil {
		writeJSONError(w, http.StatusNotFound, "User not found")
		return
	}

	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to generate key")
		return
	}
	apiKey := "bgr_" + hex.EncodeToString(b)

	if err := h.Store.SetAPIKey(id, apiKey); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to set API key")
		return
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *AdminHandler) handleListUserAgents(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := h.Store.GetUserByID(id); err != nil {
		writeJSONError(w, http.StatusNotFound, "User not found")
		return
	}

	agents, err := h.Store.ListAgentsByOwner(id)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to list agents")
		return
	}
	result := make([]map[string]any, len(agents))
	for i, agent := range agents {
		result[i] = sanitizeUserAdmin(&agent)
	}
	writeJSONResponse(w, http.StatusOK, map[string]any{"agents": result})
}

func (h *AdminHandler) handleDeleteAPIKey(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := h.Store.GetUserByID(id); err != nil {
		writeJSONError(w, http.StatusNotFound, "User not found")
		return
	}

	if err := h.Store.ClearAPIKey(id); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to clear API key")
		return
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *AdminHandler) handleGetPermissions(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	user, err := h.Store.GetUserByID(id)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "User not found")
		return
	}

	if user.Role == "admin" {
		writeJSONResponse(w, http.StatusOK, map[string]any{
			"user_id":     user.ID,
			"role":        user.Role,
			"permissions": []string{"*"},
			"details":     []any{},
			"note":        "Admin role has all permissions implicitly",
		})
		return
	}

	perms, err := h.Store.ListUserPermissions(id)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to list permissions")
		return
	}

	permStrs := make([]string, len(perms))
	details := make([]map[string]any, len(perms))
	for i, p := range perms {
		permStrs[i] = p.Permission
		details[i] = map[string]any{
			"permission": p.Permission,
			"scope":      p.Scope,
			"granted_at": p.GrantedAt,
		}
		if p.GrantedBy != nil {
			details[i]["granted_by"] = *p.GrantedBy
		}
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{
		"user_id":     user.ID,
		"role":        user.Role,
		"permissions": permStrs,
		"details":     details,
	})
}

func (h *AdminHandler) handleGrantPermission(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	if _, err := h.Store.GetUserByID(id); err != nil {
		writeJSONError(w, http.StatusNotFound, "User not found")
		return
	}

	var body struct {
		Permission string `json:"permission"`
		Scope      string `json:"scope"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if body.Permission == "" {
		writeJSONError(w, http.StatusBadRequest, "permission is required")
		return
	}
	if body.Scope == "" {
		body.Scope = "*"
	}

	existing, _ := h.Store.ListUserPermissions(id)
	for _, p := range existing {
		if p.Permission == body.Permission && p.Scope == body.Scope {
			writeJSONError(w, http.StatusConflict, "Permission already exists")
			return
		}
	}

	perm := &store.UserPermission{
		UserID:     id,
		Permission: body.Permission,
		Scope:      body.Scope,
		GrantedAt:  time.Now().UnixMilli(),
	}
	if err := h.Store.GrantPermission(perm); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to grant permission")
		return
	}

	writeJSONResponse(w, http.StatusCreated, map[string]any{
		"ok":         true,
		"permission": body.Permission,
		"scope":      body.Scope,
	})
}

func (h *AdminHandler) handleRevokePermission(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	if _, err := h.Store.GetUserByID(id); err != nil {
		writeJSONError(w, http.StatusNotFound, "User not found")
		return
	}

	var body struct {
		Permission string `json:"permission"`
		Scope      string `json:"scope"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if body.Permission == "" {
		writeJSONError(w, http.StatusBadRequest, "permission is required")
		return
	}
	if body.Scope == "" {
		body.Scope = "*"
	}

	perms, _ := h.Store.ListUserPermissions(id)
	found := false
	for _, p := range perms {
		if p.Permission == body.Permission && p.Scope == body.Scope {
			found = true
			h.Store.DB().Delete(&p)
			break
		}
	}

	if !found {
		writeJSONError(w, http.StatusNotFound, "Permission not found")
		return
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *AdminHandler) handleCreateInvite(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ExpiresInHours *int   `json:"expires_in_hours"`
		Note           string `json:"note"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	var expiresAt *int64
	if body.ExpiresInHours != nil {
		t := time.Now().Add(time.Duration(*body.ExpiresInHours) * time.Hour).UnixMilli()
		expiresAt = &t
	}

	invite, err := h.Store.CreateInviteCode("admin", expiresAt, body.Note)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to create invite")
		return
	}

	writeJSONResponse(w, http.StatusCreated, map[string]any{"invite": invite})
}

func (h *AdminHandler) handleListInvites(w http.ResponseWriter, r *http.Request) {
	invites, err := h.Store.ListInviteCodes()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to list invites")
		return
	}
	if invites == nil {
		invites = []store.InviteCode{}
	}
	writeJSONResponse(w, http.StatusOK, map[string]any{"invites": invites})
}

func (h *AdminHandler) handleDeleteInvite(w http.ResponseWriter, r *http.Request) {
	code := r.PathValue("code")
	deleted, err := h.Store.DeleteInviteCode(code)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to delete invite")
		return
	}
	if !deleted {
		writeJSONError(w, http.StatusNotFound, "Invite not found")
		return
	}
	writeJSONResponse(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *AdminHandler) handleListChannels(w http.ResponseWriter, r *http.Request) {
	channels, err := h.Store.ListAllChannelsAdmin()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to list channels")
		return
	}
	if channels == nil {
		channels = []store.Channel{}
	}
	writeJSONResponse(w, http.StatusOK, map[string]any{"channels": channels})
}

func (h *AdminHandler) handleForceDeleteChannel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ch, err := h.Store.GetChannelByID(id)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Channel not found")
		return
	}

	if ch.Name == "general" {
		writeJSONError(w, http.StatusBadRequest, "Cannot delete #general")
		return
	}
	if ch.Type == "dm" {
		writeJSONError(w, http.StatusBadRequest, "Cannot delete DM channels")
		return
	}

	if err := h.Store.ForceDeleteChannel(id); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to delete channel")
		return
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{"ok": true})
}
