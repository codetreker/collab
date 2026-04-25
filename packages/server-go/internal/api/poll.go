package api

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"collab-server/internal/auth"
	"collab-server/internal/store"
)

var channelChangeKinds = []string{
	"member_joined", "member_left", "channel_created", "channel_deleted",
	"visibility_changed", "user_joined", "user_left",
}

type EventSignaler interface {
	EventSignal() <-chan struct{}
	GetOnlineUserIDs() []string
}

type PollHandler struct {
	Store  *store.Store
	Logger *slog.Logger
	Hub    EventSignaler
}

func (h *PollHandler) RegisterRoutes(mux *http.ServeMux, authMw func(http.Handler) http.Handler) {
	mux.Handle("POST /api/v1/poll", authMw(http.HandlerFunc(h.handlePoll)))
	mux.Handle("HEAD /api/v1/stream", authMw(http.HandlerFunc(h.handleStreamHead)))
	mux.Handle("GET /api/v1/stream", authMw(http.HandlerFunc(h.handleStreamGet)))
}

func (h *PollHandler) handlePoll(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var body struct {
		APIKey     string   `json:"api_key"`
		Cursor     *int64   `json:"cursor"`
		SinceID    *string  `json:"since_id"`
		TimeoutMs  *int     `json:"timeout_ms"`
		ChannelIDs []string `json:"channel_ids"`
	}
	readJSON(r, &body)

	userChannels := h.Store.GetUserChannelIDs(user.ID)
	accessible := make(map[string]bool, len(userChannels))
	for _, id := range userChannels {
		accessible[id] = true
	}

	var filterIDs []string
	if len(body.ChannelIDs) > 0 {
		for _, id := range body.ChannelIDs {
			if accessible[id] {
				filterIDs = append(filterIDs, id)
			}
		}
	} else {
		filterIDs = userChannels
	}

	cursor := int64(0)
	if body.Cursor != nil {
		cursor = *body.Cursor
	} else if body.SinceID != nil {
		if c, err := h.Store.GetEventCursorForMessage(*body.SinceID); err == nil {
			cursor = c
		}
	}

	timeoutMs := 30000
	if body.TimeoutMs != nil {
		timeoutMs = *body.TimeoutMs
		if timeoutMs > 60000 {
			timeoutMs = 60000
		}
		if timeoutMs < 0 {
			timeoutMs = 0
		}
	}

	events, err := h.Store.GetEventsSinceWithChanges(cursor, 100, filterIDs, channelChangeKinds)
	if err != nil {
		h.Logger.Error("poll query failed", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		return
	}

	if len(events) == 0 && timeoutMs > 0 && h.Hub != nil {
		deadline := time.After(time.Duration(timeoutMs) * time.Millisecond)
		for {
			select {
			case <-r.Context().Done():
				writeJSONResponse(w, http.StatusOK, map[string]any{"cursor": cursor, "events": []any{}})
				return
			case <-deadline:
				writeJSONResponse(w, http.StatusOK, map[string]any{"cursor": cursor, "events": []any{}})
				return
			case <-h.Hub.EventSignal():
				events, err = h.Store.GetEventsSinceWithChanges(cursor, 100, filterIDs, channelChangeKinds)
				if err != nil || len(events) > 0 {
					goto respond
				}
			}
		}
	}

respond:
	h.Store.UpdateLastSeen(user.ID)

	latestCursor := cursor
	if len(events) > 0 {
		latestCursor = events[len(events)-1].Cursor
	}

	type eventOut struct {
		Cursor    int64           `json:"cursor"`
		Kind      string          `json:"kind"`
		ChannelID string          `json:"channel_id"`
		Payload   json.RawMessage `json:"payload"`
		CreatedAt int64           `json:"created_at"`
	}
	out := make([]eventOut, len(events))
	for i, e := range events {
		out[i] = eventOut{
			Cursor:    e.Cursor,
			Kind:      e.Kind,
			ChannelID: e.ChannelID,
			Payload:   json.RawMessage(e.Payload),
			CreatedAt: e.CreatedAt,
		}
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{
		"cursor": latestCursor,
		"events": out,
	})
}

func (h *PollHandler) handleStreamHead(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.WriteHeader(http.StatusOK)
}

func (h *PollHandler) handleStreamGet(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	fmt.Fprint(w, ":connected\n\n")
	flusher.Flush()

	userChannels := h.Store.GetUserChannelIDs(user.ID)
	cursor := h.Store.GetLatestCursor()

	if lastID := r.Header.Get("Last-Event-ID"); lastID != "" {
		if c, err := strconv.ParseInt(lastID, 10, 64); err == nil && c < cursor {
			h.sendBackfill(w, flusher, c, userChannels, user.ID)
			cursor = h.Store.GetLatestCursor()
		}
	}

	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()

	memberRefresh := time.NewTicker(60 * time.Second)
	defer memberRefresh.Stop()

	ctx := r.Context()
	var signal <-chan struct{}
	if h.Hub != nil {
		signal = h.Hub.EventSignal()
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-heartbeat.C:
			fmt.Fprintf(w, "event: heartbeat\nid: %d\ndata: {}\n\n", cursor)
			flusher.Flush()
		case <-memberRefresh.C:
			userChannels = h.Store.GetUserChannelIDs(user.ID)
		case <-signal:
			events, err := h.Store.GetEventsSinceWithChanges(cursor, 100, userChannels, channelChangeKinds)
			if err != nil || len(events) == 0 {
				continue
			}
			for _, e := range events {
				fmt.Fprintf(w, "event: %s\nid: %d\ndata: %s\n\n", e.Kind, e.Cursor, e.Payload)
			}
			cursor = events[len(events)-1].Cursor
			flusher.Flush()
			h.Store.UpdateLastSeen(user.ID)
		}
	}
}

func (h *PollHandler) sendBackfill(w http.ResponseWriter, flusher http.Flusher, since int64, channelIDs []string, userID string) {
	events, err := h.Store.GetEventsSinceWithChanges(since, 500, channelIDs, channelChangeKinds)
	if err != nil {
		return
	}
	for _, e := range events {
		fmt.Fprintf(w, "event: %s\nid: %d\ndata: %s\n\n", e.Kind, e.Cursor, e.Payload)
	}
	if len(events) > 0 {
		flusher.Flush()
	}
}

func sseWrite(w http.ResponseWriter, event string, id int64, data string) {
	fmt.Fprintf(w, "event: %s\nid: %d\ndata: %s\n\n", event, id, data)
}

// intersect returns elements in a that are also in the set b.
func intersect(a []string, b map[string]bool) []string {
	result := make([]string, 0, len(a))
	for _, s := range a {
		if b[s] {
			result = append(result, s)
		}
	}
	return result
}

// contains checks if s is in the slice.
func contains(slice []string, s string) bool {
	for _, v := range slice {
		if v == s {
			return true
		}
	}
	return false
}

// Ensure sseWrite and helpers don't get unused warnings
var _ = sseWrite
var _ = intersect
var _ = contains
var _ = strings.TrimSpace
