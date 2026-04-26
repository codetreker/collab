package api_test

import (
	"net/http"
	"testing"

	"borgee-server/internal/testutil"
)

func TestP0ReactionE2EWithWebSocketPush(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	memberToken := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")
	channelID := testutil.GetGeneralChannelID(t, ts.URL, adminToken)

	msg := testutil.PostMessage(t, ts.URL, adminToken, channelID, "react in real time")
	messageID := stringField(t, msg, "id")

	conn := testutil.DialWS(t, ts.URL, "/ws", adminToken)
	testutil.WSWriteJSON(t, conn, map[string]string{"type": "subscribe", "channel_id": channelID})
	ack := testutil.WSReadUntil(t, conn, "subscribed")
	if ack["channel_id"] != channelID {
		t.Fatalf("expected subscribe ack for %s, got %v", channelID, ack)
	}

	resp, data := testutil.JSON(t, http.MethodPut, ts.URL+"/api/v1/messages/"+messageID+"/reactions", memberToken, map[string]string{"emoji": ":thumbsup:"})
	requireStatus(t, resp, http.StatusOK, data)
	push := testutil.WSReadUntil(t, conn, "reaction_update")
	pushData := push["data"].(map[string]any)
	if pushData["message_id"] != messageID {
		t.Fatalf("expected reaction push for %s, got %v", messageID, push)
	}

	resp, data = testutil.JSON(t, http.MethodPut, ts.URL+"/api/v1/messages/"+messageID+"/reactions", adminToken, map[string]string{"emoji": ":thumbsup:"})
	requireStatus(t, resp, http.StatusOK, data)
	reactions := data["reactions"].([]any)
	if got := int(reactions[0].(map[string]any)["count"].(float64)); got != 2 {
		t.Fatalf("expected two users on reaction, got %d in %v", got, reactions)
	}
	testutil.WSReadUntil(t, conn, "reaction_update")

	resp, data = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/messages/"+messageID+"/reactions", adminToken, nil)
	requireStatus(t, resp, http.StatusOK, data)
	if got := int(data["reactions"].([]any)[0].(map[string]any)["count"].(float64)); got != 2 {
		t.Fatalf("expected persisted count 2, got %d", got)
	}

	resp, data = testutil.JSON(t, http.MethodDelete, ts.URL+"/api/v1/messages/"+messageID+"/reactions", memberToken, map[string]string{"emoji": ":thumbsup:"})
	requireStatus(t, resp, http.StatusOK, data)
	push = testutil.WSReadUntil(t, conn, "reaction_update")
	pushData = push["data"].(map[string]any)
	if pushData["message_id"] != messageID {
		t.Fatalf("expected removal push for %s, got %v", messageID, push)
	}
	if got := int(data["reactions"].([]any)[0].(map[string]any)["count"].(float64)); got != 1 {
		t.Fatalf("expected one reaction after remove, got %d", got)
	}
}
