// Package bpp — heartbeat_watchdog_test.go: BPP-4.1 watchdog unit
// tests (5 case, 跟 acceptance §1 验收 4 项 + stance §1+§2 守门同源).
package bpp

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"

	agentpkg "borgee-server/internal/agent"
)

// fakeLivenessSource — manual control of the lastSeenAt snapshot for
// fake-clock tick simulation.
type fakeLivenessSource struct {
	mu   sync.Mutex
	snap map[string]time.Time
}

func (f *fakeLivenessSource) SnapshotLastSeen() map[string]time.Time {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make(map[string]time.Time, len(f.snap))
	for k, v := range f.snap {
		out[k] = v
	}
	return out
}

func (f *fakeLivenessSource) set(agentID string, t time.Time) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.snap == nil {
		f.snap = make(map[string]time.Time)
	}
	f.snap[agentID] = t
}

// recordingErrorSink captures SetError calls for assertion (不调真
// agent.Tracker, 隔离 watchdog scope).
type recordingErrorSink struct {
	mu    sync.Mutex
	calls []errorCall
}

type errorCall struct {
	agentID string
	reason  string
}

func (r *recordingErrorSink) SetError(agentID, reason string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.calls = append(r.calls, errorCall{agentID, reason})
}

func (r *recordingErrorSink) callsSnapshot() []errorCall {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]errorCall, len(r.calls))
	copy(out, r.calls)
	return out
}

// TestBPP4_Watchdog_ThresholdConstant — acceptance §1.1 单源 30s.
func TestBPP4_Watchdog_ThresholdConstant(t *testing.T) {
	t.Parallel()
	if BPP_HEARTBEAT_TIMEOUT_SECONDS != 30 {
		t.Errorf("BPP-4 single-source threshold drifted: got %d, want 30 "+
			"(改 = 改三处: 此常量 + bpp-4-spec.md §0.2 + bpp-4-content-lock.md §1.①)",
			BPP_HEARTBEAT_TIMEOUT_SECONDS)
	}
}

// TestBPP4_Watchdog_TriggersErrorOn30sTimeout — acceptance §1.2
// (watchdog 触发路径 = 调 AgentErrorSink.SetError, 不下 cancel/abort).
func TestBPP4_Watchdog_TriggersErrorOn30sTimeout(t *testing.T) {
	t.Parallel()
	src := &fakeLivenessSource{}
	sink := &recordingErrorSink{}
	w := NewHeartbeatWatchdog(src, sink, slog.Default())

	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	w.now = func() time.Time { return now }

	src.set("agent-stale", now.Add(-31*time.Second))
	src.set("agent-fresh", now.Add(-5*time.Second))

	w.scanOnce()

	calls := sink.callsSnapshot()
	if len(calls) != 1 {
		t.Fatalf("expected 1 SetError call, got %d: %+v", len(calls), calls)
	}
	if calls[0].agentID != "agent-stale" {
		t.Errorf("wrong agent flipped: %q", calls[0].agentID)
	}
	if calls[0].reason != agentpkg.ReasonNetworkUnreachable {
		t.Errorf("AL-1a 6-dict drift: reason=%q, want %q (BPP-4 第 9 处单测锁链)",
			calls[0].reason, agentpkg.ReasonNetworkUnreachable)
	}
}

// TestBPP4_Watchdog_NotSpammyOnRepeatedScan — markedErr 防重复 SetError.
func TestBPP4_Watchdog_NotSpammyOnRepeatedScan(t *testing.T) {
	t.Parallel()
	src := &fakeLivenessSource{}
	sink := &recordingErrorSink{}
	w := NewHeartbeatWatchdog(src, sink, slog.Default())

	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	w.now = func() time.Time { return now }

	src.set("agent-stale", now.Add(-31*time.Second))

	for i := 0; i < 5; i++ {
		w.scanOnce()
	}

	calls := sink.callsSnapshot()
	if len(calls) != 1 {
		t.Errorf("expected 1 SetError call (not spammy), got %d", len(calls))
	}
}

// TestBPP4_Watchdog_ReconnectClearsMarked — agent reconnects (lastSeenAt
// advances), watchdog removes from markedErr so the next disconnect
// cycle re-flips. 跟 acceptance §1.3 同链.
func TestBPP4_Watchdog_ReconnectClearsMarked(t *testing.T) {
	t.Parallel()
	src := &fakeLivenessSource{}
	sink := &recordingErrorSink{}
	w := NewHeartbeatWatchdog(src, sink, slog.Default())

	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	w.now = func() time.Time { return now }

	// First scan: stale, flip.
	src.set("agent-x", now.Add(-31*time.Second))
	w.scanOnce()
	if !w.markedErr["agent-x"] {
		t.Fatal("expected agent-x marked after first scan")
	}

	// Reconnect: lastSeenAt fresh.
	src.set("agent-x", now)
	w.scanOnce()
	if w.markedErr["agent-x"] {
		t.Errorf("expected agent-x cleared from markedErr after reconnect")
	}

	// Disconnect again: should re-flip (single SetError on second flip).
	w.now = func() time.Time { return now.Add(60 * time.Second) }
	src.set("agent-x", now.Add(-31*time.Second)) // 31s before original now = 91s before new now
	w.scanOnce()

	calls := sink.callsSnapshot()
	if len(calls) != 2 {
		t.Errorf("expected 2 SetError calls (flip → reconnect → re-flip), got %d", len(calls))
	}
}

// TestBPP4_Watchdog_MultiPluginIsolated — 多 plugin 隔离, 一个 stale
// 不影响其他 fresh.
func TestBPP4_Watchdog_MultiPluginIsolated(t *testing.T) {
	t.Parallel()
	src := &fakeLivenessSource{}
	sink := &recordingErrorSink{}
	w := NewHeartbeatWatchdog(src, sink, slog.Default())

	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	w.now = func() time.Time { return now }

	src.set("a1", now.Add(-31*time.Second)) // stale
	src.set("a2", now.Add(-10*time.Second)) // fresh
	src.set("a3", now.Add(-31*time.Second)) // stale

	w.scanOnce()

	calls := sink.callsSnapshot()
	if len(calls) != 2 {
		t.Fatalf("expected 2 stale flips, got %d", len(calls))
	}
	flipped := map[string]bool{}
	for _, c := range calls {
		flipped[c.agentID] = true
	}
	if !flipped["a1"] || !flipped["a3"] {
		t.Errorf("expected a1+a3 flipped, got %+v", flipped)
	}
	if flipped["a2"] {
		t.Errorf("a2 should NOT flip (fresh)")
	}
}

// TestBPP4_Watchdog_LogKeyOnTimeout — 反约束 acceptance §1.4 watchdog
// 触发 log key `bpp.heartbeat_timeout` (跟 dead_letter `bpp.frame_dropped_*`
// 同模式 — bpp.* prefix 锁).
func TestBPP4_Watchdog_LogKeyOnTimeout(t *testing.T) {
	t.Parallel()
	src := &fakeLivenessSource{}
	sink := &recordingErrorSink{}
	var buf bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo}))
	w := NewHeartbeatWatchdog(src, sink, logger)

	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	w.now = func() time.Time { return now }

	src.set("agent-z", now.Add(-31*time.Second))
	w.scanOnce()

	out := buf.String()
	if !strings.Contains(out, "bpp.heartbeat_timeout") {
		t.Errorf("missing log key bpp.heartbeat_timeout: %q", out)
	}
	if !strings.Contains(out, "reason=network_unreachable") {
		t.Errorf("missing AL-1a 6-dict reason in log: %q", out)
	}
}

// TestBPP4_NewHeartbeatWatchdog_PanicsOnNilSource — defense-in-depth.
func TestBPP4_NewHeartbeatWatchdog_PanicsOnNilSource(t *testing.T) {
	t.Parallel()
	defer func() {
		if recover() == nil {
			t.Errorf("expected panic on nil source")
		}
	}()
	NewHeartbeatWatchdog(nil, &recordingErrorSink{}, nil)
}

// TestBPP4_NewHeartbeatWatchdog_PanicsOnNilSink — defense-in-depth.
func TestBPP4_NewHeartbeatWatchdog_PanicsOnNilSink(t *testing.T) {
	t.Parallel()
	defer func() {
		if recover() == nil {
			t.Errorf("expected panic on nil sink")
		}
	}()
	NewHeartbeatWatchdog(&fakeLivenessSource{}, nil, nil)
}

// TestHeartbeatWatchdog_Run_CancelExits verifies Run returns when its ctx
// is canceled (deterministic, no timer reliance — uses a closed done chan
// pattern same as ws hub heartbeat tests).
func TestHeartbeatWatchdog_Run_CancelExits(t *testing.T) {
	t.Parallel()
	src := &fakeLivenessSource{}
	sink := &recordingErrorSink{}
	w := NewHeartbeatWatchdog(src, sink, slog.Default())

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		w.Run(ctx)
		close(done)
	}()
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not exit on ctx cancel")
	}
}
