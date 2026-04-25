package api

import (
	"fmt"
	"log/slog"
	"net/http"

	"collab-server/internal/store"
)

type PollHandler struct {
	Store  *store.Store
	Logger *slog.Logger
}

func (h *PollHandler) RegisterRoutes(mux *http.ServeMux, authMw func(http.Handler) http.Handler) {
	mux.Handle("POST /api/v1/poll", authMw(http.HandlerFunc(h.handlePoll)))
	mux.Handle("HEAD /api/v1/stream", authMw(http.HandlerFunc(h.handleStreamHead)))
	mux.Handle("GET /api/v1/stream", authMw(http.HandlerFunc(h.handleStreamGet)))
}

func (h *PollHandler) handlePoll(w http.ResponseWriter, r *http.Request) {
	var body struct {
		APIKey     string   `json:"api_key"`
		Cursor     *int64   `json:"cursor"`
		SinceID    *string  `json:"since_id"`
		TimeoutMs  *int     `json:"timeout_ms"`
		ChannelIDs []string `json:"channel_ids"`
	}
	readJSON(r, &body)

	writeJSONResponse(w, http.StatusOK, map[string]any{
		"cursor": 0,
		"events": []any{},
	})
}

func (h *PollHandler) handleStreamHead(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.WriteHeader(http.StatusOK)
}

func (h *PollHandler) handleStreamGet(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	fmt.Fprint(w, ":connected\n\n")
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
}
