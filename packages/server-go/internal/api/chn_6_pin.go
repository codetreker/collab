// Package api — chn_6_pin.go: CHN-6 channel pin/unpin REST endpoints.
//
// Blueprint: channel-model.md §3 layout per-user. Spec:
// docs/implementation/modules/chn-6-spec.md (战马D v0). 0 schema 改 —
// user_channel_layout 列复用 CHN-3.1 #410 既有, pin 状态走 position < 0
// 字面约定 + PinThreshold=0 双向锁 (server + client byte-identical).
//
// Public surface:
//   - (h *ChannelHandler) RegisterCHN6Routes(mux, authMw)
//
// 反约束 (chn-6-spec.md §0):
//   - 立场 ② owner-only — POST/DELETE /api/v1/channels/{channelId}/pin
//     user-rail authMw 必经; per-user (cm.user_id 跟 CHN-3.2 同精神);
//     admin god-mode **不挂 PATCH/POST** (反向 grep `admin.*pin\|
//     /admin-api/.*pin` 在 admin*.go 0 hit) — owner-only ACL 锁链
//     第 14 处.
//   - 立场 ③ pin 状态双源 — server PinThreshold=0 const + client
//     POSITION_PIN_THRESHOLD=0 byte-identical 双向锁.
//   - 立场 ⑥ AST 锁链延伸第 11 处 forbidden 3 token 0 hit.
package api

import (
	"net/http"
	"time"

	"borgee-server/internal/auth"
)

// PinThreshold is the byte-identical const that segregates pinned vs
// non-pinned channels in user_channel_layout.position. Channels with
// `position < PinThreshold` are pinned (server stamps `-(nowMs)` so
// ASC ordering naturally surfaces them at the top of the sidebar).
//
// 双向锁: 跟 packages/client/src/lib/pin.ts::POSITION_PIN_THRESHOLD
// byte-identical = 0. 改一处 = 改两处. 立场 ③ + content-lock §4.
const PinThreshold = 0.0

// IsPinned reports whether a user_channel_layout.position represents a
// pinned channel. Single-source predicate; 调用方禁止 inline 重写
// (反向 grep `position\s*<\s*0` 在 production 仅命中此函数 + filter).
func IsPinned(position float64) bool {
	return position < PinThreshold
}

// RegisterCHN6Routes wires POST + DELETE /api/v1/channels/{channelId}/pin
// behind authMw. user-rail only (no admin god-mode 路径; ADM-0 §1.3 红
// 线 + CHN-3.2 立场承袭). 立场 ②.
func (h *ChannelHandler) RegisterCHN6Routes(mux *http.ServeMux, authMw func(http.Handler) http.Handler) {
	mux.Handle("POST /api/v1/channels/{channelId}/pin",
		authMw(http.HandlerFunc(h.handlePinChannel)))
	mux.Handle("DELETE /api/v1/channels/{channelId}/pin",
		authMw(http.HandlerFunc(h.handleUnpinChannel)))
}

// handlePinChannel — POST /api/v1/channels/{channelId}/pin.
//
// Stamps user_channel_layout.position = -(nowMs) for (user, channel).
// 立场 ② owner-only (cm.user_id 走 IsChannelMember + DM reject byte-
// identical 跟 CHN-3.2 layout endpoint 同源).
func (h *ChannelHandler) handlePinChannel(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	channelID := r.PathValue("channelId")
	ch, err := h.Store.GetChannelByID(channelID)
	if err != nil || ch == nil {
		writeJSONError(w, http.StatusNotFound, "Channel not found")
		return
	}
	// DM 反 — DM 永不参与 layout 分组 (跟 CHN-3.2 错码 byte-identical).
	if ch.Type == "dm" {
		writeJSONErrorCode(w, http.StatusBadRequest, "layout.dm_not_grouped",
			"DM 不参与个人分组")
		return
	}
	if !h.Store.IsChannelMember(channelID, user.ID) {
		writeJSONError(w, http.StatusForbidden, "Forbidden")
		return
	}
	nowMs := time.Now().UnixMilli()
	// position = -(nowMs) — ASC asc 排序使最近 pin 在最顶 (跟 CHN-3.3
	// #415 单调小数模式互补).
	position := -float64(nowMs)
	if err := h.Store.PinChannelLayout(user.ID, channelID, position, nowMs); err != nil {
		if h.Logger != nil {
			h.Logger.Error("chn6.pin upsert", "error", err)
		}
		writeJSONError(w, http.StatusInternalServerError, "Failed to pin channel")
		return
	}
	writeJSONResponse(w, http.StatusOK, map[string]any{
		"channel_id": channelID,
		"position":   position,
		"pinned":     true,
	})
}

// handleUnpinChannel — DELETE /api/v1/channels/{channelId}/pin.
//
// Stamps user_channel_layout.position = max(positive)+1.0 (跟 CHN-3.3
// #415 client MIN-1.0 单调小数模式互补) so the channel returns to the
// non-pinned section. Idempotent — second call within the same instant
// returns 200 + position > 0.
func (h *ChannelHandler) handleUnpinChannel(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	channelID := r.PathValue("channelId")
	ch, err := h.Store.GetChannelByID(channelID)
	if err != nil || ch == nil {
		writeJSONError(w, http.StatusNotFound, "Channel not found")
		return
	}
	if ch.Type == "dm" {
		writeJSONErrorCode(w, http.StatusBadRequest, "layout.dm_not_grouped",
			"DM 不参与个人分组")
		return
	}
	if !h.Store.IsChannelMember(channelID, user.ID) {
		writeJSONError(w, http.StatusForbidden, "Forbidden")
		return
	}
	nowMs := time.Now().UnixMilli()
	position, err := h.Store.UnpinChannelLayout(user.ID, channelID, nowMs)
	if err != nil {
		if h.Logger != nil {
			h.Logger.Error("chn6.unpin upsert", "error", err)
		}
		writeJSONError(w, http.StatusInternalServerError, "Failed to unpin channel")
		return
	}
	writeJSONResponse(w, http.StatusOK, map[string]any{
		"channel_id": channelID,
		"position":   position,
		"pinned":     false,
	})
}
