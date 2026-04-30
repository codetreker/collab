package ws_test

import (
	"testing"

	"borgee-server/internal/testutil"
)

func TestP1MultiDeviceWebSocket(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	token := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	channelID := testutil.GetGeneralChannelID(t, ts.URL, token)

	phone := testutil.DialWS(t, ts.URL, "/ws", token)
	desktop := testutil.DialWS(t, ts.URL, "/ws", token)

	testutil.WSWriteJSON(t, phone, map[string]string{"type": "subscribe", "channel_id": channelID})
	testutil.WSReadUntil(t, phone, "subscribed")
	testutil.WSWriteJSON(t, desktop, map[string]string{"type": "subscribe", "channel_id": channelID})
	testutil.WSReadUntil(t, desktop, "subscribed")

	testutil.WSWriteJSON(t, phone, map[string]string{"type": "typing", "channel_id": channelID})
	typing := testutil.WSReadUntil(t, desktop, "typing")
	if typing["channel_id"] != channelID {
		t.Fatalf("desktop did not receive phone typing event: %v", typing)
	}

	testutil.WSWriteJSON(t, desktop, map[string]string{
		"type":              "send_message",
		"channel_id":        channelID,
		"content":           "multi-device message",
		"client_message_id": "desktop-1",
	})
	ack := testutil.WSReadUntil(t, desktop, "message_ack")
	if ack["client_message_id"] != "desktop-1" {
		t.Fatalf("unexpected desktop ack: %v", ack)
	}

	phonePush := testutil.WSReadUntil(t, phone, "new_message")
	desktopPush := testutil.WSReadUntil(t, desktop, "new_message")
	if phonePush["message"].(map[string]any)["content"] != "multi-device message" {
		t.Fatalf("phone did not receive message push: %v", phonePush)
	}
	if desktopPush["message"].(map[string]any)["content"] != "multi-device message" {
		t.Fatalf("desktop did not receive its own message push: %v", desktopPush)
	}
}
