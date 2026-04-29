package api_test

import (
	"net/http"
	"testing"

	"borgee-server/internal/store"
	"borgee-server/internal/testutil"
)

func TestP2MemberChangeSystemMessages(t *testing.T) {
	t.Parallel()
	ts, s, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	memberToken := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")
	memberID := testutil.GetUserIDByName(t, ts.URL, adminToken, "Member")

	ch := testutil.CreateChannel(t, ts.URL, adminToken, "P2 Member Changes", "private")
	channelID := stringField(t, ch, "id")

	resp, data := testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/channels/"+channelID+"/members", adminToken, map[string]string{
		"user_id": memberID,
	})
	requireStatus(t, resp, http.StatusOK, data)

	resp, data = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/channels/"+channelID+"/members", memberToken, nil)
	requireStatus(t, resp, http.StatusOK, data)
	members := data["members"].([]any)
	if !containsMemberWithUserID(members, memberID) {
		t.Fatalf("expected member in channel member list, got %v", members)
	}

	resp, data = testutil.JSON(t, http.MethodPut, ts.URL+"/api/v1/channels/"+channelID+"/read", memberToken, nil)
	requireStatus(t, resp, http.StatusOK, data)

	resp, data = testutil.JSON(t, http.MethodDelete, ts.URL+"/api/v1/channels/"+channelID+"/members/"+memberID, memberToken, nil)
	requireStatus(t, resp, http.StatusOK, data)

	var joined, left int64
	s.DB().Model(&store.Event{}).Where("kind = ? AND channel_id = ?", "user_joined", channelID).Count(&joined)
	s.DB().Model(&store.Event{}).Where("kind = ? AND channel_id = ?", "user_left", channelID).Count(&left)
	if joined != 1 || left != 1 {
		t.Fatalf("expected one join and leave event, got joined=%d left=%d", joined, left)
	}
}

func containsMemberWithUserID(items []any, userID string) bool {
	for _, raw := range items {
		m, ok := raw.(map[string]any)
		if ok && m["user_id"] == userID {
			return true
		}
	}
	return false
}
