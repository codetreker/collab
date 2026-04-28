// hub_presence_test.go — AL-3.2 lifecycle hook coverage.
//
// Pins the contract between the WS hub's Register / Unregister calls
// and the PresenceWriter write end (#310 schema, #277 read interface).
// Three invariants the al-3.md acceptance §2 + §301 spec brief AL-3.2
// row pin:
//
//   1. Register → TrackOnline(userID, sessionID, agentID); agent_id
//      writes through to the partial-index column when role=agent.
//   2. Unregister → TrackOffline(sessionID); multi-session last-wins
//      stays in the row layer, hub.onlineUsers map mirrors it.
//   3. Defer-driven Untrack survives panic / ctx-cancel / normal close
//      because the hub's Unregister is the only entry point — the WS
//      handler's `defer hub.Unregister(client)` chain catches all three.
package ws

import (
	"errors"
	"sync"
	"testing"

	"borgee-server/internal/store"
)

// fakePresenceWriter is a deterministic in-memory PresenceWriter used
// only in this test file. The real impl is `presence.SessionsTracker`
// (covered in internal/presence/tracker_test.go); here we want to see
// the *call shape* the hub produces, not re-test the SQL.
type fakePresenceWriter struct {
	mu       sync.Mutex
	online   map[string]string  // sessionID → userID (multi-session aware)
	agents   map[string]*string // sessionID → agentID copy
	online1x int                // count of TrackOnline calls
	off1x    int                // count of TrackOffline calls
	failNext error              // optional: force next op to fail
}

func newFakeWriter() *fakePresenceWriter {
	return &fakePresenceWriter{online: map[string]string{}, agents: map[string]*string{}}
}

func (f *fakePresenceWriter) TrackOnline(userID, sessionID string, agentID *string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.online1x++
	if f.failNext != nil {
		err := f.failNext
		f.failNext = nil
		return err
	}
	f.online[sessionID] = userID
	f.agents[sessionID] = agentID
	return nil
}

func (f *fakePresenceWriter) TrackOffline(sessionID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.off1x++
	delete(f.online, sessionID)
	delete(f.agents, sessionID)
	return nil
}

func (f *fakePresenceWriter) sessions(userID string) []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := []string{}
	for sid, uid := range f.online {
		if uid == userID {
			out = append(out, sid)
		}
	}
	return out
}

func (f *fakePresenceWriter) onlineCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.online)
}

// TestPresenceLifecycle_HumanRegisterTrackOnline pins the human path:
// Register fans into TrackOnline with sessionID set + agentID nil.
func TestPresenceLifecycle_HumanRegisterTrackOnline(t *testing.T) {
	hub, _ := newInternalHub(t)
	pw := newFakeWriter()
	hub.SetPresenceWriter(pw)

	c := &Client{
		userID:     "user-A",
		user:       &store.User{ID: "user-A", Role: "member"},
		sessionID:  "sess-1",
		agentID:    nil,
		send:       make(chan []byte, 1),
		subscribed: map[string]bool{},
	}
	hub.Register(c)
	defer hub.Unregister(c)

	if got := pw.onlineCount(); got != 1 {
		t.Fatalf("TrackOnline call count: got %d online rows, want 1", got)
	}
	if got := pw.sessions("user-A"); len(got) != 1 || got[0] != "sess-1" {
		t.Fatalf("sessions: got %v, want [sess-1]", got)
	}
	pw.mu.Lock()
	gotAgent := pw.agents["sess-1"]
	pw.mu.Unlock()
	if gotAgent != nil {
		t.Fatalf("human session must have nil agentID, got %v", gotAgent)
	}
}

// TestPresenceLifecycle_AgentRoleSetsAgentID pins #310 partial-index
// integration: a role="agent" Client carries agentID = userID, which
// flows into TrackOnline so DM-2.2 fallback's IsOnline(agent.id) path
// resolves via the partial index column.
func TestPresenceLifecycle_AgentRoleSetsAgentID(t *testing.T) {
	hub, _ := newInternalHub(t)
	pw := newFakeWriter()
	hub.SetPresenceWriter(pw)

	agentUserID := "agent-bot"
	a := agentUserID
	c := &Client{
		userID:     agentUserID,
		user:       &store.User{ID: agentUserID, Role: "agent"},
		sessionID:  "sess-bot",
		agentID:    &a,
		send:       make(chan []byte, 1),
		subscribed: map[string]bool{},
	}
	hub.Register(c)
	defer hub.Unregister(c)

	pw.mu.Lock()
	gotAgent := pw.agents["sess-bot"]
	pw.mu.Unlock()
	if gotAgent == nil || *gotAgent != agentUserID {
		t.Fatalf("agent session must propagate agentID; got %v, want %s", gotAgent, agentUserID)
	}
}

// TestPresenceLifecycle_MultiSessionLastWins pins the row-level
// invariant when N sessions for the same user race through the hub:
// closing all-but-one keeps the writer state non-empty for that user,
// matching #302 §2.2 (multi-end users stay online while any tab lives).
func TestPresenceLifecycle_MultiSessionLastWins(t *testing.T) {
	hub, _ := newInternalHub(t)
	pw := newFakeWriter()
	hub.SetPresenceWriter(pw)

	mk := func(sid string) *Client {
		return &Client{
			userID:     "user-A",
			user:       &store.User{ID: "user-A", Role: "member"},
			sessionID:  sid,
			send:       make(chan []byte, 1),
			subscribed: map[string]bool{},
		}
	}
	c1, c2, c3 := mk("sess-web"), mk("sess-mobile"), mk("sess-plugin")
	hub.Register(c1)
	hub.Register(c2)
	hub.Register(c3)
	if got := len(pw.sessions("user-A")); got != 3 {
		t.Fatalf("3 concurrent sessions: got %d rows, want 3", got)
	}
	hub.Unregister(c1)
	hub.Unregister(c2)
	if got := len(pw.sessions("user-A")); got != 1 {
		t.Fatalf("after closing 2/3: got %d rows, want 1 (last-wins)", got)
	}
	hub.Unregister(c3)
	if got := len(pw.sessions("user-A")); got != 0 {
		t.Fatalf("after closing all 3: got %d rows, want 0 (offline)", got)
	}
}

// TestPresenceLifecycle_DeferUntrackOnPanic pins the panic-safety
// invariant: a `defer hub.Unregister(c)` survives a panic in the
// surrounding handler so the row is cleaned up. This is the AL-3.2
// acceptance §2.1 row — without it, a panic mid-handler would leak
// presence_sessions rows until process restart.
func TestPresenceLifecycle_DeferUntrackOnPanic(t *testing.T) {
	hub, _ := newInternalHub(t)
	pw := newFakeWriter()
	hub.SetPresenceWriter(pw)

	c := &Client{
		userID:     "user-A",
		user:       &store.User{ID: "user-A", Role: "member"},
		sessionID:  "sess-panic",
		send:       make(chan []byte, 1),
		subscribed: map[string]bool{},
	}

	func() {
		defer func() { _ = recover() }()
		defer hub.Unregister(c)
		hub.Register(c)
		panic("simulated handler crash")
	}()

	if got := pw.onlineCount(); got != 0 {
		t.Fatalf("after panic, defer Unregister must drop the row; got %d online rows, want 0", got)
	}
	if pw.off1x != 1 {
		t.Fatalf("TrackOffline must be called exactly once via defer; got %d", pw.off1x)
	}
}

// TestPresenceLifecycle_TrackOnlineFailureDoesNotAbort pins the
// in-memory-vs-DB fallback policy: a transient writer error logs but
// does NOT prevent the hub's onlineUsers map from registering the
// client — live broadcast must keep working even if presence_sessions
// has a hiccup. Otherwise a DB stall would deny WS service entirely.
func TestPresenceLifecycle_TrackOnlineFailureDoesNotAbort(t *testing.T) {
	hub, _ := newInternalHub(t)
	pw := newFakeWriter()
	pw.failNext = errors.New("transient db error")
	hub.SetPresenceWriter(pw)

	c := &Client{
		userID:     "user-A",
		user:       &store.User{ID: "user-A", Role: "member"},
		sessionID:  "sess-fail",
		send:       make(chan []byte, 1),
		subscribed: map[string]bool{},
	}
	hub.Register(c)
	defer hub.Unregister(c)

	// Hub's in-memory state must still see the client.
	hub.mu.RLock()
	_, ok := hub.clients[c]
	hub.mu.RUnlock()
	if !ok {
		t.Fatal("Register must add client to in-memory hub state even when TrackOnline errors")
	}
}

// TestPresenceLifecycle_NilWriterIsNoop pins the unit-test path: a hub
// constructed without SetPresenceWriter (or before it's wired at boot)
// must not panic on Register / Unregister. Many existing tests in this
// package construct Hub via newInternalHub without a writer — they
// must keep passing.
func TestPresenceLifecycle_NilWriterIsNoop(t *testing.T) {
	hub, _ := newInternalHub(t)
	// no SetPresenceWriter call

	c := &Client{
		userID:     "user-A",
		user:       &store.User{ID: "user-A", Role: "member"},
		sessionID:  "sess-noop",
		send:       make(chan []byte, 1),
		subscribed: map[string]bool{},
	}
	hub.Register(c)   // must not panic
	hub.Unregister(c) // must not panic
}
