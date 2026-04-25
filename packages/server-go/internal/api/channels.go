package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	"collab-server/internal/auth"
	"collab-server/internal/config"
	"collab-server/internal/store"
)

func readJSON(r *http.Request, dst any) error {
	const maxBytes = 1 << 20
	r.Body = http.MaxBytesReader(nil, r.Body, maxBytes)
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(dst); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			return fmt.Errorf("request body too large")
		}
		return fmt.Errorf("invalid JSON: %w", err)
	}
	return nil
}

type ChannelHandler struct {
	Store  *store.Store
	Config *config.Config
	Logger *slog.Logger
	Hub    EventBroadcaster
}

var slugRe = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = slugRe.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	return s
}

func channelScope(r *http.Request) string {
	return fmt.Sprintf("channel:%s", r.PathValue("channelId"))
}

func (h *ChannelHandler) RegisterRoutes(mux *http.ServeMux, authMw func(http.Handler) http.Handler) {
	wrap := func(f http.HandlerFunc) http.Handler { return authMw(f) }
	permWrap := func(perm string, f http.HandlerFunc) http.Handler {
		return authMw(auth.RequirePermission(h.Store, perm, channelScope)(f))
	}

	mux.Handle("GET /api/v1/channels", wrap(h.handleListChannels))
	mux.Handle("POST /api/v1/channels", authMw(auth.RequirePermission(h.Store, "channel.create", nil)(http.HandlerFunc(h.handleCreateChannel))))
	mux.Handle("GET /api/v1/channels/{channelId}", wrap(h.handleGetChannel))
	mux.Handle("GET /api/v1/channels/{channelId}/preview", wrap(h.handlePreviewChannel))
	mux.Handle("PUT /api/v1/channels/{channelId}", wrap(h.handleUpdateChannel))
	mux.Handle("PUT /api/v1/channels/{channelId}/topic", wrap(h.handleSetTopic))
	mux.Handle("POST /api/v1/channels/{channelId}/join", wrap(h.handleJoinChannel))
	mux.Handle("POST /api/v1/channels/{channelId}/leave", wrap(h.handleLeaveChannel))
	mux.Handle("POST /api/v1/channels/{channelId}/members", permWrap("channel.manage_members", h.handleAddMember))
	mux.Handle("DELETE /api/v1/channels/{channelId}/members/{userId}", wrap(h.handleRemoveMember))
	mux.Handle("GET /api/v1/channels/{channelId}/members", wrap(h.handleListMembers))
	mux.Handle("PUT /api/v1/channels/{channelId}/read", wrap(h.handleMarkRead))
	mux.Handle("DELETE /api/v1/channels/{channelId}", permWrap("channel.delete", h.handleDeleteChannel))
	mux.Handle("PUT /api/v1/channels/reorder", wrap(h.handleReorderChannel))

	mux.Handle("GET /api/v1/channel-groups", wrap(h.handleListGroups))
	mux.Handle("POST /api/v1/channel-groups", wrap(h.handleCreateGroup))
	mux.Handle("PUT /api/v1/channel-groups/{groupId}", wrap(h.handleUpdateGroup))
	mux.Handle("DELETE /api/v1/channel-groups/{groupId}", wrap(h.handleDeleteGroup))
	mux.Handle("PUT /api/v1/channel-groups/reorder", wrap(h.handleReorderGroup))
}

func (h *ChannelHandler) handleListChannels(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w,http.StatusUnauthorized, "Unauthorized")
		return
	}

	var channels []store.ChannelWithCounts
	var err error

	if user.Role == "admin" {
		channels, err = h.Store.ListAllChannelsForAdmin(user.ID)
	} else {
		channels, err = h.Store.ListChannelsWithUnread(user.ID)
	}
	if err != nil {
		writeJSONError(w,http.StatusInternalServerError, "Failed to list channels")
		return
	}

	groups, err := h.Store.ListChannelGroups()
	if err != nil {
		writeJSONError(w,http.StatusInternalServerError, "Failed to list groups")
		return
	}

	if channels == nil {
		channels = []store.ChannelWithCounts{}
	}
	if groups == nil {
		groups = []store.ChannelGroup{}
	}

	writeJSONResponse(w,http.StatusOK, map[string]any{"channels": channels, "groups": groups})
}

func (h *ChannelHandler) handleCreateChannel(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w,http.StatusUnauthorized, "Unauthorized")
		return
	}

	var body struct {
		Name       string   `json:"name"`
		Topic      string   `json:"topic"`
		MemberIDs  []string `json:"member_ids"`
		Visibility string   `json:"visibility"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSONError(w,http.StatusBadRequest, err.Error())
		return
	}

	slug := slugify(body.Name)
	if slug == "" {
		writeJSONError(w,http.StatusBadRequest, "Channel name is required")
		return
	}

	if body.Visibility == "" {
		body.Visibility = "public"
	}
	if body.Visibility != "public" && body.Visibility != "private" {
		writeJSONError(w,http.StatusBadRequest, "Visibility must be 'public' or 'private'")
		return
	}
	if len(body.Topic) > 250 {
		writeJSONError(w,http.StatusBadRequest, "Topic must be 250 characters or less")
		return
	}

	if existing, _ := h.Store.GetChannelByName(slug); existing != nil {
		writeJSONError(w,http.StatusConflict, "Channel name already exists")
		return
	}

	lastPos := h.Store.GetLastChannelPosition()
	position := store.GenerateRankBetween(lastPos, "")

	ch := &store.Channel{
		Name:       slug,
		Topic:      body.Topic,
		Visibility: body.Visibility,
		CreatedBy:  user.ID,
		Type:       "channel",
		Position:   position,
	}
	if err := h.Store.CreateChannel(ch); err != nil {
		writeJSONError(w,http.StatusInternalServerError, "Failed to create channel")
		return
	}

	h.Store.AddChannelMember(&store.ChannelMember{ChannelID: ch.ID, UserID: user.ID})

	if body.Visibility == "public" {
		if err := h.Store.AddAllUsersToChannel(ch.ID); err != nil {
			h.Logger.Error("failed to add all users to channel", "error", err)
		}
	} else {
		for _, uid := range body.MemberIDs {
			if uid != user.ID {
				h.Store.AddChannelMember(&store.ChannelMember{ChannelID: ch.ID, UserID: uid})
			}
		}
	}

	if err := h.Store.GrantCreatorPermissions(user.ID, user.Role, ch.ID, user.OwnerID); err != nil {
		h.Logger.Error("failed to grant creator permissions", "error", err)
	}

	result, _ := h.Store.GetChannelWithCounts(ch.ID, user.ID)
	if result == nil {
		writeJSONResponse(w,http.StatusCreated, map[string]any{"channel": ch})
	} else {
		writeJSONResponse(w,http.StatusCreated, map[string]any{"channel": result})
	}

	h.Store.CreateEvent(&store.Event{
		Kind:    "channel_created",
		Payload: mustJSON(map[string]any{"channel": ch}),
	})
	if h.Hub != nil {
		h.Hub.BroadcastEventToAll("channel_created", map[string]any{"channel": ch})
	}
}

func (h *ChannelHandler) handleGetChannel(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w,http.StatusUnauthorized, "Unauthorized")
		return
	}

	channelID := r.PathValue("channelId")
	if !h.Store.CanAccessChannel(channelID, user.ID) {
		writeJSONError(w,http.StatusNotFound, "Channel not found")
		return
	}

	ch, err := h.Store.GetChannelWithCounts(channelID, user.ID)
	if err != nil {
		writeJSONError(w,http.StatusNotFound, "Channel not found")
		return
	}

	members, _ := h.Store.GetChannelDetail(channelID)
	if members == nil {
		members = []store.ChannelMemberInfo{}
	}

	resp := map[string]any{
		"channel": ch,
		"members": members,
	}
	writeJSONResponse(w,http.StatusOK, resp)
}

func (h *ChannelHandler) handlePreviewChannel(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w,http.StatusUnauthorized, "Unauthorized")
		return
	}

	channelID := r.PathValue("channelId")
	ch, err := h.Store.GetChannelByID(channelID)
	if err != nil {
		writeJSONError(w,http.StatusNotFound, "Channel not found")
		return
	}

	if ch.Visibility == "private" {
		writeJSONError(w,http.StatusNotFound, "Channel not found")
		return
	}

	msgs, err := h.Store.GetPreviewMessages(channelID, 50)
	if err != nil {
		writeJSONError(w,http.StatusInternalServerError, "Failed to get messages")
		return
	}
	if msgs == nil {
		msgs = []store.PreviewMessage{}
	}

	writeJSONResponse(w,http.StatusOK, map[string]any{"messages": msgs, "channel": ch})
}

func (h *ChannelHandler) handleUpdateChannel(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w,http.StatusUnauthorized, "Unauthorized")
		return
	}

	channelID := r.PathValue("channelId")
	ch, err := h.Store.GetChannelByID(channelID)
	if err != nil {
		writeJSONError(w,http.StatusNotFound, "Channel not found")
		return
	}

	var body struct {
		Name       *string `json:"name"`
		Topic      *string `json:"topic"`
		Visibility *string `json:"visibility"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSONError(w,http.StatusBadRequest, err.Error())
		return
	}

	topicOnly := body.Topic != nil && body.Name == nil && body.Visibility == nil
	if topicOnly {
		if !h.Store.IsChannelMember(channelID, user.ID) && user.Role != "admin" {
			writeJSONError(w,http.StatusForbidden, "Must be a channel member to update topic")
			return
		}
	} else {
		if !h.hasChannelPermission(user, "channel.manage_visibility", channelID) {
			writeJSONError(w,http.StatusForbidden, "Forbidden")
			return
		}
	}

	updates := map[string]any{}
	if body.Name != nil {
		slug := slugify(*body.Name)
		if slug == "" {
			writeJSONError(w,http.StatusBadRequest, "Channel name is required")
			return
		}
		if slug != ch.Name {
			if existing, _ := h.Store.GetChannelByName(slug); existing != nil {
				writeJSONError(w,http.StatusConflict, "Channel name already exists")
				return
			}
		}
		updates["name"] = slug
	}
	if body.Topic != nil {
		if len(*body.Topic) > 250 {
			writeJSONError(w,http.StatusBadRequest, "Topic must be 250 characters or less")
			return
		}
		updates["topic"] = *body.Topic
	}
	if body.Visibility != nil {
		if *body.Visibility != "public" && *body.Visibility != "private" {
			writeJSONError(w,http.StatusBadRequest, "Visibility must be 'public' or 'private'")
			return
		}
		updates["visibility"] = *body.Visibility
	}

	if len(updates) > 0 {
		if err := h.Store.UpdateChannel(channelID, updates); err != nil {
			writeJSONError(w,http.StatusInternalServerError, "Failed to update channel")
			return
		}
	}

	result, _ := h.Store.GetChannelWithCounts(channelID, user.ID)
	writeJSONResponse(w,http.StatusOK, map[string]any{"channel": result})

	h.Store.CreateEvent(&store.Event{
		Kind:      "channel_updated",
		ChannelID: channelID,
		Payload:   mustJSON(map[string]any{"channel": result}),
	})
	if h.Hub != nil {
		h.Hub.BroadcastEventToAll("channel_updated", map[string]any{"channel": result})
	}
}

func (h *ChannelHandler) handleSetTopic(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w,http.StatusUnauthorized, "Unauthorized")
		return
	}

	channelID := r.PathValue("channelId")
	if !h.Store.IsChannelMember(channelID, user.ID) && user.Role != "admin" {
		writeJSONError(w,http.StatusForbidden, "Must be a channel member")
		return
	}

	var body struct {
		Topic string `json:"topic"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSONError(w,http.StatusBadRequest, err.Error())
		return
	}
	if len(body.Topic) > 250 {
		writeJSONError(w,http.StatusBadRequest, "Topic must be 250 characters or less")
		return
	}

	if err := h.Store.UpdateChannel(channelID, map[string]any{"topic": body.Topic}); err != nil {
		writeJSONError(w,http.StatusInternalServerError, "Failed to update topic")
		return
	}

	result, _ := h.Store.GetChannelWithCounts(channelID, user.ID)
	writeJSONResponse(w,http.StatusOK, map[string]any{"channel": result})

	h.Store.CreateEvent(&store.Event{
		Kind:      "channel_updated",
		ChannelID: channelID,
		Payload:   mustJSON(map[string]any{"channel": result}),
	})
	if h.Hub != nil {
		h.Hub.BroadcastEventToChannel(channelID, "channel_updated", map[string]any{"channel": result})
	}
}

func (h *ChannelHandler) handleJoinChannel(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w,http.StatusUnauthorized, "Unauthorized")
		return
	}

	if user.Role == "agent" {
		writeJSONError(w,http.StatusForbidden, "Agents cannot self-join channels")
		return
	}

	channelID := r.PathValue("channelId")
	ch, err := h.Store.GetChannelByID(channelID)
	if err != nil {
		writeJSONError(w,http.StatusNotFound, "Channel not found")
		return
	}

	if ch.Type == "dm" {
		writeJSONError(w,http.StatusBadRequest, "Cannot join DM channels")
		return
	}
	if ch.Visibility != "public" {
		writeJSONError(w,http.StatusForbidden, "Cannot join private channels")
		return
	}

	h.Store.AddChannelMember(&store.ChannelMember{ChannelID: channelID, UserID: user.ID})
	writeJSONResponse(w,http.StatusOK, map[string]any{"ok": true})

	h.Store.CreateEvent(&store.Event{
		Kind:      "user_joined",
		ChannelID: channelID,
		Payload:   mustJSON(map[string]any{"channel_id": channelID, "user_id": user.ID}),
	})
	if h.Hub != nil {
		h.Hub.BroadcastEventToChannel(channelID, "user_joined", map[string]any{"channel_id": channelID, "user_id": user.ID})
	}
}

func (h *ChannelHandler) handleLeaveChannel(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w,http.StatusUnauthorized, "Unauthorized")
		return
	}

	channelID := r.PathValue("channelId")
	ch, err := h.Store.GetChannelByID(channelID)
	if err != nil {
		writeJSONError(w,http.StatusNotFound, "Channel not found")
		return
	}

	if ch.Type == "dm" {
		writeJSONError(w,http.StatusBadRequest, "Cannot leave DM channels")
		return
	}
	if ch.Name == "general" {
		writeJSONError(w,http.StatusBadRequest, "Cannot leave #general")
		return
	}

	h.Store.RemoveChannelMember(channelID, user.ID)
	writeJSONResponse(w,http.StatusOK, map[string]any{"ok": true})

	h.Store.CreateEvent(&store.Event{
		Kind:      "user_left",
		ChannelID: channelID,
		Payload:   mustJSON(map[string]any{"channel_id": channelID, "user_id": user.ID}),
	})
	if h.Hub != nil {
		h.Hub.BroadcastEventToChannel(channelID, "user_left", map[string]any{"channel_id": channelID, "user_id": user.ID})
	}
}

func (h *ChannelHandler) handleAddMember(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w,http.StatusUnauthorized, "Unauthorized")
		return
	}

	channelID := r.PathValue("channelId")
	ch, err := h.Store.GetChannelByID(channelID)
	if err != nil {
		writeJSONError(w,http.StatusNotFound, "Channel not found")
		return
	}

	if ch.Type == "dm" {
		writeJSONError(w,http.StatusBadRequest, "Cannot add members to DM channels")
		return
	}

	var body struct {
		UserID string `json:"user_id"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSONError(w,http.StatusBadRequest, err.Error())
		return
	}
	if body.UserID == "" {
		writeJSONError(w,http.StatusBadRequest, "user_id is required")
		return
	}

	target, err := h.Store.GetUserByID(body.UserID)
	if err != nil {
		writeJSONError(w,http.StatusNotFound, "User not found")
		return
	}

	if target.Role == "agent" && user.Role != "admin" && (user.OwnerID == nil || *user.OwnerID != target.ID) {
		if user.Role != "admin" {
			isOwner := target.OwnerID != nil && *target.OwnerID == user.ID
			if !isOwner {
				writeJSONError(w,http.StatusForbidden, "Only owner or admin can add agents")
				return
			}
		}
	}

	h.Store.AddChannelMember(&store.ChannelMember{ChannelID: channelID, UserID: body.UserID})
	writeJSONResponse(w,http.StatusOK, map[string]any{"ok": true})

	h.Store.CreateEvent(&store.Event{
		Kind:      "user_joined",
		ChannelID: channelID,
		Payload:   mustJSON(map[string]any{"channel_id": channelID, "user_id": body.UserID}),
	})
	if h.Hub != nil {
		h.Hub.BroadcastEventToChannel(channelID, "user_joined", map[string]any{"channel_id": channelID, "user_id": body.UserID})
		h.Hub.BroadcastEventToUser(body.UserID, "channel_added", map[string]any{"channel_id": channelID})
	}
}

func (h *ChannelHandler) handleRemoveMember(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w,http.StatusUnauthorized, "Unauthorized")
		return
	}

	channelID := r.PathValue("channelId")
	targetID := r.PathValue("userId")

	ch, err := h.Store.GetChannelByID(channelID)
	if err != nil {
		writeJSONError(w,http.StatusNotFound, "Channel not found")
		return
	}

	if ch.Name == "general" {
		writeJSONError(w,http.StatusBadRequest, "Cannot remove members from #general")
		return
	}

	if targetID != user.ID {
		if !h.hasChannelPermission(user, "channel.manage_members", channelID) {
			writeJSONError(w,http.StatusForbidden, "Forbidden")
			return
		}
	}

	h.Store.RemoveChannelMember(channelID, targetID)
	writeJSONResponse(w,http.StatusOK, map[string]any{"ok": true})

	h.Store.CreateEvent(&store.Event{
		Kind:      "user_left",
		ChannelID: channelID,
		Payload:   mustJSON(map[string]any{"channel_id": channelID, "user_id": targetID}),
	})
	if h.Hub != nil {
		h.Hub.BroadcastEventToChannel(channelID, "user_left", map[string]any{"channel_id": channelID, "user_id": targetID})
		h.Hub.BroadcastEventToUser(targetID, "channel_removed", map[string]any{"channel_id": channelID})
	}
}

func (h *ChannelHandler) handleListMembers(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w,http.StatusUnauthorized, "Unauthorized")
		return
	}

	channelID := r.PathValue("channelId")
	if !h.Store.CanAccessChannel(channelID, user.ID) {
		writeJSONError(w,http.StatusNotFound, "Channel not found")
		return
	}

	members, err := h.Store.GetChannelDetail(channelID)
	if err != nil {
		writeJSONError(w,http.StatusInternalServerError, "Failed to list members")
		return
	}
	if members == nil {
		members = []store.ChannelMemberInfo{}
	}

	writeJSONResponse(w,http.StatusOK, map[string]any{"members": members})
}

func (h *ChannelHandler) handleMarkRead(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w,http.StatusUnauthorized, "Unauthorized")
		return
	}

	channelID := r.PathValue("channelId")
	if !h.Store.IsChannelMember(channelID, user.ID) {
		writeJSONError(w,http.StatusForbidden, "Must be a channel member")
		return
	}

	if err := h.Store.MarkChannelRead(channelID, user.ID); err != nil {
		writeJSONError(w,http.StatusInternalServerError, "Failed to mark read")
		return
	}

	writeJSONResponse(w,http.StatusOK, map[string]any{"ok": true})
}

func (h *ChannelHandler) handleDeleteChannel(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w,http.StatusUnauthorized, "Unauthorized")
		return
	}

	channelID := r.PathValue("channelId")
	ch, err := h.Store.GetChannelByID(channelID)
	if err != nil {
		writeJSONError(w,http.StatusNotFound, "Channel not found")
		return
	}

	if ch.Type == "dm" {
		writeJSONError(w,http.StatusBadRequest, "Cannot delete DM channels")
		return
	}
	if ch.Name == "general" {
		writeJSONError(w,http.StatusBadRequest, "Cannot delete #general")
		return
	}

	if err := h.Store.SoftDeleteChannel(channelID); err != nil {
		writeJSONError(w,http.StatusInternalServerError, "Failed to delete channel")
		return
	}

	scope := fmt.Sprintf("channel:%s", channelID)
	h.Store.DeletePermissionsByScope(scope)

	h.Store.CreateEvent(&store.Event{
		Kind:      "channel_deleted",
		ChannelID: channelID,
		Payload:   mustJSON(map[string]any{"channel_id": channelID}),
	})
	if h.Hub != nil {
		h.Hub.BroadcastEventToAll("channel_deleted", map[string]any{"channel_id": channelID})
	}

	writeJSONResponse(w,http.StatusOK, map[string]any{"ok": true})
}

func (h *ChannelHandler) handleReorderChannel(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w,http.StatusUnauthorized, "Unauthorized")
		return
	}

	if user.Role != "admin" {
		ch, _ := h.Store.GetChannelByID("")
		_ = ch
		perms, _ := h.Store.ListUserPermissions(user.ID)
		isOwner := false
		for _, p := range perms {
			if p.Permission == "channel.manage_visibility" && p.Scope == "*" {
				isOwner = true
				break
			}
		}
		if !isOwner && user.Role != "admin" {
			writeJSONError(w,http.StatusForbidden, "Forbidden")
			return
		}
	}

	var body struct {
		ChannelID string  `json:"channel_id"`
		AfterID   *string `json:"after_id"`
		GroupID   *string `json:"group_id"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSONError(w,http.StatusBadRequest, err.Error())
		return
	}
	if body.ChannelID == "" {
		writeJSONError(w,http.StatusBadRequest, "channel_id is required")
		return
	}

	before, after, err := h.Store.GetAdjacentChannelPositions(body.AfterID, body.GroupID)
	if err != nil {
		writeJSONError(w,http.StatusInternalServerError, "Failed to calculate position")
		return
	}

	position := store.GenerateRankBetween(before, after)
	if err := h.Store.UpdateChannelPosition(body.ChannelID, position, body.GroupID); err != nil {
		writeJSONError(w,http.StatusInternalServerError, "Failed to reorder channel")
		return
	}

	writeJSONResponse(w,http.StatusOK, map[string]any{
		"channel": map[string]any{"id": body.ChannelID, "position": position, "group_id": body.GroupID},
	})

	h.Store.CreateEvent(&store.Event{
		Kind:    "channels_reordered",
		Payload: mustJSON(map[string]any{"channel_id": body.ChannelID, "position": position, "group_id": body.GroupID}),
	})
	if h.Hub != nil {
		h.Hub.BroadcastEventToAll("channels_reordered", map[string]any{"channel_id": body.ChannelID, "position": position, "group_id": body.GroupID})
	}
}

// ─── Channel Groups ───────────────────────────────────

func (h *ChannelHandler) handleListGroups(w http.ResponseWriter, r *http.Request) {
	groups, err := h.Store.ListChannelGroups()
	if err != nil {
		writeJSONError(w,http.StatusInternalServerError, "Failed to list groups")
		return
	}
	if groups == nil {
		groups = []store.ChannelGroup{}
	}
	writeJSONResponse(w,http.StatusOK, map[string]any{"groups": groups})
}

func (h *ChannelHandler) handleCreateGroup(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w,http.StatusUnauthorized, "Unauthorized")
		return
	}

	var body struct {
		Name string `json:"name"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSONError(w,http.StatusBadRequest, err.Error())
		return
	}

	name := strings.TrimSpace(body.Name)
	if name == "" {
		writeJSONError(w,http.StatusBadRequest, "Group name is required")
		return
	}
	if len(name) > 50 {
		writeJSONError(w,http.StatusBadRequest, "Group name must be 50 characters or less")
		return
	}

	lastPos := h.Store.GetLastGroupPosition()
	position := store.GenerateRankBetween(lastPos, "")

	group := &store.ChannelGroup{
		Name:      name,
		Position:  position,
		CreatedBy: user.ID,
	}
	if err := h.Store.CreateChannelGroup(group); err != nil {
		writeJSONError(w,http.StatusInternalServerError, "Failed to create group")
		return
	}

	if h.Hub != nil {
		h.Hub.BroadcastEventToAll("group_created", map[string]any{"group": group})
	}

	h.Store.CreateEvent(&store.Event{
		Kind:    "group_created",
		Payload: mustJSON(map[string]any{"group": group}),
	})

	writeJSONResponse(w,http.StatusCreated, map[string]any{"group": group})
}

func (h *ChannelHandler) handleUpdateGroup(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w,http.StatusUnauthorized, "Unauthorized")
		return
	}

	groupID := r.PathValue("groupId")
	group, err := h.Store.GetChannelGroup(groupID)
	if err != nil {
		writeJSONError(w,http.StatusNotFound, "Group not found")
		return
	}

	if group.CreatedBy != user.ID && user.Role != "admin" {
		writeJSONError(w,http.StatusForbidden, "Only the group creator can rename it")
		return
	}

	var body struct {
		Name string `json:"name"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSONError(w,http.StatusBadRequest, err.Error())
		return
	}

	name := strings.TrimSpace(body.Name)
	if name == "" {
		writeJSONError(w,http.StatusBadRequest, "Group name is required")
		return
	}
	if len(name) > 50 {
		writeJSONError(w,http.StatusBadRequest, "Group name must be 50 characters or less")
		return
	}

	if err := h.Store.UpdateChannelGroup(groupID, name); err != nil {
		writeJSONError(w,http.StatusInternalServerError, "Failed to update group")
		return
	}

	group.Name = name
	writeJSONResponse(w,http.StatusOK, map[string]any{"group": group})

	if h.Hub != nil {
		h.Hub.BroadcastEventToAll("group_updated", map[string]any{"group": group})
	}

	h.Store.CreateEvent(&store.Event{
		Kind:    "group_updated",
		Payload: mustJSON(map[string]any{"group": group}),
	})
}

func (h *ChannelHandler) handleDeleteGroup(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w,http.StatusUnauthorized, "Unauthorized")
		return
	}

	groupID := r.PathValue("groupId")
	group, err := h.Store.GetChannelGroup(groupID)
	if err != nil {
		writeJSONError(w,http.StatusNotFound, "Group not found")
		return
	}

	if group.CreatedBy != user.ID && user.Role != "admin" {
		writeJSONError(w,http.StatusForbidden, "Only the group creator can delete it")
		return
	}

	ungroupedIDs, err := h.Store.UngroupChannels(groupID)
	if err != nil {
		writeJSONError(w,http.StatusInternalServerError, "Failed to ungroup channels")
		return
	}

	if err := h.Store.DeleteChannelGroup(groupID); err != nil {
		writeJSONError(w,http.StatusInternalServerError, "Failed to delete group")
		return
	}

	if ungroupedIDs == nil {
		ungroupedIDs = []string{}
	}

	if h.Hub != nil {
		h.Hub.BroadcastEventToAll("group_deleted", map[string]any{"group_id": groupID})
	}

	h.Store.CreateEvent(&store.Event{
		Kind:    "group_deleted",
		Payload: mustJSON(map[string]any{"group_id": groupID}),
	})

	writeJSONResponse(w,http.StatusOK, map[string]any{"ok": true, "ungrouped_channel_ids": ungroupedIDs})
}

func (h *ChannelHandler) handleReorderGroup(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w,http.StatusUnauthorized, "Unauthorized")
		return
	}

	var body struct {
		GroupID string  `json:"group_id"`
		AfterID *string `json:"after_id"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSONError(w,http.StatusBadRequest, err.Error())
		return
	}
	if body.GroupID == "" {
		writeJSONError(w,http.StatusBadRequest, "group_id is required")
		return
	}

	group, err := h.Store.GetChannelGroup(body.GroupID)
	if err != nil {
		writeJSONError(w,http.StatusNotFound, "Group not found")
		return
	}

	if group.CreatedBy != user.ID && user.Role != "admin" {
		writeJSONError(w,http.StatusForbidden, "Only the group creator can reorder")
		return
	}

	before, after, err := h.Store.GetAdjacentGroupPositions(body.AfterID)
	if err != nil {
		writeJSONError(w,http.StatusInternalServerError, "Failed to calculate position")
		return
	}

	position := store.GenerateRankBetween(before, after)
	if err := h.Store.UpdateGroupPosition(body.GroupID, position); err != nil {
		writeJSONError(w,http.StatusInternalServerError, "Failed to reorder group")
		return
	}

	group.Position = position
	writeJSONResponse(w,http.StatusOK, map[string]any{"group": group})

	h.Store.CreateEvent(&store.Event{
		Kind:    "groups_reordered",
		Payload: mustJSON(map[string]any{"group": group}),
	})
	if h.Hub != nil {
		h.Hub.BroadcastEventToAll("groups_reordered", map[string]any{"group": group})
	}
}

// ─── Helpers ──────────────────────────────────────────

func (h *ChannelHandler) hasChannelPermission(user *store.User, permission, channelID string) bool {
	if user.Role == "admin" {
		return true
	}
	perms, err := h.Store.ListUserPermissions(user.ID)
	if err != nil {
		return false
	}
	scope := fmt.Sprintf("channel:%s", channelID)
	for _, p := range perms {
		if p.Permission == permission && (p.Scope == "*" || p.Scope == scope) {
			return true
		}
	}
	return false
}
