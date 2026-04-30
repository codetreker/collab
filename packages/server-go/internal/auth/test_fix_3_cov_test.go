package auth

// TEST-FIX-3-COV: auth sweeper now() helper cov 真补.
//
// ExpiresSweeper.now / RetentionSweeper.now / RetentionSweeper.retentionDays
// 是 nil-safe wrapper, 默认仅走 nil 路径 (66.7%). 注入路径补满到 100%.

import (
	"context"
	"testing"
	"time"
)

// TestCovSweeperStartNilSafe covers Start nil-store / nil-receiver branches.
func TestCovSweeperStartNilSafe(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	// nil receiver
	var es *ExpiresSweeper
	es.Start(ctx)

	// nil-store receiver
	(&ExpiresSweeper{}).Start(ctx)

	// RetentionSweeper nil
	var rs *RetentionSweeper
	rs.Start(ctx)
	(&RetentionSweeper{}).Start(ctx)

	// RunOnce nil branches (return 0, nil)
	if n, err := (*ExpiresSweeper)(nil).RunOnce(ctx); n != 0 || err != nil {
		t.Errorf("nil ExpiresSweeper RunOnce: got (%d, %v)", n, err)
	}
	if n, err := (&ExpiresSweeper{}).RunOnce(ctx); n != 0 || err != nil {
		t.Errorf("empty ExpiresSweeper RunOnce: got (%d, %v)", n, err)
	}
	if n, err := (*RetentionSweeper)(nil).RunOnce(ctx); n != 0 || err != nil {
		t.Errorf("nil RetentionSweeper RunOnce: got (%d, %v)", n, err)
	}
	if n, err := (&RetentionSweeper{}).RunOnce(ctx); n != 0 || err != nil {
		t.Errorf("empty RetentionSweeper RunOnce: got (%d, %v)", n, err)
	}
}

func TestCovSweeperNowInjected(t *testing.T) {
	t.Parallel()
	fixed := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	clk := func() time.Time { return fixed }

	// ExpiresSweeper.now / interval
	{
		s := &ExpiresSweeper{Now: clk, Interval: 5 * time.Second}
		if got := s.now(); !got.Equal(fixed) {
			t.Errorf("ExpiresSweeper.now: got %v", got)
		}
		if got := s.interval(); got != 5*time.Second {
			t.Errorf("ExpiresSweeper.interval: got %v", got)
		}
		// Default branches
		_ = (&ExpiresSweeper{}).now()
		_ = (&ExpiresSweeper{}).interval()
	}

	// RetentionSweeper.now / interval / retentionDays
	{
		s := &RetentionSweeper{Now: clk, Interval: 7 * time.Second, RetentionDays: 21}
		if got := s.now(); !got.Equal(fixed) {
			t.Errorf("RetentionSweeper.now: got %v", got)
		}
		if got := s.interval(); got != 7*time.Second {
			t.Errorf("RetentionSweeper.interval: got %v", got)
		}
		if got := s.retentionDays(); got != 21 {
			t.Errorf("RetentionSweeper.retentionDays: got %d", got)
		}
		_ = (&RetentionSweeper{}).now()
		_ = (&RetentionSweeper{}).interval()
		_ = (&RetentionSweeper{}).retentionDays()
	}
}
