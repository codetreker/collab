// Package bpp — plugin_frame_dispatcher_logf_test.go: cover the 4 logf
// level switch branches (warn / info / error / default) since the
// production code only exercises "warn" callsites.
package bpp

import (
	"bytes"
	"log/slog"
	"strings"
	"testing"
)

func TestPluginFrameDispatcherLogfBranches(t *testing.T) {
	t.Parallel()

	// nil logger — early return path.
	(&PluginFrameDispatcher{}).logf("warn", "ignored")

	var buf bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug}))
	d := &PluginFrameDispatcher{logger: logger}

	d.logf("warn", "warn-msg")
	d.logf("info", "info-msg")
	d.logf("error", "error-msg")
	d.logf("debug-or-other", "default-msg") // hits default branch

	out := buf.String()
	for _, want := range []string{"warn-msg", "info-msg", "error-msg", "default-msg"} {
		if !strings.Contains(out, want) {
			t.Errorf("expected %q in logger output, got %q", want, out)
		}
	}
}
