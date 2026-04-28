// Package throttle — B.1 节流不变量: ≤1 offline-mention system message per
// (channel_id, agent_id) within ThrottleWindow. G2.3 (#221) per 飞马 #229.
// v0: in-memory map + Mutex; data-layer.md row 75 reserved for v1 (single
// Allow keeps swap local). Not in ws hub — G2.6 BPP schema lock = policy
// outside transport.
package throttle

import (
	"sync"
	"time"

	"borgee-server/internal/testutil/clock"
)

// ThrottleWindow — pinned by concept-model.md §4.1 (B.1). Audited by REG-CHECK
// grep; do not inline as a literal at call sites.
const ThrottleWindow = 5 * time.Minute

type key struct{ channelID, agentID string }

// Throttle: per-(channel, agent) suppression. Concurrent-safe.
type Throttle struct {
	mu    sync.Mutex
	clock clock.Clock
	last  map[key]time.Time
}

// New — pass clock.NewReal() in prod, clock.NewFake() in tests (G2.3 拒收红线
// #4: 单测 sleep > 100ms 是 CI 慢闸).
func New(c clock.Clock) *Throttle {
	if c == nil {
		c = clock.NewReal()
	}
	return &Throttle{clock: c, last: make(map[key]time.Time)}
}

// Allow returns true on first call for a (channel, agent) pair, then false
// until ThrottleWindow elapses since the previous accepted call. Two-dim
// isolation: distinct channel_id OR agent_id ⇒ independent windows.
func (t *Throttle) Allow(channelID, agentID string) bool {
	now := t.clock.Now()
	t.mu.Lock()
	defer t.mu.Unlock()
	k := key{channelID, agentID}
	if last, ok := t.last[k]; ok && now.Sub(last) < ThrottleWindow {
		return false
	}
	t.last[k] = now
	return true
}
