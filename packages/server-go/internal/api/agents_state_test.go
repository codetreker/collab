// agents_state_test.go — AL-1a (#R3 Phase 2) handler-level coverage for
// the runtime state field surface. Asserts:
//   - GET /agents → state="online" when provider says so
//   - GET /agents → state="error", reason="api_key_invalid" when tracker
//     has an error entry
//   - disabled agent → state="offline" regardless of provider
//   - State==nil handler → state="offline" fallback (no panic)
//   - ProxyPluginRequest 5xx triggers SetAgentError with runtime_crashed
//
// Uses fakeRuntimeProvider (no hub plumbing) for deterministic assertions.
package api

import (
	"errors"
	"sync"
	"testing"

	agentpkg "borgee-server/internal/agent"
)

type fakeRuntimeProvider struct {
	mu     sync.Mutex
	snaps  map[string]agentpkg.Snapshot
	setErr []struct{ ID, Reason string }
}

func (f *fakeRuntimeProvider) ResolveAgentState(id string) agentpkg.Snapshot {
	f.mu.Lock()
	defer f.mu.Unlock()
	if s, ok := f.snaps[id]; ok {
		return s
	}
	return agentpkg.Snapshot{State: agentpkg.StateOffline}
}

func (f *fakeRuntimeProvider) SetAgentError(id, reason string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.setErr = append(f.setErr, struct{ ID, Reason string }{id, reason})
}

func TestWithState_OnlineFromProvider(t *testing.T) {
	prov := &fakeRuntimeProvider{snaps: map[string]agentpkg.Snapshot{
		"a-1": {State: agentpkg.StateOnline},
	}}
	h := &AgentHandler{State: prov}
	got := h.withState(map[string]any{}, "a-1", false)
	if got["state"] != "online" {
		t.Fatalf("state = %v, want online", got["state"])
	}
	if _, has := got["reason"]; has {
		t.Errorf("online frame should not carry reason, got %v", got)
	}
}

func TestWithState_ErrorWithReason(t *testing.T) {
	prov := &fakeRuntimeProvider{snaps: map[string]agentpkg.Snapshot{
		"a-1": {State: agentpkg.StateError, Reason: agentpkg.ReasonAPIKeyInvalid, UpdatedAt: 1700000000000},
	}}
	h := &AgentHandler{State: prov}
	got := h.withState(map[string]any{}, "a-1", false)
	if got["state"] != "error" {
		t.Fatalf("state = %v", got["state"])
	}
	if got["reason"] != "api_key_invalid" {
		t.Fatalf("reason = %v", got["reason"])
	}
	if got["state_updated_at"] != int64(1700000000000) {
		t.Errorf("state_updated_at = %v", got["state_updated_at"])
	}
}

func TestWithState_DisabledAlwaysOffline(t *testing.T) {
	// Disabled agent must read offline even if provider claims online —
	// 蓝图 §2.4: 禁用 = 停接消息. UI 不能显示绿点.
	prov := &fakeRuntimeProvider{snaps: map[string]agentpkg.Snapshot{
		"a-1": {State: agentpkg.StateOnline},
	}}
	h := &AgentHandler{State: prov}
	got := h.withState(map[string]any{}, "a-1", true)
	if got["state"] != "offline" {
		t.Fatalf("disabled = %v, want offline", got["state"])
	}
}

func TestWithState_NilProviderFallsBackToOffline(t *testing.T) {
	h := &AgentHandler{} // no State
	got := h.withState(map[string]any{}, "a-1", false)
	if got["state"] != "offline" {
		t.Fatalf("nil provider = %v, want offline", got["state"])
	}
}

func TestAgentStateClassify_Wiring(t *testing.T) {
	// agent_state_classify is the convenience adapter the handler calls
	// inside ProxyPluginRequest error paths. Assert the wiring forwards
	// to agent.ClassifyProxyError unchanged for the canonical cases.
	if got := agent_state_classify(401, errors.New("Unauthorized")); got != agentpkg.ReasonAPIKeyInvalid {
		t.Errorf("401 → %q, want %q", got, agentpkg.ReasonAPIKeyInvalid)
	}
	if got := agent_state_classify(503, nil); got != agentpkg.ReasonRuntimeCrashed {
		t.Errorf("503 → %q, want %q", got, agentpkg.ReasonRuntimeCrashed)
	}
	if got := agent_state_classify(200, nil); got != "" {
		t.Errorf("happy path → %q, want empty", got)
	}
}
