package ws_test

import (
	"strings"
	"sync"
	"testing"

	"borgee-server/internal/ws"
)

// TestAL9_AuditEventFrameFieldOrder pins the 7-field byte-identical
// envelope: type/cursor/action_id/actor_id/action/target_user_id/created_at.
// Acceptance §1.3 + spec brief §1 AL-9.1.
func TestAL9_AuditEventFrameFieldOrder(t *testing.T) {
	hub, _ := setupTestHub(t)
	cur, sent := hub.PushAuditEvent("aid-1", "actor-1", "delete_channel", "user-1", 1700000000000)
	if !sent {
		t.Fatal("expected sent=true on fresh push")
	}
	if cur <= 0 {
		t.Fatalf("cursor should be positive, got %d", cur)
	}
	frames := hub.SnapshotAuditBuffer(0)
	if len(frames) != 1 {
		t.Fatalf("expected 1 frame, got %d", len(frames))
	}
	f := frames[0]
	if f.Type != "audit_event" {
		t.Errorf("Type = %q, want %q", f.Type, "audit_event")
	}
	if f.ActionID != "aid-1" {
		t.Errorf("ActionID = %q", f.ActionID)
	}
	if f.ActorID != "actor-1" {
		t.Errorf("ActorID = %q", f.ActorID)
	}
	if f.Action != "delete_channel" {
		t.Errorf("Action = %q", f.Action)
	}
	if f.TargetUserID != "user-1" {
		t.Errorf("TargetUserID = %q", f.TargetUserID)
	}
	if f.CreatedAt != 1700000000000 {
		t.Errorf("CreatedAt = %d", f.CreatedAt)
	}
}

// TestAL9_PushAuditEventNilCursorsSafe — when hub has no cursor allocator
// (test seam), push returns sent=false, no panic. 立场 ⑧ nil-safe.
func TestAL9_PushAuditEventNilCursorsSafe(t *testing.T) {
	hub := &ws.Hub{}
	cur, sent := hub.PushAuditEvent("a", "b", "delete_channel", "c", 0)
	if sent || cur != 0 {
		t.Errorf("nil cursors should give (0, false), got (%d, %v)", cur, sent)
	}
}

// TestAL9_SnapshotAuditBufferSinceFilter — buffer 走 cursor > since filter.
func TestAL9_SnapshotAuditBufferSinceFilter(t *testing.T) {
	hub, _ := setupTestHub(t)
	c1, _ := hub.PushAuditEvent("a1", "ac1", "delete_channel", "u1", 1)
	_, _ = hub.PushAuditEvent("a2", "ac2", "suspend_user", "u2", 2)
	_, _ = hub.PushAuditEvent("a3", "ac3", "change_role", "u3", 3)

	frames := hub.SnapshotAuditBuffer(c1)
	if len(frames) != 2 {
		t.Fatalf("expected 2 frames after cursor=%d, got %d", c1, len(frames))
	}
	if frames[0].ActionID != "a2" || frames[1].ActionID != "a3" {
		t.Errorf("frame order wrong: %v", frames)
	}
}

// TestAL9_PushAuditEventConcurrentMonotonic — 32 racers, cursors
// strictly monotonic + unique. Stance §2 立场 ② dedup.
func TestAL9_PushAuditEventConcurrentMonotonic(t *testing.T) {
	hub, _ := setupTestHub(t)
	const N = 32
	var wg sync.WaitGroup
	cursors := make([]int64, N)
	for i := 0; i < N; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			c, _ := hub.PushAuditEvent("aid", "actor", "delete_channel", "u", int64(i))
			cursors[i] = c
		}(i)
	}
	wg.Wait()
	seen := make(map[int64]bool)
	for _, c := range cursors {
		if seen[c] {
			t.Errorf("duplicate cursor %d", c)
		}
		seen[c] = true
	}
	if len(seen) != N {
		t.Errorf("expected %d unique cursors, got %d", N, len(seen))
	}
}

// TestAL9_AuditBufferCap200 — buffer caps at 200, oldest evicted FIFO.
func TestAL9_AuditBufferCap200(t *testing.T) {
	hub, _ := setupTestHub(t)
	for i := 0; i < 250; i++ {
		hub.PushAuditEvent("a", "ac", "delete_channel", "u", int64(i))
	}
	frames := hub.SnapshotAuditBuffer(0)
	if len(frames) != 200 {
		t.Errorf("expected cap=200 frames, got %d", len(frames))
	}
}

// TestAL9_FrameTypeAuditEventByteIdentical — discriminator literal lock
// (改 = 改三处: 此 const + client AuditLogStream type guard + content-lock §2).
func TestAL9_FrameTypeAuditEventByteIdentical(t *testing.T) {
	if ws.FrameTypeAuditEvent != "audit_event" {
		t.Errorf("FrameTypeAuditEvent drift: %q", ws.FrameTypeAuditEvent)
	}
}

// TestAL9_NoLegacyEnvelopeNames — reverse grep equivalent: ensure we did
// not drift to legacy envelope names (`audit_event_v2` / `audit_stream` /
// `admin_actions_event`). Spec brief §3 反向 grep #2.
func TestAL9_NoLegacyEnvelopeNames(t *testing.T) {
	for _, bad := range []string{"audit_event_v2", "audit_stream", "admin_actions_event"} {
		if strings.Contains(ws.FrameTypeAuditEvent, bad) {
			t.Errorf("FrameTypeAuditEvent contains banned literal %q", bad)
		}
	}
}
