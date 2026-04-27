package clock

import (
	"sync"
	"testing"
	"time"
)

// epoch matches NewFake's default start so we can reason about exact times.
var epoch = time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)

func TestNewFakeDefaultsToStableEpoch(t *testing.T) {
	f := NewFake(time.Time{})
	if !f.Now().Equal(epoch) {
		t.Fatalf("default fake start = %v, want %v", f.Now(), epoch)
	}
}

func TestNewFakeRespectsStart(t *testing.T) {
	want := time.Date(2030, 6, 1, 12, 0, 0, 0, time.UTC)
	f := NewFake(want)
	if !f.Now().Equal(want) {
		t.Fatalf("explicit start mismatch")
	}
}

func TestAdvanceMovesClockForward(t *testing.T) {
	f := NewFake(time.Time{})
	f.Advance(2 * time.Hour)
	if got := f.Since(epoch); got != 2*time.Hour {
		t.Fatalf("Since after Advance = %v, want 2h", got)
	}
}

func TestAdvanceRejectsNonPositive(t *testing.T) {
	f := NewFake(time.Time{})
	f.Advance(0)
	f.Advance(-time.Hour)
	if !f.Now().Equal(epoch) {
		t.Fatalf("clock moved on non-positive Advance: %v", f.Now())
	}
}

func TestSetJumpsClock(t *testing.T) {
	f := NewFake(time.Time{})
	target := epoch.Add(5 * time.Minute)
	f.Set(target)
	if !f.Now().Equal(target) {
		t.Fatalf("Set didn't move clock")
	}
}

func TestAfterFiresWhenDeadlineCrossed(t *testing.T) {
	f := NewFake(time.Time{})
	ch := f.After(100 * time.Millisecond)
	select {
	case <-ch:
		t.Fatal("After fired before Advance")
	default:
	}
	f.Advance(50 * time.Millisecond)
	select {
	case <-ch:
		t.Fatal("After fired before deadline")
	default:
	}
	f.Advance(60 * time.Millisecond)
	select {
	case got := <-ch:
		want := epoch.Add(110 * time.Millisecond)
		if !got.Equal(want) {
			t.Fatalf("After fired with %v, want %v", got, want)
		}
	default:
		t.Fatal("After didn't fire after crossing deadline")
	}
}

func TestAfterZeroFiresImmediately(t *testing.T) {
	f := NewFake(time.Time{})
	ch := f.After(0)
	select {
	case <-ch:
	default:
		t.Fatal("After(0) didn't fire immediately")
	}
}

func TestAfterNegativeFiresImmediately(t *testing.T) {
	f := NewFake(time.Time{})
	ch := f.After(-time.Hour)
	select {
	case <-ch:
	default:
		t.Fatal("After(-1h) didn't fire immediately")
	}
}

func TestSetFiresElapsedWaiters(t *testing.T) {
	f := NewFake(time.Time{})
	ch := f.After(time.Hour)
	target := epoch.Add(2 * time.Hour)
	f.Set(target)
	select {
	case got := <-ch:
		if !got.Equal(target) {
			t.Fatalf("Set-fired waiter got %v, want %v", got, target)
		}
	default:
		t.Fatal("Set didn't fire elapsed waiter")
	}
}

func TestSleepBlocksUntilAdvance(t *testing.T) {
	f := NewFake(time.Time{})
	done := make(chan struct{})
	go func() {
		f.Sleep(time.Second)
		close(done)
	}()
	// Give the goroutine time to register its waiter.
	time.Sleep(10 * time.Millisecond)
	select {
	case <-done:
		t.Fatal("Sleep returned before Advance")
	default:
	}
	f.Advance(time.Second)
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Sleep didn't return after Advance")
	}
}

func TestConcurrentAdvanceAndAfter(t *testing.T) {
	// Stress test: many waiters + concurrent Advance must not deadlock or
	// drop waiters whose deadlines are crossed.
	f := NewFake(time.Time{})
	const n = 50
	chs := make([]<-chan time.Time, n)
	for i := 0; i < n; i++ {
		chs[i] = f.After(time.Duration(i+1) * time.Millisecond)
	}
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		f.Advance(30 * time.Millisecond)
	}()
	go func() {
		defer wg.Done()
		f.Advance(30 * time.Millisecond)
	}()
	wg.Wait()
	fired := 0
	for _, ch := range chs {
		select {
		case <-ch:
			fired++
		default:
		}
	}
	if fired != 60 && fired != n /* all */ {
		// 30+30 = 60ms past start so first 50 must fire.
		if fired < n {
			t.Fatalf("expected all %d waiters fired, got %d", n, fired)
		}
	}
}

func TestRealClockSatisfiesInterface(t *testing.T) {
	var c Clock = NewReal()
	now := c.Now()
	if c.Since(now) < 0 {
		t.Fatal("Since returned negative")
	}
	ch := c.After(0)
	select {
	case <-ch:
	case <-time.After(time.Second):
		t.Fatal("Real After(0) didn't fire")
	}
	c.Sleep(time.Millisecond)
}
