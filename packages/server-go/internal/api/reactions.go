package api

import (
	"log/slog"
	"net/http"

	"collab-server/internal/auth"
	"collab-server/internal/store"
)

type ReactionHandler struct {
	Store  *store.Store
	Logger *slog.Logger
	Hub    EventBroadcaster
}

func (h *ReactionHandler) RegisterRoutes(mux *http.ServeMux, authMw func(http.Handler) http.Handler) {
	wrap := func(f http.HandlerFunc) http.Handler { return authMw(f) }

	mux.Handle("PUT /api/v1/messages/{messageId}/reactions", wrap(h.handleAddReaction))
	mux.Handle("DELETE /api/v1/messages/{messageId}/reactions", wrap(h.handleRemoveReaction))
	mux.Handle("GET /api/v1/messages/{messageId}/reactions", wrap(h.handleGetReactions))
}

func (h *ReactionHandler) handleAddReaction(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	messageID := r.PathValue("messageId")
	if _, err := h.Store.GetMessageByID(messageID); err != nil {
		writeJSONError(w, http.StatusNotFound, "Message not found")
		return
	}

	var body struct {
		Emoji string `json:"emoji"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if body.Emoji == "" {
		writeJSONError(w, http.StatusBadRequest, "emoji is required")
		return
	}

	h.Store.AddReaction(messageID, user.ID, body.Emoji)

	msg, _ := h.Store.GetMessageByID(messageID)

	reactions, err := h.Store.GetReactionsByMessage(messageID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to get reactions")
		return
	}

	if h.Hub != nil && msg != nil {
		h.Store.CreateEvent(&store.Event{
			Kind:      "reaction_update",
			ChannelID: msg.ChannelID,
			Payload:   mustJSON(map[string]any{"message_id": messageID, "reactions": reactions}),
		})
		h.Hub.BroadcastEventToChannel(msg.ChannelID, "reaction_update", map[string]any{"message_id": messageID, "reactions": reactions})
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{"ok": true, "reactions": reactions})
}

func (h *ReactionHandler) handleRemoveReaction(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	messageID := r.PathValue("messageId")

	var body struct {
		Emoji string `json:"emoji"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	if body.Emoji == "" {
		writeJSONError(w, http.StatusBadRequest, "emoji is required")
		return
	}

	h.Store.RemoveReaction(messageID, user.ID, body.Emoji)

	msg, _ := h.Store.GetMessageByID(messageID)

	reactions, err := h.Store.GetReactionsByMessage(messageID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to get reactions")
		return
	}

	if h.Hub != nil && msg != nil {
		h.Store.CreateEvent(&store.Event{
			Kind:      "reaction_update",
			ChannelID: msg.ChannelID,
			Payload:   mustJSON(map[string]any{"message_id": messageID, "reactions": reactions}),
		})
		h.Hub.BroadcastEventToChannel(msg.ChannelID, "reaction_update", map[string]any{"message_id": messageID, "reactions": reactions})
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{"ok": true, "reactions": reactions})
}

func (h *ReactionHandler) handleGetReactions(w http.ResponseWriter, r *http.Request) {
	messageID := r.PathValue("messageId")

	reactions, err := h.Store.GetReactionsByMessage(messageID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to get reactions")
		return
	}

	writeJSONResponse(w, http.StatusOK, map[string]any{"reactions": reactions})
}
