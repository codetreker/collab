// Package ws — push_agent_invitation_test.go: RT-0 (#40) coverage for
// the push surface that drives the agent_invitation_{pending,decided}
// frames.
//
// Two layers:
//   - Schema lock: assert the JSON wire layout matches the client TS
//     interface in packages/client/src/types/ws-frames.ts (PR #218)
//     field-for-field. Adding/renaming a field on either side without
//     mirroring it here trips this test.
//   - Hub call: exercise PushAgentInvitation{Pending,Decided} against a
//     real Hub and assert (a) silent no-op on empty userID, (b) silent
//     no-op on absent online sessions, (c) SignalNewEvents fires.
package ws_test

import (
	"encoding/json"
	"sort"
	"testing"
	"time"

	"borgee-server/internal/ws"
)

func TestAgentInvitationPendingFrame_WireSchema(t *testing.T) {
	t.Parallel()
	frame := &ws.AgentInvitationPendingFrame{
		Type:            ws.FrameTypeAgentInvitationPending,
		InvitationID:    "inv-1",
		RequesterUserID: "user-r",
		AgentID:         "agent-1",
		ChannelID:       "ch-1",
		CreatedAt:       1700000000000,
		ExpiresAt:       1700000060000,
	}
	raw, err := json.Marshal(frame)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	want := []string{"type", "invitation_id", "requester_user_id", "agent_id", "channel_id", "created_at", "expires_at"}
	keys := make([]string, 0, len(got))
	for k := range got {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	sortedWant := append([]string(nil), want...)
	sort.Strings(sortedWant)
	if len(keys) != len(sortedWant) {
		t.Fatalf("frame keys mismatch: got %v want %v", keys, sortedWant)
	}
	for i := range keys {
		if keys[i] != sortedWant[i] {
			t.Fatalf("frame keys mismatch at %d: got %v want %v", i, keys, sortedWant)
		}
	}
	if got["type"] != "agent_invitation_pending" {
		t.Fatalf("type discriminator drift: %v", got["type"])
	}
}

func TestAgentInvitationPendingFrame_ZeroExpiresIsSentinel(t *testing.T) {
	t.Parallel()
	// Client TS interface (PR #218) marks expires_at REQUIRED. The
	// server must always emit the field — when no row-level expiry
	// was set we ship 0 as a sentinel rather than dropping the key
	// entirely. This keeps schema byte-identical with the TS side
	// (ws-frames.ts) so the BPP cutover stays "client handler 0 改".
	frame := &ws.AgentInvitationPendingFrame{
		Type:            ws.FrameTypeAgentInvitationPending,
		InvitationID:    "inv-1",
		RequesterUserID: "user-r",
		AgentID:         "agent-1",
		ChannelID:       "ch-1",
		CreatedAt:       1700000000000,
		// ExpiresAt left zero
	}
	raw, _ := json.Marshal(frame)
	var got map[string]any
	_ = json.Unmarshal(raw, &got)
	v, ok := got["expires_at"]
	if !ok {
		t.Fatalf("expected expires_at present (sentinel 0), got %v", got)
	}
	if n, _ := v.(float64); n != 0 {
		t.Fatalf("expected expires_at=0 sentinel, got %v", v)
	}
}

func TestAgentInvitationDecidedFrame_WireSchema(t *testing.T) {
	t.Parallel()
	frame := &ws.AgentInvitationDecidedFrame{
		Type:         ws.FrameTypeAgentInvitationDecided,
		InvitationID: "inv-1",
		State:        "approved",
		DecidedAt:    1700000005000,
	}
	raw, err := json.Marshal(frame)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	for _, k := range []string{"type", "invitation_id", "state", "decided_at"} {
		if _, ok := got[k]; !ok {
			t.Fatalf("missing key %q in %v", k, got)
		}
	}
	if got["type"] != "agent_invitation_decided" {
		t.Fatalf("type discriminator drift: %v", got["type"])
	}
}

func TestPushAgentInvitationPending_NilUserIsNoOp(t *testing.T) {
	t.Parallel()
	hub, _ := setupTestHub(t)
	// No clients registered, no userID — must not panic / block.
	hub.PushAgentInvitationPending("", &ws.AgentInvitationPendingFrame{
		Type:         ws.FrameTypeAgentInvitationPending,
		InvitationID: "inv-empty",
	})
	hub.PushAgentInvitationDecided("", &ws.AgentInvitationDecidedFrame{
		Type:         ws.FrameTypeAgentInvitationDecided,
		InvitationID: "inv-empty",
	})
}

func TestPushAgentInvitationPending_OfflineUserIsNoOp(t *testing.T) {
	t.Parallel()
	hub, _ := setupTestHub(t)
	// User has no live sessions — push must silently drop. Persisted
	// row remains source of truth.
	hub.PushAgentInvitationPending("user-offline", &ws.AgentInvitationPendingFrame{
		Type:         ws.FrameTypeAgentInvitationPending,
		InvitationID: "inv-offline",
	})
	hub.PushAgentInvitationDecided("user-offline", &ws.AgentInvitationDecidedFrame{
		Type:         ws.FrameTypeAgentInvitationDecided,
		InvitationID: "inv-offline-d",
	})
}

func TestPushAgentInvitationDecided_SignalsWaiters(t *testing.T) {
	t.Parallel()
	hub, _ := setupTestHub(t)
	ch := hub.SubscribeEvents()
	defer hub.UnsubscribeEvents(ch)

	// Push to an offline user still wakes /events long-poll waiters
	// (parity with BroadcastEventTo* — keeps fallback poll path alive).
	go hub.PushAgentInvitationDecided("user-offline", &ws.AgentInvitationDecidedFrame{
		Type:         ws.FrameTypeAgentInvitationDecided,
		InvitationID: "inv-1",
		State:        "approved",
		DecidedAt:    time.Now().UnixMilli(),
	})

	select {
	case <-ch:
		// ok
	case <-time.After(time.Second):
		t.Fatalf("PushAgentInvitationDecided did not signal event waiters")
	}
}
