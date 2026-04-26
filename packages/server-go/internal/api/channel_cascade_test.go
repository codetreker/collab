package api_test

import (
	"net/http"
	"testing"

	"borgee-server/internal/store"
	"borgee-server/internal/testutil"
)

func TestP0ChannelDeleteCascades(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	memberToken := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")

	ch := testutil.CreateChannel(t, ts.URL, adminToken, "Cascade Room", "private")
	channelID := stringField(t, ch, "id")
	memberID := testutil.GetUserIDByName(t, ts.URL, adminToken, "Member")

	resp, data := testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/channels/"+channelID+"/members", adminToken, map[string]string{"user_id": memberID})
	requireStatus(t, resp, http.StatusOK, data)

	msg := testutil.PostMessage(t, ts.URL, memberToken, channelID, "cascade message")
	messageID := stringField(t, msg, "id")
	resp, data = testutil.JSON(t, http.MethodPut, ts.URL+"/api/v1/messages/"+messageID+"/reactions", adminToken, map[string]string{"emoji": ":ship:"})
	requireStatus(t, resp, http.StatusOK, data)

	resp, data = testutil.JSON(t, http.MethodDelete, ts.URL+"/api/v1/channels/"+channelID, adminToken, nil)
	requireStatus(t, resp, http.StatusOK, data)

	var activeMessages int64
	s.DB().Model(&store.Message{}).Where("channel_id = ? AND deleted_at IS NULL", channelID).Count(&activeMessages)
	if activeMessages != 0 {
		t.Fatalf("expected no active messages after channel delete, got %d", activeMessages)
	}

	var members int64
	s.DB().Model(&store.ChannelMember{}).Where("channel_id = ?", channelID).Count(&members)
	if members != 0 {
		t.Fatalf("expected channel members cleaned up, got %d", members)
	}

	var reactions int64
	s.DB().Model(&store.MessageReaction{}).Where("message_id = ?", messageID).Count(&reactions)
	if reactions != 0 {
		t.Fatalf("expected reactions cleaned up, got %d", reactions)
	}

	resp, data = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/channels/"+channelID+"/messages", adminToken, nil)
	requireStatus(t, resp, http.StatusNotFound, data)
}
