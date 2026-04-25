package api

import (
	"log/slog"
	"net/http"

	"collab-server/internal/store"
)

type CommandHandler struct {
	Store  *store.Store
	Logger *slog.Logger
}

func (h *CommandHandler) RegisterRoutes(mux *http.ServeMux, authMw func(http.Handler) http.Handler) {
	mux.Handle("GET /api/v1/commands", authMw(http.HandlerFunc(h.handleListCommands)))
}

func (h *CommandHandler) handleListCommands(w http.ResponseWriter, r *http.Request) {
	writeJSONResponse(w, http.StatusOK, map[string]any{
		"builtin": []any{},
		"agent":   []any{},
	})
}
