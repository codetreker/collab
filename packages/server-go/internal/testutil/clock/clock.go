// Package clock provides a Clock interface and two implementations:
//
//   - Real:  wraps the standard library time package.
//   - Fake:  deterministic clock for tests; advances only on explicit Advance.
//
// INFRA-1b.1 — see docs/current/server/testing.md (testutil/clock section).
//
// Usage in production code: accept a Clock parameter (or store on a struct)
// instead of calling time.Now() / time.After() directly. In tests, inject a
// *Fake to drive expirations, rate-limit windows, JWT iat/exp, etc., without
// real wall-clock waits.
package clock

import (
	"sync"
	"time"
)

// Clock abstracts wall-clock and timer operations so callers can be tested
// without real waits. The contract intentionally mirrors a small subset of
// the stdlib `time` API.
type Clock interface {
	// Now returns the current time according to the clock.
	Now() time.Time
	// Since returns the duration elapsed since t, computed against Now().
	Since(t time.Time) time.Duration
	// After returns a channel that receives the current time after d has
	// elapsed. For Fake, the channel only fires when Advance crosses d.
	After(d time.Duration) <-chan time.Time
	// Sleep blocks until d has elapsed.
	Sleep(d time.Duration)
}

// Real is the production Clock backed by the stdlib `time` package.
type Real struct{}

// NewReal returns a real-time Clock.
func NewReal() *Real { return &Real{} }

// Now implements Clock.
func (Real) Now() time.Time { return time.Now() }

// Since implements Clock.
func (Real) Since(t time.Time) time.Duration { return time.Since(t) }

// After implements Clock.
func (Real) After(d time.Duration) <-chan time.Time { return time.After(d) }

// Sleep implements Clock.
func (Real) Sleep(d time.Duration) { time.Sleep(d) }

// Fake is a deterministic Clock for tests. Its time only changes when callers
// invoke Set or Advance. Pending After/Sleep waiters fire when the clock
// crosses their deadlines.
//
// Fake is safe for concurrent use.
type Fake struct {
	mu      sync.Mutex
	now     time.Time
	waiters []*waiter
}

type waiter struct {
	deadline time.Time
	ch       chan time.Time
}

// NewFake returns a Fake clock initialised at start. If start is the zero
// time, it defaults to a stable epoch (2025-01-01 UTC) so test output is
// deterministic.
func NewFake(start time.Time) *Fake {
	if start.IsZero() {
		start = time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	}
	return &Fake{now: start}
}

// Now implements Clock.
func (f *Fake) Now() time.Time {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.now
}

// Since implements Clock.
func (f *Fake) Since(t time.Time) time.Duration {
	return f.Now().Sub(t)
}

// Set jumps the clock to t. It fires every waiter whose deadline is <= t.
// Set may move the clock backwards, but doing so will never re-fire waiters
// (they are already drained on creation if their deadline is in the past).
func (f *Fake) Set(t time.Time) {
	f.mu.Lock()
	f.now = t
	fired := f.drainLocked()
	f.mu.Unlock()
	for _, w := range fired {
		w.ch <- t
		close(w.ch)
	}
}

// Advance moves the clock forward by d. Negative durations are rejected
// silently (no-op) to avoid surprising rewinds in test code.
func (f *Fake) Advance(d time.Duration) {
	if d <= 0 {
		return
	}
	f.mu.Lock()
	f.now = f.now.Add(d)
	now := f.now
	fired := f.drainLocked()
	f.mu.Unlock()
	for _, w := range fired {
		w.ch <- now
		close(w.ch)
	}
}

// After implements Clock. The returned channel fires once when the fake
// clock has advanced past the deadline. If d <= 0 the channel fires
// immediately.
func (f *Fake) After(d time.Duration) <-chan time.Time {
	ch := make(chan time.Time, 1)
	f.mu.Lock()
	deadline := f.now.Add(d)
	if !f.now.Before(deadline) {
		now := f.now
		f.mu.Unlock()
		ch <- now
		close(ch)
		return ch
	}
	f.waiters = append(f.waiters, &waiter{deadline: deadline, ch: ch})
	f.mu.Unlock()
	return ch
}

// Sleep blocks the caller until the clock has advanced past d. In tests this
// is typically driven from another goroutine that calls Advance.
func (f *Fake) Sleep(d time.Duration) { <-f.After(d) }

// drainLocked must be called with mu held. It removes every waiter whose
// deadline is <= f.now and returns them so the caller can deliver outside
// the lock.
func (f *Fake) drainLocked() []*waiter {
	if len(f.waiters) == 0 {
		return nil
	}
	keep := f.waiters[:0]
	var fired []*waiter
	for _, w := range f.waiters {
		if !w.deadline.After(f.now) {
			fired = append(fired, w)
			continue
		}
		keep = append(keep, w)
	}
	f.waiters = keep
	return fired
}

// Compile-time interface checks.
var (
	_ Clock = (*Real)(nil)
	_ Clock = (*Fake)(nil)
)
