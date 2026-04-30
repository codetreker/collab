// Package server — TEST-FIX-3-COV: cover 0% adapter push functions
// + SetClock by direct method invocation (no http traffic needed).
package server

import (
	"testing"
	"time"

	"borgee-server/internal/testutil/clock"
)

// newCovHub2 reuses newCovTestHub (defined in adapter_cov_test.go) shape.
// We bind locally to avoid name collision; both tests are in same package.

func TestHubArtifactAdapter_PushArtifactUpdated(t *testing.T) {
	t.Parallel()
	hub, _ := newCovTestHub(t)
	a := &hubArtifactAdapter{hub: hub}
	cursor, sent := a.PushArtifactUpdated("art-1", 1, "ch-1", time.Now().UnixMilli(), "doc")
	_ = cursor
	_ = sent
}

func TestHubAnchorAdapter_PushAnchorCommentAdded(t *testing.T) {
	t.Parallel()
	hub, _ := newCovTestHub(t)
	a := &hubAnchorAdapter{hub: hub}
	cursor, sent := a.PushAnchorCommentAdded(
		"anch-1", 1, "art-1", 1, "ch-1",
		"author-x", "human", time.Now().UnixMilli(),
	)
	_ = cursor
	_ = sent
}

func TestHubArtifactCommentAdapter_PushArtifactCommentAdded(t *testing.T) {
	t.Parallel()
	hub, _ := newCovTestHub(t)
	a := &hubArtifactCommentAdapter{hub: hub}
	cursor, sent := a.PushArtifactCommentAdded(
		"cmt-1", "art-1", "ch-1", "sender-x", "human", "preview", time.Now().UnixMilli(),
	)
	_ = cursor
	_ = sent
}

func TestHubIterationAdapter_PushIterationStateChanged(t *testing.T) {
	t.Parallel()
	hub, _ := newCovTestHub(t)
	a := &hubIterationAdapter{hub: hub}
	cursor, sent := a.PushIterationStateChanged(
		"iter-1", "art-1", "ch-1", "completed", "", 1, time.Now().UnixMilli(),
	)
	_ = cursor
	_ = sent
}

func TestServer_SetClock(t *testing.T) {
	t.Parallel()
	// Construct a Server directly to exercise SetClock — we don't need
	// the full server.New() boot, just a shell with the authHandler field
	// nil-safe. SetClock with a *clock.Fake; subsequent assignment must
	// not panic.
	s := &Server{}
	fake := clock.NewFake(time.Now())
	s.SetClock(fake)
	if s.clk == nil {
		t.Fatal("SetClock: clk not set")
	}
	// authHandler nil branch — function must early-skip the inner if.
}
