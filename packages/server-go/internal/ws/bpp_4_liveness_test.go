// Package ws — bpp_4_liveness_test.go: BPP-4 hub.SnapshotPluginLastSeen +
// PluginConn.LastSeen + PluginConn.touchLastSeen coverage. Used by
// bpp.HeartbeatWatchdog via hubLivenessAdapter (server-boot wire).
package ws

import (
	"io"
	"log/slog"
	"testing"
	"time"

	"borgee-server/internal/store"
)

func TestBPP4_PluginConn_LastSeenInitial(t *testing.T) {
	t.Parallel()
	pc := NewTestPluginConn("agent-1")
	first := pc.LastSeen()
	if first.IsZero() {
		t.Errorf("expected lastSeenAt initialized to non-zero, got zero")
	}
}

func TestBPP4_PluginConn_TouchLastSeen(t *testing.T) {
	t.Parallel()
	pc := NewTestPluginConn("agent-1")
	first := pc.LastSeen()
	time.Sleep(2 * time.Millisecond)
	pc.touchLastSeen()
	second := pc.LastSeen()
	if !second.After(first) {
		t.Errorf("touchLastSeen should advance lastSeenAt: first=%v second=%v",
			first, second)
	}
}

func TestBPP4_Hub_SnapshotPluginLastSeen_Empty(t *testing.T) {
	t.Parallel()
	h := &Hub{plugins: map[string]*PluginConn{}}
	snap := h.SnapshotPluginLastSeen()
	if len(snap) != 0 {
		t.Errorf("expected empty snapshot, got %d entries", len(snap))
	}
}

func TestBPP4_Hub_SnapshotPluginLastSeen_TwoPlugins(t *testing.T) {
	t.Parallel()
	pc1 := NewTestPluginConn("agent-1")
	pc2 := NewTestPluginConn("agent-2")
	h := &Hub{plugins: map[string]*PluginConn{
		"agent-1": pc1,
		"agent-2": pc2,
	}}
	snap := h.SnapshotPluginLastSeen()
	if len(snap) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(snap))
	}
	if snap["agent-1"].IsZero() || snap["agent-2"].IsZero() {
		t.Errorf("expected non-zero lastSeenAt for both agents: %+v", snap)
	}
}

// TestBPP4_Hub_PluginFrameRouterSnapshot_NilByDefault — covers
// pluginFrameRouterSnapshot 0% path (used by plugin.go BPP frame routing
// fallback; nil-safe in unit tests / early boot before SetPluginFrameRouter).
func TestBPP4_Hub_PluginFrameRouterSnapshot_NilByDefault(t *testing.T) {
	t.Parallel()
	h := &Hub{}
	if got := h.pluginFrameRouterSnapshot(); got != nil {
		t.Errorf("expected nil router by default, got %v", got)
	}
}

// TestBPP4_Hub_PluginFrameRouterSnapshot_AfterSet — set + read round trip.
func TestBPP4_Hub_PluginFrameRouterSnapshot_AfterSet(t *testing.T) {
	t.Parallel()
	h := &Hub{}
	stub := &stubPluginFrameRouter{}
	h.SetPluginFrameRouter(stub)
	got := h.pluginFrameRouterSnapshot()
	if got != stub {
		t.Errorf("expected snapshot to return the set router, got %v", got)
	}
}

type stubPluginFrameRouter struct{}

func (s *stubPluginFrameRouter) Route(raw []byte, sess PluginSessionContext) (bool, error) {
	return false, nil
}

// TestBPP4_PushAgentConfigUpdate_DeadLetterPath_WithLogger — exercises
// the dead-letter call path when plugin is offline AND hub.logger is
// non-nil (real CI path). Coverage value: hits LogFrameDroppedPluginOffline
// + audit entry construction lines (98-116) explicitly.
//
// Note: lives in `package ws` (this file) to access unexported fields;
// the parallel `package ws_test` covers the same call from outside.
func TestBPP4_PushAgentConfigUpdate_DeadLetterPath_WithLogger(t *testing.T) {
	t.Parallel()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	s, err := store.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	h := &Hub{
		plugins: map[string]*PluginConn{},
		cursors: NewCursorAllocator(s),
		logger:  logger,
	}
	cur, sent := h.PushAgentConfigUpdate("agent-NOT-REGISTERED", 5,
		`{"name":"x"}`, "idem-DLQ", 1700000000000)
	if sent {
		t.Errorf("plugin offline → sent must be false")
	}
	if cur == 0 {
		t.Errorf("cursor still allocated even when plugin offline")
	}
}
