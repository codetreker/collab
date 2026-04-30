package api

import (
	"log/slog"
	"net/http"

	"borgee-server/internal/config"
	"borgee-server/internal/store"
)

type DmHandler struct {
	Store  *store.Store
	Config *config.Config
	Logger *slog.Logger
}

func (h *DmHandler) RegisterRoutes(mux *http.ServeMux, authMw func(http.Handler) http.Handler) {
	wrap := func(f http.HandlerFunc) http.Handler { return authMw(f) }

	mux.Handle("POST /api/v1/dm/{userId}", wrap(h.handleCreateDm))
	mux.Handle("GET /api/v1/dm", wrap(h.handleListDms))
}

func (h *DmHandler) handleCreateDm(w http.ResponseWriter, r *http.Request) {
	user, ok := mustUser(w, r)
	if !ok {
		return
	}

	targetID := r.PathValue("userId")
	if targetID == user.ID {
		writeJSONError(w, http.StatusBadRequest, "Cannot create DM with yourself")
		return
	}

	target, err := h.Store.GetUserByID(targetID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "User not found")
		return
	}

	ch, err := h.Store.CreateDmChannel(user.ID, targetID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to create DM channel")
		return
	}

	peer := map[string]any{
		"id":           target.ID,
		"display_name": target.DisplayName,
		"avatar_url":   target.AvatarURL,
		"role":         target.Role,
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{"channel": ch, "peer": peer})
}

func (h *DmHandler) handleListDms(w http.ResponseWriter, r *http.Request) {
	user, ok := mustUser(w, r)
	if !ok {
		return
	}

	channels, err := h.Store.ListDmChannelsForUser(user.ID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to list DM channels")
		return
	}
	if channels == nil {
		channels = []store.DmChannelInfo{}
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{"channels": channels})
}
