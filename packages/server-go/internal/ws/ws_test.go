package ws_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"borgee-server/internal/testutil"

	"github.com/coder/websocket"
	"github.com/google/uuid"
)

func readMsg(t *testing.T, ctx context.Context, conn *websocket.Conn) map[string]any {
	t.Helper()
	_, data, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("ws read: %v", err)
	}
	var msg map[string]any
	json.Unmarshal(data, &msg)
	return msg
}

func writeMsg(t *testing.T, ctx context.Context, conn *websocket.Conn, msg any) {
	t.Helper()
	data, _ := json.Marshal(msg)
	if err := conn.Write(ctx, websocket.MessageText, data); err != nil {
		t.Fatalf("ws write: %v", err)
	}
}

func drainUntil(t *testing.T, ctx context.Context, conn *websocket.Conn, msgType string) map[string]any {
	t.Helper()
	for {
		msg := readMsg(t, ctx, conn)
		if msg["type"] == msgType {
			return msg
		}
	}
}

func dialWS(t *testing.T, serverURL, token string) *websocket.Conn {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	wsURL := "ws" + serverURL[4:] + "/ws"
	conn, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{
		HTTPHeader: map[string][]string{
			"Cookie": {"borgee_token=" + token},
		},
	})
	if err != nil {
		t.Fatalf("ws dial: %v", err)
	}
	return conn
}

func TestWSConnect(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	token := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")

	conn := dialWS(t, ts.URL, token)
	defer conn.Close(websocket.StatusNormalClosure, "")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	msg := drainUntil(t, ctx, conn, "presence")
	if msg["status"] != "online" {
		t.Fatalf("expected online presence, got %v", msg["status"])
	}
}

func TestWSSubscribe(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	token := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")

	// Get general channel
	_, chData := testutil.JSON(t, "GET", ts.URL+"/api/v1/channels", token, nil)
	channels := chData["channels"].([]any)
	var generalID string
	for _, c := range channels {
		cm := c.(map[string]any)
		if cm["name"] == "general" {
			generalID = cm["id"].(string)
			break
		}
	}

	conn := dialWS(t, ts.URL, token)
	defer conn.Close(websocket.StatusNormalClosure, "")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	writeMsg(t, ctx, conn, map[string]string{
		"type":       "subscribe",
		"channel_id": generalID,
	})

	msg := drainUntil(t, ctx, conn, "subscribed")
	if msg["channel_id"] != generalID {
		t.Fatalf("expected channel_id %s, got %v", generalID, msg["channel_id"])
	}
}

func TestWSSendMessage(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	token := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")

	// Get general channel
	_, chData := testutil.JSON(t, "GET", ts.URL+"/api/v1/channels", token, nil)
	channels := chData["channels"].([]any)
	var generalID string
	for _, c := range channels {
		cm := c.(map[string]any)
		if cm["name"] == "general" {
			generalID = cm["id"].(string)
			break
		}
	}

	conn := dialWS(t, ts.URL, token)
	defer conn.Close(websocket.StatusNormalClosure, "")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Subscribe first
	writeMsg(t, ctx, conn, map[string]string{
		"type":       "subscribe",
		"channel_id": generalID,
	})
	drainUntil(t, ctx, conn, "subscribed")

	clientID := uuid.New().String()
	writeMsg(t, ctx, conn, map[string]string{
		"type":       "send_message",
		"channel_id": generalID,
		"content":    "hello from ws",
		"client_id":  clientID,
	})

	msg := drainUntil(t, ctx, conn, "message_ack")
	if msg["client_id"] != clientID {
		t.Fatalf("expected client_id %s, got %v", clientID, msg["client_id"])
	}
	if msg["message_id"] == nil || msg["message_id"] == "" {
		t.Fatal("expected message_id in ack")
	}
}
