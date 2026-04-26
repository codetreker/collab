package api

import (
	"log/slog"
	"net/http"

	"borgee-server/internal/auth"
	"borgee-server/internal/store"
)

type AgentHandler struct {
	Store  *store.Store
	Logger *slog.Logger
	Hub    AgentFileProxy
}

type AgentFileProxy interface {
	ProxyPluginRequest(agentID string, method string, path string, body []byte) (int, []byte, error)
}

func (h *AgentHandler) RegisterRoutes(mux *http.ServeMux, authMw func(http.Handler) http.Handler) {
	wrap := func(f http.HandlerFunc) http.Handler { return authMw(f) }

	mux.Handle("POST /api/v1/agents", wrap(h.handleCreateAgent))
	mux.Handle("GET /api/v1/agents", wrap(h.handleListAgents))
	mux.Handle("GET /api/v1/agents/{id}", wrap(h.handleGetAgent))
	mux.Handle("DELETE /api/v1/agents/{id}", wrap(h.handleDeleteAgent))
	mux.Handle("POST /api/v1/agents/{id}/rotate-api-key", wrap(h.handleRotateAPIKey))
	mux.Handle("GET /api/v1/agents/{id}/permissions", wrap(h.handleGetPermissions))
	mux.Handle("PUT /api/v1/agents/{id}/permissions", wrap(h.handleSetPermissions))
	mux.Handle("GET /api/v1/agents/{id}/files", wrap(h.handleGetAgentFiles))
}

func sanitizeAgent(u *store.User) map[string]any {
	m := map[string]any{
		"id":              u.ID,
		"display_name":    u.DisplayName,
		"role":            u.Role,
		"avatar_url":      u.AvatarURL,
		"require_mention": u.RequireMention,
		"created_at":      u.CreatedAt,
		"disabled":        u.Disabled,
	}
	if u.OwnerID != nil {
		m["owner_id"] = *u.OwnerID
	}
	if u.APIKey != nil {
		m["api_key"] = *u.APIKey
	}
	return m
}

func (h *AgentHandler) handleCreateAgent(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var body struct {
		ID          string `json:"id"`
		DisplayName string `json:"display_name"`
		AvatarURL   string `json:"avatar_url"`
		Permissions []struct {
			Permission string `json:"permission"`
			Scope      string `json:"scope"`
		} `json:"permissions"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	if body.DisplayName == "" {
		writeJSONError(w, http.StatusBadRequest, "display_name is required")
		return
	}

	apiKey, err := store.GenerateAPIKey()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to generate API key")
		return
	}

	agent := &store.User{
		ID:          body.ID,
		DisplayName: body.DisplayName,
		Role:        "agent",
		AvatarURL:   body.AvatarURL,
		OwnerID:     &user.ID,
		APIKey:      &apiKey,
	}

	if err := h.Store.CreateUser(agent); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to create agent")
		return
	}

	h.Store.GrantDefaultPermissions(agent.ID, "agent")

	for _, p := range body.Permissions {
		scope := p.Scope
		if scope == "" {
			scope = "*"
		}
		h.Store.GrantPermission(&store.UserPermission{
			UserID:     agent.ID,
			Permission: p.Permission,
			Scope:      scope,
			GrantedBy:  &user.ID,
		})
	}

	h.Store.AddUserToPublicChannels(agent.ID)

	writeJSONResponse(w, http.StatusCreated, map[string]any{"agent": sanitizeAgent(agent)})
}

func (h *AgentHandler) handleListAgents(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var agents []store.User
	var err error
	if user.Role == "admin" {
		agents, err = h.Store.ListAllAgents()
	} else {
		agents, err = h.Store.ListAgentsByOwner(user.ID)
	}
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to list agents")
		return
	}

	result := make([]map[string]any, len(agents))
	for i, a := range agents {
		result[i] = sanitizeAgent(&a)
	}
	writeJSONResponse(w, http.StatusOK, map[string]any{"agents": result})
}

func (h *AgentHandler) handleGetAgent(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	id := r.PathValue("id")
	agent, err := h.Store.GetAgent(id)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Agent not found")
		return
	}

	if user.Role != "admin" && (agent.OwnerID == nil || *agent.OwnerID != user.ID) {
		writeJSONError(w, http.StatusForbidden, "Forbidden")
		return
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{"agent": sanitizeAgent(agent)})
}

func (h *AgentHandler) handleDeleteAgent(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	id := r.PathValue("id")
	agent, err := h.Store.GetAgent(id)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Agent not found")
		return
	}

	if user.Role != "admin" && (agent.OwnerID == nil || *agent.OwnerID != user.ID) {
		writeJSONError(w, http.StatusForbidden, "Forbidden")
		return
	}

	if err := h.Store.SoftDeleteUser(id); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to delete agent")
		return
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *AgentHandler) handleRotateAPIKey(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	id := r.PathValue("id")
	agent, err := h.Store.GetAgent(id)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Agent not found")
		return
	}

	if user.Role != "admin" && (agent.OwnerID == nil || *agent.OwnerID != user.ID) {
		writeJSONError(w, http.StatusForbidden, "Forbidden")
		return
	}

	apiKey, err := store.GenerateAPIKey()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to generate API key")
		return
	}

	if err := h.Store.SetAPIKey(id, apiKey); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to set API key")
		return
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{"api_key": apiKey})
}

func (h *AgentHandler) handleGetPermissions(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	id := r.PathValue("id")
	agent, err := h.Store.GetAgent(id)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Agent not found")
		return
	}

	if user.Role != "admin" && (agent.OwnerID == nil || *agent.OwnerID != user.ID) {
		writeJSONError(w, http.StatusForbidden, "Forbidden")
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
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{
		"agent_id":    agent.ID,
		"permissions": permStrs,
		"details":     details,
	})
}

func (h *AgentHandler) handleSetPermissions(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	id := r.PathValue("id")
	agent, err := h.Store.GetAgent(id)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Agent not found")
		return
	}

	if user.Role != "admin" && (agent.OwnerID == nil || *agent.OwnerID != user.ID) {
		writeJSONError(w, http.StatusForbidden, "Forbidden")
		return
	}

	var body struct {
		Permissions []struct {
			Permission string `json:"permission"`
			Scope      string `json:"scope"`
		} `json:"permissions"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.Store.DeletePermissionsByUserID(id)

	for _, p := range body.Permissions {
		scope := p.Scope
		if scope == "" {
			scope = "*"
		}
		h.Store.GrantPermission(&store.UserPermission{
			UserID:     id,
			Permission: p.Permission,
			Scope:      scope,
			GrantedBy:  &user.ID,
		})
	}

	perms, _ := h.Store.ListUserPermissions(id)
	permStrs := make([]string, len(perms))
	details := make([]map[string]any, len(perms))
	for i, p := range perms {
		permStrs[i] = p.Permission
		details[i] = map[string]any{
			"permission": p.Permission,
			"scope":      p.Scope,
			"granted_at": p.GrantedAt,
		}
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{
		"agent_id":    agent.ID,
		"permissions": permStrs,
		"details":     details,
	})
}

func (h *AgentHandler) handleGetAgentFiles(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	id := r.PathValue("id")
	agent, err := h.Store.GetAgent(id)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Agent not found")
		return
	}

	if user.Role != "admin" && (agent.OwnerID == nil || *agent.OwnerID != user.ID) {
		writeJSONError(w, http.StatusForbidden, "Forbidden")
		return
	}

	if h.Hub == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "Agent not connected")
		return
	}

	path := r.URL.Query().Get("path")
	status, body, err := h.Hub.ProxyPluginRequest(id, "read_file", path, nil)
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, "Agent not connected")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write(body)
}
