package bpp

// TEST-FIX-3-COV: HeartbeatWatchdog Run ctx-cancel exit smoke.

import (
	"context"
	"log/slog"
	"testing"
	"time"
)

func TestCov_HeartbeatWatchdog_Run_CancelExits(t *testing.T) {
	t.Parallel()
	src := &fakeLivenessSource{}
	sink := &recordingErrorSink{}
	w := NewHeartbeatWatchdog(src, sink, slog.Default())

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		w.Run(ctx)
		close(done)
	}()
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not exit on ctx cancel")
	}
}
