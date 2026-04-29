package api

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"borgee-server/internal/auth"
	"borgee-server/internal/config"
	"borgee-server/internal/store"
)

var channelChangeKinds = []string{
	"member_joined", "member_left", "channel_created", "channel_deleted",
	"visibility_changed", "user_joined", "user_left",
}

type EventSignaler interface {
	SubscribeEvents() chan struct{}
	UnsubscribeEvents(chan struct{})
	SignalNewEvents()
	GetOnlineUserIDs() []string
}

type PollHandler struct {
	Store  *store.Store
	Logger *slog.Logger
	Hub    EventSignaler
	Config *config.Config
}

func (h *PollHandler) RegisterRoutes(mux *http.ServeMux, authMw func(http.Handler) http.Handler) {
	mux.HandleFunc("POST /api/v1/poll", h.handlePoll)
	mux.Handle("HEAD /api/v1/stream", authMw(http.HandlerFunc(h.handleStreamHead)))
	mux.HandleFunc("GET /api/v1/stream", h.handleStreamGet)
	// RT-1.2 (#290 RT-1.1 follow): synchronous backfill endpoint that
	// the client calls on WS reconnect with `?since=<last_seen_cursor>`
	// to pull any events the WS missed during the disconnect window.
	// Channel filter mirrors the user's membership; the server NEVER
	// returns events <= since (反约束: 不 default 拉全 history).
	mux.HandleFunc("GET /api/v1/events", h.handleEventsBackfill)
}

func (h *PollHandler) authenticatePoll(r *http.Request, body *struct {
	APIKey     string   `json:"api_key"`
	Cursor     *int64   `json:"cursor"`
	SinceID    *string  `json:"since_id"`
	TimeoutMs  *int     `json:"timeout_ms"`
	ChannelIDs []string `json:"channel_ids"`
}) *store.User {
	if authHeader := r.Header.Get("Authorization"); strings.HasPrefix(authHeader, "Bearer ") {
		apiKey := strings.TrimPrefix(authHeader, "Bearer ")
		if user, err := h.Store.GetUserByAPIKey(apiKey); err == nil && user.DeletedAt == nil && !user.Disabled {
			return user
		}
	}

	if body.APIKey != "" {
		if user, err := h.Store.GetUserByAPIKey(body.APIKey); err == nil && user.DeletedAt == nil && !user.Disabled {
			return user
		}
	}

	if cookie, err := r.Cookie("borgee_token"); err == nil {
		if user := auth.ValidateJWT(h.Store, h.Config.JWTSecret, cookie.Value); user != nil {
			return user
		}
	}

	return nil
}

func (h *PollHandler) authenticateSSE(r *http.Request) *store.User {
	if authHeader := r.Header.Get("Authorization"); strings.HasPrefix(authHeader, "Bearer ") {
		apiKey := strings.TrimPrefix(authHeader, "Bearer ")
		if user, err := h.Store.GetUserByAPIKey(apiKey); err == nil && user.DeletedAt == nil && !user.Disabled {
			return user
		}
	}

	if apiKey := r.URL.Query().Get("api_key"); apiKey != "" {
		if user, err := h.Store.GetUserByAPIKey(apiKey); err == nil && user.DeletedAt == nil && !user.Disabled {
			return user
		}
	}

	if cookie, err := r.Cookie("borgee_token"); err == nil {
		if user := auth.ValidateJWT(h.Store, h.Config.JWTSecret, cookie.Value); user != nil {
			return user
		}
	}

	return nil
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

	user := h.authenticatePoll(r, &body)
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

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
		signal := h.Hub.SubscribeEvents()
		defer h.Hub.UnsubscribeEvents(signal)
		deadline := time.After(time.Duration(timeoutMs) * time.Millisecond)
		for {
			select {
			case <-r.Context().Done():
				writeJSONResponse(w, http.StatusOK, map[string]any{"cursor": cursor, "events": []any{}})
				return
			case <-deadline:
				writeJSONResponse(w, http.StatusOK, map[string]any{"cursor": cursor, "events": []any{}})
				return
			case <-signal:
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
	user := h.authenticateSSE(r)
	if user == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}

	userChannels := h.Store.GetUserChannelIDs(user.ID)

	// CRITICAL ordering — subscribe + snapshot cursor BEFORE we tell the
	// client we are connected. Otherwise the client may issue a write
	// (e.g. POST /messages) that commits at cursor=N+1 in the window
	// between our `:connected` flush and our SubscribeEvents/GetLatestCursor
	// pair. Two race shapes that ordering closes:
	//
	//   (A) commit happens before GetLatestCursor: snapshot reads N+1 and
	//       the select-loop's `cursor > snapshot` filter silently drops the
	//       new event — it is treated as "already delivered" though the
	//       client has seen nothing. This is the real cause of the
	//       TestP1SSEReconnectBackfill 30s deadline on slow CI.
	//
	//   (B) commit happens after GetLatestCursor but SignalNewEvents fires
	//       before SubscribeEvents: the signal has no subscriber and is
	//       dropped. The next event-loop iteration only wakes on heartbeat
	//       (15s) or another unrelated signal, so the message lingers
	//       undelivered.
	//
	// By snapshotting + subscribing here — before WriteHeader — every
	// commit the client can possibly issue lives strictly after our
	// snapshot, and SignalNewEvents either bumps a buffered slot (cap=1)
	// we drain on entering the select, or it raced ahead of our subscribe
	// (impossible since the client cannot have observed us yet). PR #527
	// (deadline 5s→30s) was treating a symptom; this is the true fix.
	ctx := r.Context()
	var signal chan struct{}
	if h.Hub != nil {
		signal = h.Hub.SubscribeEvents()
		defer h.Hub.UnsubscribeEvents(signal)
	}
	cursor := h.Store.GetLatestCursor()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	fmt.Fprint(w, ":connected\n\n")
	flusher.Flush()

	if lastID := r.Header.Get("Last-Event-ID"); lastID != "" {
		if c, err := strconv.ParseInt(lastID, 10, 64); err == nil && c < cursor {
			backfilled := h.sendBackfill(w, flusher, c, userChannels, user.ID)
			if backfilled > cursor {
				cursor = backfilled
			}
			// sendBackfill returned the highest cursor it emitted (or `c`
			// if none). Use max(snapshot, backfilled) as the live-loop
			// low-water so events in [snapshot+1, backfilled] are not
			// re-emitted by the signal path.
		}
	}

	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()

	memberRefresh := time.NewTicker(60 * time.Second)
	defer memberRefresh.Stop()

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

// handleEventsBackfill — RT-1.2 (#290 follow) synchronous backfill.
// Contract:
//   - Auth: same as poll (Bearer / API key / borgee_token cookie).
//   - Query: `since` (int64, required, > 0); `limit` (int, default 200,
//     max 500). The server returns events with `cursor > since`,
//     filtered to the user's channel membership, in cursor-ASC order.
//   - Reverse约束 (RT-1 spec §1.2): server NEVER returns events with
//     `cursor <= since` — the client's already-rendered set dedup
//     (last_seen_cursor) stays fail-closed.
//   - Latency: synchronous, no long-poll wait. The client is the one
//     reconnecting; if there's no gap the response is `{cursor:since,
//     events:[]}` and the client moves on.
//
// Response shape mirrors POST /api/v1/poll for client reuse — same
// `{cursor, events: [{cursor, kind, channel_id, payload, created_at}]}`
// envelope so the WS handler dispatch can be reused on each event.
func (h *PollHandler) handleEventsBackfill(w http.ResponseWriter, r *http.Request) {
	user := h.authenticateSSE(r)
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	q := r.URL.Query()
	sinceStr := q.Get("since")
	if sinceStr == "" {
		writeJSONError(w, http.StatusBadRequest, "missing 'since' query param")
		return
	}
	since, err := strconv.ParseInt(sinceStr, 10, 64)
	if err != nil || since < 0 {
		writeJSONError(w, http.StatusBadRequest, "invalid 'since' (must be non-negative int64)")
		return
	}

	limit := 200
	if l := q.Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			limit = v
			if limit > 500 {
				limit = 500
			}
		}
	}

	userChannels := h.Store.GetUserChannelIDs(user.ID)
	events, err := h.Store.GetEventsSinceWithChanges(since, limit, userChannels, channelChangeKinds)
	if err != nil {
		h.Logger.Error("backfill query failed", "error", err, "user_id", user.ID, "since", since)
		writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		return
	}

	latestCursor := since
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

func (h *PollHandler) sendBackfill(w http.ResponseWriter, flusher http.Flusher, since int64, channelIDs []string, userID string) int64 {
	events, err := h.Store.GetEventsSinceWithChanges(since, 500, channelIDs, channelChangeKinds)
	if err != nil {
		return since
	}
	for _, e := range events {
		fmt.Fprintf(w, "event: %s\nid: %d\ndata: %s\n\n", e.Kind, e.Cursor, e.Payload)
	}
	if len(events) > 0 {
		flusher.Flush()
		return events[len(events)-1].Cursor
	}
	return since
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
