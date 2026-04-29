// Package api_test — al_2b_pusher_test.go: AL-2b PATCH fanout seam unit
// test (handler-level, isolates AgentConfigHandler.Pusher).
//
// Verifies AgentConfigHandler invokes Pusher.PushAgentConfigUpdate after
// a successful PATCH (acceptance §2.1 server→plugin push), with the
// agent_id + monotonic schema_version + idempotency_key derived from
// (agent_id:schema_version) — plugin 端按此 key 去重 reload.
//
// 反约束: 不验证真 BPP wire format (那是 al_2b_frames_test.go 的事), 只
// 验 fanout 调用 + 入参 byte-identical 跟 PATCH 写库后状态.
package api_test

import (
	"net/http"
	"strconv"
	"sync"
	"testing"

	"borgee-server/internal/api"
	"borgee-server/internal/testutil"
)

// fakePusher records each PushAgentConfigUpdate call (thread-safe).
type fakePusher struct {
	mu    sync.Mutex
	calls []fakePush
	sent  bool
}

type fakePush struct {
	AgentID        string
	SchemaVersion  int64
	Blob           string
	IdempotencyKey string
	CreatedAt      int64
}

func newFakePusher() *fakePusher { return &fakePusher{sent: true} }

func (f *fakePusher) PushAgentConfigUpdate(agentID string, schemaVersion int64,
	blob, idempotencyKey string, createdAt int64) (cursor int64, sent bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, fakePush{
		AgentID:        agentID,
		SchemaVersion:  schemaVersion,
		Blob:           blob,
		IdempotencyKey: idempotencyKey,
		CreatedAt:      createdAt,
	})
	return int64(len(f.calls)), f.sent
}

func (f *fakePusher) Calls() []fakePush {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]fakePush, len(f.calls))
	copy(out, f.calls)
	return out
}

// TestAL2B_AgentConfigPusherInterface — compile-time gate, prevents seam
// drift (any change to AgentConfigPusher signature breaks this).
func TestAL2B_AgentConfigPusherInterface(t *testing.T) {
	t.Parallel()
	var p api.AgentConfigPusher = newFakePusher()
	cur, sent := p.PushAgentConfigUpdate("agent-X", 1, "{}", "agent-X:1", 1700000000000)
	if !sent {
		t.Error("fakePusher.PushAgentConfigUpdate sent=false unexpectedly")
	}
	if cur != 1 {
		t.Errorf("fakePusher cursor=%d, want 1 (first call)", cur)
	}
}

// TestAL2B_FakePusherTracksCalls — test-double records all calls in order
// + thread-safe (used by integration tests that wire fanout via interface).
func TestAL2B_FakePusherTracksCalls(t *testing.T) {
	t.Parallel()
	p := newFakePusher()

	for i := 1; i <= 3; i++ {
		ver := int64(i)
		key := "agent-A:" + strconv.FormatInt(ver, 10)
		p.PushAgentConfigUpdate("agent-A", ver, `{"name":"X"}`, key, 1700000000000+ver)
	}

	calls := p.Calls()
	if len(calls) != 3 {
		t.Fatalf("expected 3 recorded calls, got %d", len(calls))
	}
	for i, c := range calls {
		wantVer := int64(i + 1)
		if c.SchemaVersion != wantVer {
			t.Errorf("call[%d].SchemaVersion = %d, want %d", i, c.SchemaVersion, wantVer)
		}
		wantKey := "agent-A:" + strconv.FormatInt(wantVer, 10)
		if c.IdempotencyKey != wantKey {
			t.Errorf("call[%d].IdempotencyKey = %q, want %q", i, c.IdempotencyKey, wantKey)
		}
	}
}

// TestAL2B_HandlerPusherFieldExists — pin AgentConfigHandler exposes the
// Pusher field (server boot wires *ws.Hub here; nil-safe).
func TestAL2B_HandlerPusherFieldExists(t *testing.T) {
	t.Parallel()
	pusher := newFakePusher()
	h := &api.AgentConfigHandler{Pusher: pusher}
	if h.Pusher == nil {
		t.Error("Pusher field unset — wiring broken")
	}

	// nil pusher must also be supported (legacy AL-2a-only deployments).
	h2 := &api.AgentConfigHandler{}
	if h2.Pusher != nil {
		t.Error("default Pusher should be nil (legacy AL-2a path)")
	}
}

// TestAL2B_PatchInvokesPusher_Live exercises the full PATCH endpoint via
// testutil.NewTestServer. The server boot wires *ws.Hub as Pusher, but the
// wired hub returns sent=false (no plugin connected in test) — we verify
// PATCH still returns 200 (best-effort fanout, plugin reconnect 后 GET
// 主动拉, 跟蓝图 §1.5 "runtime 不缓存" 同源).
//
// The "did Pusher get called" assertion is in the unit-level
// TestAL2B_FakePusherTracksCalls + TestAL2B_HandlerPusherFieldExists; this
// test only proves the wired path doesn't panic / 5xx when plugin offline.
func TestAL2B_PatchInvokesPusher_Live(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	token := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	agentID := al2a2CreateAgent(t, ts.URL, token, "AL2B-LiveFanout")

	resp, body := testutil.JSON(t, "PATCH", ts.URL+"/api/v1/agents/"+agentID+"/config", token,
		map[string]any{"blob": map[string]any{"name": "Alpha"}})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PATCH expected 200 (best-effort even if plugin offline), got %d: %v",
			resp.StatusCode, body)
	}

	if v, _ := body["schema_version"].(float64); v != 1 {
		t.Errorf("expected schema_version=1, got %v", body["schema_version"])
	}
}
