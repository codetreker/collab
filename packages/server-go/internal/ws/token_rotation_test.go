package ws_test

import (
	"testing"
	"time"

	"borgee-server/internal/testutil"
)

func TestP0TokenRotationKeepsWebSocketAlive(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	firstToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	channelID := testutil.GetGeneralChannelID(t, ts.URL, firstToken)

	conn := testutil.DialWS(t, ts.URL, "/ws", firstToken)
	testutil.WSWriteJSON(t, conn, map[string]string{"type": "subscribe", "channel_id": channelID})
	testutil.WSReadUntil(t, conn, "subscribed")

	time.Sleep(1100 * time.Millisecond)
	secondToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	if secondToken == firstToken {
		t.Fatal("expected login to rotate jwt token")
	}

	testutil.WSWriteJSON(t, conn, map[string]string{"type": "ping"})
	if msg := testutil.WSReadUntil(t, conn, "pong"); msg["type"] != "pong" {
		t.Fatalf("expected pong on existing websocket after token rotation, got %v", msg)
	}

	msg := testutil.PostMessage(t, ts.URL, secondToken, channelID, "after token rotation")
	if msg["id"] == "" {
		t.Fatalf("expected message after token rotation, got %v", msg)
	}
	push := testutil.WSReadUntil(t, conn, "new_message")
	pushData, ok := push["data"].(map[string]any)
	if !ok || pushData["message"] == nil {
		t.Fatalf("expected existing websocket to receive message after rotation, got %v", push)
	}
}
