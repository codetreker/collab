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

// readSSEUntilDataContains reads up to 8 non-heartbeat events with an
// overall 5s deadline. Race+CI loops 20 iterations were over-budget when
// the heartbeat handler interleaved spurious events; bound the loop +
// fail fast keeps the e2e test under the 30s race-job budget.
func readSSEUntilDataContains(t *testing.T, c *testutil.SSEClient, content string) testutil.SSEEvent {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for i := 0; i < 8; i++ {
		if time.Now().After(deadline) {
			t.Fatalf("SSE read deadline (5s) exceeded waiting for %q", content)
		}
		event := c.ReadEvent(t)
		if event.Event == "heartbeat" {
			continue
		}
		if (event.Event == "message" || event.Event == "new_message") && strings.Contains(event.Data, content) {
			return event
		}
	}
	t.Fatalf("did not receive SSE event containing %q after 8 iterations", content)
	return testutil.SSEEvent{}
}
