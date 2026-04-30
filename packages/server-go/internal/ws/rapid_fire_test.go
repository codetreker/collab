package ws_test

import (
	"fmt"
	"testing"

	"borgee-server/internal/testutil"
)

func TestP2RapidFireWebSocketMessages(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	token := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	channelID := testutil.GetGeneralChannelID(t, ts.URL, token)

	conn := testutil.DialWS(t, ts.URL, "/ws", token)
	testutil.WSWriteJSON(t, conn, map[string]string{"type": "subscribe", "channel_id": channelID})
	testutil.WSReadUntil(t, conn, "subscribed")

	const messageCount = 50
	wantContent := make(map[string]bool, messageCount)
	wantClientIDs := make(map[string]bool, messageCount)
	for i := 0; i < messageCount; i++ {
		content := fmt.Sprintf("rapid-fire-%02d", i)
		clientID := fmt.Sprintf("rapid-client-%02d", i)
		wantContent[content] = true
		wantClientIDs[clientID] = true
		testutil.WSWriteJSON(t, conn, map[string]string{
			"type":              "send_message",
			"channel_id":        channelID,
			"content":           content,
			"client_message_id": clientID,
		})
	}

	seenContent := map[string]bool{}
	seenClientIDs := map[string]bool{}
	for len(seenContent) < messageCount || len(seenClientIDs) < messageCount {
		event := testutil.WSReadJSON(t, conn)
		switch event["type"] {
		case "message_ack":
			clientID, _ := event["client_message_id"].(string)
			if wantClientIDs[clientID] {
				seenClientIDs[clientID] = true
			}
		case "new_message":
			msg, _ := event["message"].(map[string]any)
			content, _ := msg["content"].(string)
			if wantContent[content] {
				seenContent[content] = true
			}
		case "message_nack":
			t.Fatalf("rapid-fire message rejected: %v", event)
		}
	}
}
