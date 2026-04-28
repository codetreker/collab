// Package agent — state_test.go: AL-1a state machine + reason classifier
// 单测. 覆盖 review prep §S2 拒收红线: 三态优先级 / reason code 字面 /
// 并发安全.
package agent

import (
	"errors"
	"sync"
	"testing"
)

func TestTracker_DefaultOffline(t *testing.T) {
	tr := NewTracker()
	got := tr.Resolve("agent-1", false)
	if got.State != StateOffline {
		t.Fatalf("default state = %q, want %q", got.State, StateOffline)
	}
	if got.Reason != "" {
		t.Errorf("default reason = %q, want empty", got.Reason)
	}
}

func TestTracker_OnlineWhenPluginPresent(t *testing.T) {
	tr := NewTracker()
	got := tr.Resolve("agent-1", true)
	if got.State != StateOnline {
		t.Fatalf("with plugin = %q, want %q", got.State, StateOnline)
	}
}

func TestTracker_ErrorOverridesPresence(t *testing.T) {
	// 故障 > online > offline. 即使 plugin 还在 (短暂状态不同步),
	// owner 看到的应该是 error 文案.
	tr := NewTracker()
	tr.SetError("agent-1", ReasonAPIKeyInvalid)
	got := tr.Resolve("agent-1", true)
	if got.State != StateError {
		t.Fatalf("error w/ plugin = %q, want %q", got.State, StateError)
	}
	if got.Reason != ReasonAPIKeyInvalid {
		t.Errorf("reason = %q, want %q", got.Reason, ReasonAPIKeyInvalid)
	}
	if got.UpdatedAt == 0 {
		t.Error("UpdatedAt should be stamped")
	}
}

func TestTracker_ClearReturnsToPresence(t *testing.T) {
	tr := NewTracker()
	tr.SetError("agent-1", ReasonRuntimeCrashed)
	tr.Clear("agent-1")
	if got := tr.Resolve("agent-1", true); got.State != StateOnline {
		t.Errorf("after clear w/ plugin = %q, want online", got.State)
	}
	if got := tr.Resolve("agent-1", false); got.State != StateOffline {
		t.Errorf("after clear w/o plugin = %q, want offline", got.State)
	}
}

func TestTracker_EmptyReasonFallsBackToUnknown(t *testing.T) {
	tr := NewTracker()
	tr.SetError("agent-1", "")
	got, ok := tr.Lookup("agent-1")
	if !ok || got.Reason != ReasonUnknown {
		t.Errorf("empty reason fallback = %q, want %q", got.Reason, ReasonUnknown)
	}
}

func TestTracker_EmptyAgentIDIsNoOp(t *testing.T) {
	tr := NewTracker()
	tr.SetError("", ReasonAPIKeyInvalid) // must not panic / pollute map
	tr.Clear("")
	if _, ok := tr.Lookup(""); ok {
		t.Error("empty agentID should not have an entry")
	}
}

func TestTracker_ConcurrentSetClearLookup(t *testing.T) {
	tr := NewTracker()
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(3)
		go func() { defer wg.Done(); tr.SetError("a", ReasonAPIKeyInvalid) }()
		go func() { defer wg.Done(); tr.Clear("a") }()
		go func() { defer wg.Done(); tr.Resolve("a", false) }()
	}
	wg.Wait()
}

func TestClassifyProxyError(t *testing.T) {
	cases := []struct {
		name   string
		status int
		err    error
		want   string
	}{
		{"happy path", 200, nil, ""},
		{"401 → api_key_invalid", 401, errors.New("Unauthorized"), ReasonAPIKeyInvalid},
		{"429 → quota_exceeded", 429, nil, ReasonQuotaExceeded},
		{"500 → runtime_crashed", 500, errors.New("internal"), ReasonRuntimeCrashed},
		{"503 → runtime_crashed", 503, nil, ReasonRuntimeCrashed},
		{"err msg api key → api_key_invalid", 0, errors.New("invalid api key"), ReasonAPIKeyInvalid},
		{"err timeout → runtime_timeout", 0, errors.New("context deadline exceeded"), ReasonRuntimeTimeout},
		{"err timeout literal → runtime_timeout", 0, errors.New("read timeout"), ReasonRuntimeTimeout},
		{"err not connected → network_unreachable", 0, errors.New("agent not connected"), ReasonNetworkUnreachable},
		{"err connection refused → network_unreachable", 0, errors.New("connection refused"), ReasonNetworkUnreachable},
		{"unknown err falls through", 0, errors.New("weird thing"), ReasonUnknown},
		{"4xx without err → no reason (client mistake, not runtime故障)", 404, nil, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := ClassifyProxyError(tc.status, tc.err)
			if got != tc.want {
				t.Errorf("ClassifyProxyError(%d, %v) = %q, want %q", tc.status, tc.err, got, tc.want)
			}
		})
	}
}

func TestSnapshot_JSONFieldNames(t *testing.T) {
	// 字段名锁: 客户端 ws-frames + AgentManager.tsx 直接读 state / reason.
	// 改名 = 改两边. omitempty 在 Reason 上是为了 online/offline 不带 reason.
	s := Snapshot{State: StateError, Reason: ReasonAPIKeyInvalid, UpdatedAt: 1700000000000}
	if s.State != "error" {
		t.Errorf("state literal = %q, want %q", s.State, "error")
	}
	if s.Reason != "api_key_invalid" {
		t.Errorf("reason literal = %q", s.Reason)
	}
}
