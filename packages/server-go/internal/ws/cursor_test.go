// Package ws — cursor_test.go: RT-1.1 (#269) acceptance pin for the
// monotonic cursor + (artifact_id, version) dedup contract.
//
// Each subtest maps 1:1 to an item in the spec acceptance list:
//
//   §1.1 (a) 100 并发 commit cursor 严格递增无重复 (race detector)
//             → TestCursorMonotonicUnderConcurrency
//   §1.1 (b) 重复 commit 同 cursor (fail-closed)
//             → TestCursorIdempotentSameArtifactVersion
//   §1.1 (c) restart 不回退 (fixture)
//             → TestCursorNoRollbackAfterRestart
//   §1.1 (d) frame 字段顺序 byte-identical (#237 envelope)
//             → TestArtifactUpdatedFrameFieldOrder
//
// Run with `-race` to exercise (a). The `go test ./internal/ws/...
// -race` invocation is the gate.

package ws_test

import (
	"encoding/json"
	"sync"
	"testing"

	"borgee-server/internal/store"
	"borgee-server/internal/ws"
)

func newAllocator(t *testing.T) (*ws.CursorAllocator, *store.Store) {
	t.Helper()
	s := store.MigratedStoreFromTemplate(t)
	t.Cleanup(func() { s.Close() })
	return ws.NewCursorAllocator(s), s
}

// (a) 100 并发 commit → strict monotonic, no duplicates. Run with -race.
func TestCursorMonotonicUnderConcurrency(t *testing.T) {
	t.Parallel()
	a, _ := newAllocator(t)

	const N = 100
	var wg sync.WaitGroup
	out := make([]int64, N)
	for i := 0; i < N; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			out[idx] = a.NextCursor()
		}(i)
	}
	wg.Wait()

	seen := make(map[int64]struct{}, N)
	var max int64
	for _, c := range out {
		if c <= 0 {
			t.Fatalf("non-positive cursor: %d", c)
		}
		if _, dup := seen[c]; dup {
			t.Fatalf("duplicate cursor: %d", c)
		}
		seen[c] = struct{}{}
		if c > max {
			max = c
		}
	}
	if int64(N) != int64(len(seen)) {
		t.Fatalf("want %d unique cursors, got %d", N, len(seen))
	}
	if max != int64(N) {
		t.Fatalf("max cursor want %d (1..N contiguous), got %d", N, max)
	}
}

// (b) Same (artifact_id, version) tuple → same cursor on re-emit;
// fresh=false on duplicates; concurrent racers also collapse.
func TestCursorIdempotentSameArtifactVersion(t *testing.T) {
	t.Parallel()
	a, _ := newAllocator(t)

	c1, fresh1 := a.AllocateForArtifact("art-A", 1)
	if !fresh1 {
		t.Fatal("first AllocateForArtifact must be fresh=true")
	}
	c2, fresh2 := a.AllocateForArtifact("art-A", 1)
	if fresh2 {
		t.Fatal("second AllocateForArtifact for same tuple must be fresh=false")
	}
	if c1 != c2 {
		t.Fatalf("idempotent re-emit must return same cursor; got %d != %d", c1, c2)
	}

	// Different version under same artifact → fresh allocation,
	// strictly greater cursor.
	c3, fresh3 := a.AllocateForArtifact("art-A", 2)
	if !fresh3 || c3 <= c1 {
		t.Fatalf("new version must allocate fresh > prior; c1=%d c3=%d fresh=%v", c1, c3, fresh3)
	}

	// Concurrent racers on the same tuple collapse to one cursor.
	var wg sync.WaitGroup
	const R = 32
	results := make([]int64, R)
	for i := 0; i < R; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			c, _ := a.AllocateForArtifact("art-B", 7)
			results[idx] = c
		}(i)
	}
	wg.Wait()
	first := results[0]
	for _, r := range results {
		if r != first {
			t.Fatalf("racing AllocateForArtifact must collapse to one cursor; got %d vs %d", r, first)
		}
	}
}

// (c) Restart fixture: prior `events` rows present → new allocator
// must seed past their MAX(cursor) so a restart never rolls back.
func TestCursorNoRollbackAfterRestart(t *testing.T) {
	t.Parallel()
	s, err := store.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	s.Migrate()

	// Pre-seed three events so events.cursor MAX = 3.
	for i := 0; i < 3; i++ {
		if err := s.CreateEvent(&store.Event{Kind: "artifact_updated", ChannelID: "ch1", Payload: "{}"}); err != nil {
			t.Fatal(err)
		}
	}
	max := s.GetLatestCursor()
	if max != 3 {
		t.Fatalf("fixture seed: want MAX cursor=3, got %d", max)
	}

	// Now spin up a fresh allocator (simulating restart) and confirm
	// the next handed-out cursor is strictly greater than the seeded
	// MAX — i.e. no rollback.
	a := ws.NewCursorAllocator(s)
	if peek := a.PeekCursor(); peek != 3 {
		t.Fatalf("post-restart head must seed from MAX(events.cursor); want 3 got %d", peek)
	}
	next := a.NextCursor()
	if next <= max {
		t.Fatalf("post-restart cursor must be > prior MAX; got %d <= %d", next, max)
	}
}

// (d) Frame field order byte-identical with #237 envelope template:
// the marshaled JSON keys appear in declaration order, and the field
// order matches the RT-1 spec §1.1: type, cursor, artifact_id,
// version, channel_id, updated_at, kind.
func TestArtifactUpdatedFrameFieldOrder(t *testing.T) {
	t.Parallel()
	frame := ws.ArtifactUpdatedFrame{
		Type:       ws.FrameTypeArtifactUpdated,
		Cursor:     42,
		ArtifactID: "art-X",
		Version:    7,
		ChannelID:  "ch-Y",
		UpdatedAt:  1700000000000,
		Kind:       "commit",
	}
	b, err := json.Marshal(&frame)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"type":"artifact_updated","cursor":42,"artifact_id":"art-X","version":7,"channel_id":"ch-Y","updated_at":1700000000000,"kind":"commit"}`
	if string(b) != want {
		t.Fatalf("frame byte-identity broken:\n got: %s\nwant: %s", string(b), want)
	}
}

// PushArtifactUpdated end-to-end: fresh emit returns sent=true with a
// fresh cursor; immediate re-emit of the same (artifact_id, version)
// returns sent=false with the SAME cursor so the wire is silent.
func TestHubPushArtifactUpdatedDedup(t *testing.T) {
	t.Parallel()
	hub, _ := setupTestHub(t)

	c1, sent1 := hub.PushArtifactUpdated("art-1", 1, "ch-1", 1700000000000, "commit")
	if !sent1 || c1 == 0 {
		t.Fatalf("first push must broadcast fresh frame; sent=%v cursor=%d", sent1, c1)
	}
	c2, sent2 := hub.PushArtifactUpdated("art-1", 1, "ch-1", 1700000000000, "commit")
	if sent2 {
		t.Fatal("re-emit of same (artifact_id, version) must NOT broadcast")
	}
	if c2 != c1 {
		t.Fatalf("re-emit must return same cursor; got %d != %d", c2, c1)
	}

	// New version → fresh broadcast, strictly greater cursor.
	c3, sent3 := hub.PushArtifactUpdated("art-1", 2, "ch-1", 1700000000001, "commit")
	if !sent3 || c3 <= c1 {
		t.Fatalf("new version must broadcast fresh; sent=%v c1=%d c3=%d", sent3, c1, c3)
	}
}
