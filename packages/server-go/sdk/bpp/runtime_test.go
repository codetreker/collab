// TEST-FIX-3-COV: deterministic unit tests for SDK runtime methods.
// All use httptest.Server with websocket.Accept on the server side so
// the SDK Client's Connect / Reconnect / ColdStart / SendHeartbeat /
// HeartbeatLoop paths exercise real ws traffic without the full
// borgee-server stack.

package bpp_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"

	sdkbpp "borgee-server/sdk/bpp"
)

// echoWS spins up an httptest server that accepts a single ws connection,
// reads one frame and stores its bytes, then waits for ctx cancel.
func echoWS(t *testing.T) (string, *recvBuf, func()) {
	t.Helper()
	rb := &recvBuf{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		for {
			_, b, err := conn.Read(ctx)
			if err != nil {
				return
			}
			rb.add(b)
		}
	}))
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")
	return wsURL, rb, srv.Close
}

type recvBuf struct {
	mu    sync.Mutex
	frames [][]byte
}

func (r *recvBuf) add(b []byte) {
	r.mu.Lock()
	defer r.mu.Unlock()
	cp := append([]byte{}, b...)
	r.frames = append(r.frames, cp)
}

func (r *recvBuf) waitFor(min int, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		r.mu.Lock()
		n := len(r.frames)
		r.mu.Unlock()
		if n >= min {
			return true
		}
		time.Sleep(5 * time.Millisecond)
	}
	return false
}

func TestConnect_SendHeartbeat_Close(t *testing.T) {
	t.Parallel()
	url, rb, stop := echoWS(t)
	defer stop()

	c := sdkbpp.NewClient("plug-1", "agent-1", nil)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := c.Connect(ctx, url, "tok", "v1", "caps"); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	if !rb.waitFor(1, time.Second) {
		t.Fatal("server did not receive ConnectFrame")
	}

	// SendHeartbeat with empty status (defaults to "online" branch).
	if err := c.SendHeartbeat(ctx, "", ""); err != nil {
		t.Fatalf("SendHeartbeat empty status: %v", err)
	}
	// SendHeartbeat with explicit status.
	if err := c.SendHeartbeat(ctx, "online", ""); err != nil {
		t.Fatalf("SendHeartbeat: %v", err)
	}
	if !rb.waitFor(3, time.Second) {
		t.Fatal("server did not receive heartbeat frames")
	}

	// Close once + idempotent second close.
	if err := c.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	if err := c.Close(); err != nil {
		t.Fatalf("Close idempotent: %v", err)
	}

	// SendHeartbeat after close → errSDKConnClosed.
	if err := c.SendHeartbeat(ctx, "online", ""); err == nil {
		t.Fatal("SendHeartbeat after close: expected error")
	}
}

func TestConnect_DialError(t *testing.T) {
	t.Parallel()
	c := sdkbpp.NewClient("plug-x", "agent-x", nil)
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	// Bogus url → dial error path.
	if err := c.Connect(ctx, "ws://127.0.0.1:1/does-not-exist", "tok", "v1", "caps"); err == nil {
		t.Fatal("Connect bogus url: expected err")
	}
}

func TestReconnect_ColdStart(t *testing.T) {
	t.Parallel()
	url, rb, stop := echoWS(t)
	defer stop()

	c := sdkbpp.NewClient("plug-r", "agent-r", nil)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// Reconnect first (no prior conn — ws dial fresh + send handshake).
	c.AdvanceCursor(123)
	if err := c.Reconnect(ctx, url); err != nil {
		t.Fatalf("Reconnect: %v", err)
	}
	if !rb.waitFor(1, time.Second) {
		t.Fatal("Reconnect frame not received")
	}

	// ColdStart on top — closes prior conn, dials fresh, resets cursor.
	if err := c.ColdStart(ctx, url); err != nil {
		t.Fatalf("ColdStart: %v", err)
	}
	if c.LastKnownCursor() != 0 {
		t.Fatalf("ColdStart should reset cursor, got %d", c.LastKnownCursor())
	}
	if !rb.waitFor(2, time.Second) {
		t.Fatal("ColdStart frame not received")
	}
	_ = c.Close()
}

func TestReconnect_ColdStart_DialError(t *testing.T) {
	t.Parallel()
	c := sdkbpp.NewClient("plug-de", "agent-de", nil)
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	if err := c.Reconnect(ctx, "ws://127.0.0.1:1/nope"); err == nil {
		t.Fatal("Reconnect bogus: expected err")
	}
	if err := c.ColdStart(ctx, "ws://127.0.0.1:1/nope"); err == nil {
		t.Fatal("ColdStart bogus: expected err")
	}
}

func TestHeartbeatLoop_CtxCancelExits(t *testing.T) {
	t.Parallel()
	url, _, stop := echoWS(t)
	defer stop()
	c := sdkbpp.NewClient("plug-hb", "agent-hb", nil)
	ctx, cancel := context.WithCancel(context.Background())
	if err := c.Connect(ctx, url, "tok", "v1", "caps"); err != nil {
		t.Fatalf("Connect: %v", err)
	}

	done := make(chan struct{})
	go func() {
		c.HeartbeatLoop(ctx)
		close(done)
	}()

	// Cancel immediately — Loop should exit on the first <-ctx.Done() select.
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("HeartbeatLoop did not exit after ctx cancel")
	}
	_ = c.Close()
}
