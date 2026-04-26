package api_test

import (
	"strings"
	"testing"

	"borgee-server/internal/testutil"
)

func TestP1SSEReconnectBackfill(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	token := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	channelID := testutil.GetGeneralChannelID(t, ts.URL, token)

	stream := testutil.DialSSE(t, ts.URL, token)
	testutil.PostMessage(t, ts.URL, token, channelID, "first sse event")
	first := stream.ReadEvent(t)
	if first.Event != "message" || first.ID == "" || !strings.Contains(first.Data, "first sse event") {
		t.Fatalf("unexpected first SSE event: %+v", first)
	}
	stream.Close()

	testutil.PostMessage(t, ts.URL, token, channelID, "missed while disconnected")
	testutil.PostMessage(t, ts.URL, token, channelID, "second missed event")

	reconnected := testutil.DialSSEWithLastEventID(t, ts.URL, token, first.ID)
	defer reconnected.Close()
	readSSEUntilDataContains(t, reconnected, "missed while disconnected")
	readSSEUntilDataContains(t, reconnected, "second missed event")
}

func readSSEUntilDataContains(t *testing.T, c *testutil.SSEClient, content string) testutil.SSEEvent {
	t.Helper()
	for i := 0; i < 10; i++ {
		event := c.ReadEvent(t)
		if (event.Event == "message" || event.Event == "new_message") && strings.Contains(event.Data, content) {
			return event
		}
	}
	t.Fatalf("did not receive SSE event containing %q", content)
	return testutil.SSEEvent{}
}
