package api_test

import (
	"net/http"
	"testing"

	"borgee-server/internal/testutil"
)

func TestP0DMLifecycle(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	memberToken := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")
	adminID := testutil.GetUserIDByName(t, ts.URL, adminToken, "Admin")
	memberID := testutil.GetUserIDByName(t, ts.URL, adminToken, "Member")

	resp, data := testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/dm/"+adminID, adminToken, nil)
	requireStatus(t, resp, http.StatusBadRequest, data)

	resp, data = testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/dm/"+memberID, adminToken, nil)
	requireStatus(t, resp, http.StatusOK, data)
	dm := data["channel"].(map[string]any)
	dmID := stringField(t, dm, "id")
	if dm["type"] != "dm" || dm["visibility"] != "private" {
		t.Fatalf("expected private dm channel, got %v", dm)
	}
	if peer := data["peer"].(map[string]any); peer["id"] != memberID {
		t.Fatalf("expected member peer, got %v", peer)
	}

	msg := testutil.PostMessage(t, ts.URL, adminToken, dmID, "hello over dm")
	if stringField(t, msg, "channel_id") != dmID {
		t.Fatalf("dm message channel mismatch: %v", msg)
	}

	for _, tc := range []struct {
		name  string
		token string
		peer  string
	}{
		{name: "admin", token: adminToken, peer: memberID},
		{name: "member", token: memberToken, peer: adminID},
	} {
		t.Run(tc.name, func(t *testing.T) {
			resp, data := testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/dm", tc.token, nil)
			requireStatus(t, resp, http.StatusOK, data)
			channels := data["channels"].([]any)
			if !containsObjectWithID(channels, dmID) {
				t.Fatalf("expected dm %s in list, got %v", dmID, channels)
			}
			listed := channels[0].(map[string]any)
			if listed["last_message"].(map[string]any)["content"] != "hello over dm" {
				t.Fatalf("expected last dm message, got %v", listed)
			}
		})
	}
}
