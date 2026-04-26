package testutil

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHelpersExerciseTestServer(t *testing.T) {
	ts, _, _ := NewTestServer(t)
	token := LoginAs(t, ts.URL, "owner@test.com", "password123")

	resp, data := JSON(t, "GET", ts.URL+"/api/v1/channels", token, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list channels status: got %d body %v", resp.StatusCode, data)
	}
	if GetGeneralChannelID(t, ts.URL, token) == "" {
		t.Fatal("expected general channel id")
	}
	if GetUserIDByName(t, ts.URL, token, "Admin") == "" {
		t.Fatal("expected admin user id")
	}

	channel := CreateChannel(t, ts.URL, token, "testutil-channel", "public")
	channelID := channel["id"].(string)

	message := PostMessage(t, ts.URL, token, channelID, "hello from testutil")
	if message["content"] != "hello from testutil" {
		t.Fatalf("message content: got %v", message["content"])
	}

	agent := CreateAgent(t, ts.URL, token, "testutil-agent")
	if agent["api_key"] == "" {
		t.Fatalf("expected agent api key, got %v", agent)
	}

	lastEventIDs := make(chan string, 1)
	sseServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/stream" {
			http.NotFound(w, r)
			return
		}
		lastEventIDs <- r.Header.Get("Last-Event-ID")
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("event: message\nid: event-6\ndata: hello over testutil sse\n\n"))
	}))
	defer sseServer.Close()
	stream := DialSSEWithLastEventID(t, sseServer.URL, token, "event-5")
	if got := <-lastEventIDs; got != "event-5" {
		t.Fatalf("expected Last-Event-ID header, got %q", got)
	}
	event := stream.ReadEvent(t)
	if event.Event != "message" || event.ID != "event-6" || !strings.Contains(event.Data, "hello over testutil sse") {
		t.Fatalf("unexpected sse event: %+v", event)
	}
	stream.Close()

	conn := DialWS(t, ts.URL, "/ws", token)
	WSWriteJSON(t, conn, map[string]string{"type": "subscribe", "channel_id": channelID})
	WSReadUntil(t, conn, "subscribed")
	WSWriteJSON(t, conn, map[string]string{
		"type":              "send_message",
		"channel_id":        channelID,
		"content":           "hello over testutil ws",
		"client_message_id": "testutil-ws-1",
	})
	ack := WSReadUntil(t, conn, "message_ack")
	if ack["client_message_id"] != "testutil-ws-1" {
		t.Fatalf("unexpected ws ack: %v", ack)
	}
	push := WSReadUntil(t, conn, "new_message")
	msg := push["message"].(map[string]any)
	if msg["content"] != "hello over testutil ws" {
		t.Fatalf("unexpected ws push: %v", push)
	}
}
