package api_test

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	"borgee-server/internal/testutil"
)

func TestP1PaginationPlusRealtimePush(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	token := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	channelID := testutil.GetGeneralChannelID(t, ts.URL, token)

	var firstCreatedAt int64
	for i := 0; i < 5; i++ {
		msg := testutil.PostMessage(t, ts.URL, token, channelID, fmt.Sprintf("page seed %d", i))
		if i == 0 {
			firstCreatedAt = int64(msg["created_at"].(float64))
		}
		time.Sleep(time.Millisecond)
	}

	resp, data := testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/channels/"+channelID+"/messages?limit=2", token, nil)
	requireStatus(t, resp, http.StatusOK, data)
	page := data["messages"].([]any)
	if len(page) != 2 || data["has_more"] != true {
		t.Fatalf("expected first limited page with has_more, got %v", data)
	}
	oldestOnPage := int64(page[0].(map[string]any)["created_at"].(float64))

	resp, data = testutil.JSON(t, http.MethodGet, fmt.Sprintf("%s/api/v1/channels/%s/messages?before=%d&limit=2", ts.URL, channelID, oldestOnPage), token, nil)
	requireStatus(t, resp, http.StatusOK, data)
	older := data["messages"].([]any)
	if len(older) != 2 {
		t.Fatalf("expected older page of two messages, got %v", data)
	}

	resp, data = testutil.JSON(t, http.MethodGet, fmt.Sprintf("%s/api/v1/channels/%s/messages?after=%d&limit=10", ts.URL, channelID, firstCreatedAt), token, nil)
	requireStatus(t, resp, http.StatusOK, data)
	if len(data["messages"].([]any)) < 4 {
		t.Fatalf("expected after cursor to return newer messages, got %v", data)
	}

	conn := testutil.DialWS(t, ts.URL, "/ws", token)
	testutil.WSWriteJSON(t, conn, map[string]string{"type": "subscribe", "channel_id": channelID})
	testutil.WSReadUntil(t, conn, "subscribed")

	testutil.PostMessage(t, ts.URL, token, channelID, "live while paginating")
	push := testutil.WSReadUntil(t, conn, "new_message")
	msg := push["data"].(map[string]any)["message"].(map[string]any)
	if msg["content"] != "live while paginating" {
		t.Fatalf("unexpected realtime push: %v", push)
	}
}
