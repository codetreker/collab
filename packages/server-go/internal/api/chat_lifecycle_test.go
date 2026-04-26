package api_test

import (
	"net/http"
	"testing"

	"borgee-server/internal/testutil"
)

func TestP0ChatLifecycleRegularChannel(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	memberToken := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")

	ch := testutil.CreateChannel(t, ts.URL, adminToken, "chat lifecycle regular", "public")
	channelID := stringField(t, ch, "id")
	if ch["type"] != "channel" {
		t.Fatalf("expected regular channel, got %v", ch)
	}

	resp, data := testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/channels/"+channelID+"/join", memberToken, nil)
	requireStatus(t, resp, http.StatusOK, data)

	msg := testutil.PostMessage(t, ts.URL, memberToken, channelID, "regular channel lifecycle message")
	messageID := stringField(t, msg, "id")
	if stringField(t, msg, "channel_id") != channelID {
		t.Fatalf("message channel mismatch: %v", msg)
	}

	resp, data = testutil.JSON(t, http.MethodPut, ts.URL+"/api/v1/messages/"+messageID, memberToken, map[string]string{
		"content": "edited regular channel lifecycle message",
	})
	requireStatus(t, resp, http.StatusOK, data)
	if data["message"].(map[string]any)["content"] != "edited regular channel lifecycle message" {
		t.Fatalf("message edit did not persist: %v", data)
	}

	resp, data = testutil.JSON(t, http.MethodDelete, ts.URL+"/api/v1/messages/"+messageID, memberToken, nil)
	requireStatus(t, resp, http.StatusNoContent, data)

	resp, data = testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/channels/"+channelID+"/leave", memberToken, nil)
	requireStatus(t, resp, http.StatusOK, data)

	resp, data = testutil.JSON(t, http.MethodDelete, ts.URL+"/api/v1/channels/"+channelID, adminToken, nil)
	requireStatus(t, resp, http.StatusOK, data)

	resp, data = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/channels/"+channelID, adminToken, nil)
	requireStatus(t, resp, http.StatusNotFound, data)
}
