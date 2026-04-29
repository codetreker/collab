package api_test

import (
	"strings"
	"testing"
	"time"

	"borgee-server/internal/testutil"
)

func TestP1SSEReconnectBackfill(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	token := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	channelID := testutil.GetGeneralChannelID(t, ts.URL, token)

	stream := testutil.DialSSE(t, ts.URL, token)
	testutil.PostMessage(t, ts.URL, token, channelID, "first sse event")
	first := readSSEUntilDataContains(t, stream, "first sse event")
	if first.ID == "" {
		t.Fatalf("expected SSE event with non-empty ID: %+v", first)
	}
	stream.Close()

	testutil.PostMessage(t, ts.URL, token, channelID, "missed while disconnected")
	testutil.PostMessage(t, ts.URL, token, channelID, "second missed event")

	reconnected := testutil.DialSSEWithLastEventID(t, ts.URL, token, first.ID)
	defer reconnected.Close()
	readSSEUntilDataContains(t, reconnected, "missed while disconnected")
	readSSEUntilDataContains(t, reconnected, "second missed event")
}

// readSSEUntilDataContains reads up to 30 non-heartbeat events with an
// overall 30s deadline. CI runners are slow and the heartbeat handler
// (~1s interval) interleaves spurious events between the real message;
// 30s wall-clock + 30 iterations gives the first generated message
// enough room to arrive without exceeding the 60s test budget.
func readSSEUntilDataContains(t *testing.T, c *testutil.SSEClient, content string) testutil.SSEEvent {
	t.Helper()
	deadline := time.Now().Add(30 * time.Second)
	seen := make([]string, 0, 30)
	for i := 0; i < 30; i++ {
		if time.Now().After(deadline) {
			t.Fatalf("SSE read deadline (30s) exceeded waiting for %q after %d events; saw: %v", content, len(seen), seen)
		}
		event := c.ReadEvent(t)
		seen = append(seen, event.Event+":"+event.Data)
		if event.Event == "heartbeat" {
			continue
		}
		if (event.Event == "message" || event.Event == "new_message") && strings.Contains(event.Data, content) {
			return event
		}
	}
	t.Fatalf("did not receive SSE event containing %q after 30 iterations; saw: %v", content, seen)
	return testutil.SSEEvent{}
}
