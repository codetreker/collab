package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"borgee-server/internal/auth"
	"borgee-server/internal/store"
)

// MessageHandler handles message CRUD endpoints.
type MessageHandler struct {
	Store  *store.Store
	Logger *slog.Logger
	Hub    EventBroadcaster
}

type EventBroadcaster interface {
	BroadcastEventToChannel(channelID string, eventType string, payload any)
	BroadcastEventToAll(eventType string, payload any)
	BroadcastEventToUser(userID string, eventType string, payload any)
	SignalNewEvents()
}

func (h *MessageHandler) RegisterRoutes(mux *http.ServeMux, authMw func(http.Handler) http.Handler, sendPerm func(http.Handler) http.Handler) {
	// Channel-scoped routes (need auth)
	mux.Handle("GET /api/v1/channels/{channelId}/messages", authMw(http.HandlerFunc(h.handleListMessages)))
	mux.Handle("GET /api/v1/channels/{channelId}/messages/search", authMw(http.HandlerFunc(h.handleSearchMessages)))
	mux.Handle("POST /api/v1/channels/{channelId}/messages", authMw(sendPerm(http.HandlerFunc(h.handleCreateMessage))))

	// Message-scoped routes (need auth)
	mux.Handle("PUT /api/v1/messages/{messageId}", authMw(http.HandlerFunc(h.handleUpdateMessage)))
	mux.Handle("DELETE /api/v1/messages/{messageId}", authMw(http.HandlerFunc(h.handleDeleteMessage)))
}

// GET /api/v1/channels/:channelId/messages?before=&after=&limit=
func (h *MessageHandler) handleListMessages(w http.ResponseWriter, r *http.Request) {
	channelID := r.PathValue("channelId")
	if channelID == "" {
		writeJSONError(w, http.StatusBadRequest, "Channel ID is required")
		return
	}

	user := auth.UserFromContext(r.Context())

	// Validate channel exists
	ch, err := h.Store.GetChannelByID(channelID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Channel not found")
		return
	}

	// Private channel access check
	if ch.Visibility == "private" {
		if user == nil || !h.Store.CanAccessChannel(channelID, user.ID) {
			writeJSONError(w, http.StatusNotFound, "Channel not found")
			return
		}
	}

	// Parse query params
	var before, after *int64
	if v := r.URL.Query().Get("before"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			before = &n
		}
	}
	if v := r.URL.Query().Get("after"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			after = &n
		}
	}

	limit := 100
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			if n > 200 {
				n = 200
			}
			limit = n
		}
	}

	msgs, hasMore, err := h.Store.ListChannelMessages(channelID, before, after, limit)
	if err != nil {
		h.Logger.Error("failed to list messages", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		return
	}

	type messageWithReactions struct {
		store.MessageWithSender
		Reactions []store.AggregatedReaction `json:"reactions"`
	}
	// TODO: N+1 query — each message triggers a separate DB query for reactions.
	// Optimize with batch query: SELECT ... WHERE message_id IN (...) grouped by message_id.
	out := make([]messageWithReactions, len(msgs))
	for i, msg := range msgs {
		reactions, err := h.Store.GetReactionsByMessage(msg.ID)
		if err != nil {
			h.Logger.Error("failed to get message reactions", "error", err)
			writeJSONError(w, http.StatusInternalServerError, "Internal server error")
			return
		}
		if reactions == nil {
			reactions = []store.AggregatedReaction{}
		}
		out[i] = messageWithReactions{MessageWithSender: msg, Reactions: reactions}
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{
		"messages": out,
		"has_more": hasMore,
	})
}

// GET /api/v1/channels/:channelId/messages/search?q=&limit=
func (h *MessageHandler) handleSearchMessages(w http.ResponseWriter, r *http.Request) {
	channelID := r.PathValue("channelId")
	if channelID == "" {
		writeJSONError(w, http.StatusBadRequest, "Channel ID is required")
		return
	}

	user := auth.UserFromContext(r.Context())

	// Validate channel exists
	ch, err := h.Store.GetChannelByID(channelID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Channel not found")
		return
	}

	if ch.Visibility == "private" {
		if user == nil || !h.Store.CanAccessChannel(channelID, user.ID) {
			writeJSONError(w, http.StatusNotFound, "Channel not found")
			return
		}
	}

	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		writeJSONError(w, http.StatusBadRequest, "Search query (q) is required")
		return
	}

	limit := 50
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			if n > 50 {
				n = 50
			}
			limit = n
		}
	}

	msgs, err := h.Store.SearchMessages(channelID, q, limit)
	if err != nil {
		h.Logger.Error("failed to search messages", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		return
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{"messages": msgs})
}

// POST /api/v1/channels/:channelId/messages
func (h *MessageHandler) handleCreateMessage(w http.ResponseWriter, r *http.Request) {
	channelID := r.PathValue("channelId")
	if channelID == "" {
		writeJSONError(w, http.StatusBadRequest, "Channel ID is required")
		return
	}

	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var body struct {
		Content     string   `json:"content"`
		ContentType string   `json:"content_type"`
		ReplyToID   *string  `json:"reply_to_id"`
		Mentions    []string `json:"mentions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid JSON")
		return
	}

	content := strings.TrimSpace(body.Content)
	if content == "" {
		writeJSONError(w, http.StatusBadRequest, "Message content is required")
		return
	}

	ct := body.ContentType
	if ct == "" {
		ct = "text"
	}
	if ct != "text" && ct != "image" && ct != "command" {
		writeJSONError(w, http.StatusBadRequest, "content_type must be 'text', 'image', or 'command'")
		return
	}

	// Validate channel exists
	ch, err := h.Store.GetChannelByID(channelID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Channel not found")
		return
	}

	// Private channel access check
	if ch.Visibility == "private" && !h.Store.CanAccessChannel(channelID, user.ID) {
		writeJSONError(w, http.StatusNotFound, "Channel not found")
		return
	}

	// Must be a member
	if !h.Store.IsChannelMember(channelID, user.ID) {
		writeJSONError(w, http.StatusForbidden, "Not a member of this channel")
		return
	}

	msg, err := h.Store.CreateMessageFull(channelID, user.ID, content, ct, body.ReplyToID, body.Mentions)
	if err != nil {
		h.Logger.Error("failed to create message", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		return
	}

	h.Store.CreateEvent(&store.Event{
		Kind:      "new_message",
		ChannelID: channelID,
		Payload:   mustJSON(map[string]any{"message": msg}),
	})
	if h.Hub != nil {
		h.Hub.BroadcastEventToChannel(channelID, "new_message", map[string]any{"message": msg})
	}

	writeJSONResponse(w, http.StatusCreated, map[string]any{"message": msg})
}

// PUT /api/v1/messages/:messageId
func (h *MessageHandler) handleUpdateMessage(w http.ResponseWriter, r *http.Request) {
	messageID := r.PathValue("messageId")
	if messageID == "" {
		writeJSONError(w, http.StatusBadRequest, "Message ID is required")
		return
	}

	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var body struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid JSON")
		return
	}

	content := strings.TrimSpace(body.Content)
	if content == "" {
		writeJSONError(w, http.StatusBadRequest, "Content is required")
		return
	}

	existing, err := h.Store.GetMessageByID(messageID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Message not found")
		return
	}

	if existing.DeletedAt != nil {
		writeJSONError(w, http.StatusBadRequest, "Cannot edit deleted message")
		return
	}

	if existing.SenderID != user.ID {
		writeJSONError(w, http.StatusForbidden, "Can only edit your own messages")
		return
	}

	msg, err := h.Store.UpdateMessage(messageID, content)
	if err != nil {
		h.Logger.Error("failed to update message", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		return
	}

	// Write edit event
	h.Store.CreateEvent(&store.Event{
		Kind:      "message_edited",
		ChannelID: existing.ChannelID,
		Payload:   mustJSON(map[string]any{"id": messageID, "channel_id": existing.ChannelID, "sender_id": user.ID, "content": content, "system_message": "用户 " + user.DisplayName + " 编辑了消息"}),
	})
	if h.Hub != nil {
		h.Hub.BroadcastEventToChannel(existing.ChannelID, "message_edited", map[string]any{"message": msg})
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{"message": msg})
}

// DELETE /api/v1/messages/:messageId
func (h *MessageHandler) handleDeleteMessage(w http.ResponseWriter, r *http.Request) {
	messageID := r.PathValue("messageId")
	if messageID == "" {
		writeJSONError(w, http.StatusBadRequest, "Message ID is required")
		return
	}

	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	existing, err := h.Store.GetMessageByID(messageID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Message not found")
		return
	}

	// Already deleted — idempotent
	if existing.DeletedAt != nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	isAdmin := user.Role == "admin"
	if existing.SenderID != user.ID && !isAdmin {
		writeJSONError(w, http.StatusForbidden, "Permission denied")
		return
	}

	deletedAt, err := h.Store.SoftDeleteMessage(messageID)
	if err != nil {
		h.Logger.Error("failed to delete message", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		return
	}

	// Write delete event
	h.Store.CreateEvent(&store.Event{
		Kind:      "message_deleted",
		ChannelID: existing.ChannelID,
		Payload:   mustJSON(map[string]any{"message_id": messageID, "channel_id": existing.ChannelID, "deleted_at": deletedAt, "sender_id": user.ID, "system_message": "用户 " + user.DisplayName + " 删除了一条消息"}),
	})
	if h.Hub != nil {
		h.Hub.BroadcastEventToChannel(existing.ChannelID, "message_deleted", map[string]any{"message_id": messageID, "channel_id": existing.ChannelID, "deleted_at": deletedAt})
	}

	w.WriteHeader(http.StatusNoContent)
}

// mustJSON marshals v to JSON string, returning "{}" on error.
func mustJSON(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(b)
}
