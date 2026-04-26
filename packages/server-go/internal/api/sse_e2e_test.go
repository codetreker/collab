package api_test

import (
	"bufio"
	"io"
	"net/http"
	"strings"
	"testing"

	"borgee-server/internal/testutil"
)

func TestP1SSEReconnectBackfill(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	token := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	channelID := getGeneralChannelID(t, ts.URL, token)

	stream := testutil.DialSSE(t, ts.URL, token)
	testutil.PostMessage(t, ts.URL, token, channelID, "first sse event")
	first := stream.ReadEvent(t)
	if first.Event != "message" || first.ID == "" || !strings.Contains(first.Data, "first sse event") {
		t.Fatalf("unexpected first SSE event: %+v", first)
	}
	stream.Close()

	testutil.PostMessage(t, ts.URL, token, channelID, "missed while disconnected")
	testutil.PostMessage(t, ts.URL, token, channelID, "second missed event")

	reconnected := dialSSEWithLastEventID(t, ts.URL, token, first.ID)
	defer reconnected.Close()
	readSSEUntilDataContains(t, reconnected, "missed while disconnected")
	readSSEUntilDataContains(t, reconnected, "second missed event")
}

type sseTestClient struct {
	resp    *http.Response
	scanner *bufio.Scanner
}

func dialSSEWithLastEventID(t *testing.T, serverURL, token, lastID string) *sseTestClient {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, serverURL+"/api/v1/stream", nil)
	if err != nil {
		t.Fatalf("new sse request: %v", err)
	}
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Last-Event-ID", lastID)
	req.AddCookie(&http.Cookie{Name: "borgee_token", Value: token})
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("sse reconnect: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("sse reconnect status %d: %s", resp.StatusCode, b)
	}
	return &sseTestClient{resp: resp, scanner: bufio.NewScanner(resp.Body)}
}

func (c *sseTestClient) Close() {
	c.resp.Body.Close()
}

func (c *sseTestClient) ReadEvent(t *testing.T) testutil.SSEEvent {
	t.Helper()
	event := testutil.SSEEvent{}
	for c.scanner.Scan() {
		line := c.scanner.Text()
		if line == "" {
			if event.Event != "" || event.ID != "" || event.Data != "" {
				return event
			}
			continue
		}
		if strings.HasPrefix(line, ":") {
			continue
		}
		if v, ok := strings.CutPrefix(line, "event: "); ok {
			event.Event = v
			continue
		}
		if v, ok := strings.CutPrefix(line, "id: "); ok {
			event.ID = v
			continue
		}
		if v, ok := strings.CutPrefix(line, "data: "); ok {
			if event.Data != "" {
				event.Data += "\n"
			}
			event.Data += v
		}
	}
	if err := c.scanner.Err(); err != nil {
		t.Fatalf("sse read: %v", err)
	}
	t.Fatal("sse stream ended")
	return testutil.SSEEvent{}
}

func readSSEUntilDataContains(t *testing.T, c *sseTestClient, content string) testutil.SSEEvent {
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
