package api_test

import (
	"net/http"
	"testing"

	"borgee-server/internal/testutil"
)

func TestP1PublicPreview(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	memberToken := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")
	memberID := testutil.GetUserIDByName(t, ts.URL, adminToken, "Member")
	publicID := testutil.GetGeneralChannelID(t, ts.URL, adminToken)

	testutil.PostMessage(t, ts.URL, adminToken, publicID, "public preview visible")

	resp, data := testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/channels/"+publicID+"/preview", "", nil)
	requireStatus(t, resp, http.StatusUnauthorized, data)

	resp, data = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/channels/"+publicID+"/preview", memberToken, nil)
	requireStatus(t, resp, http.StatusOK, data)
	if data["channel"].(map[string]any)["id"] != publicID {
		t.Fatalf("preview returned wrong channel: %v", data)
	}
	if messages := data["messages"].([]any); len(messages) == 0 || messages[len(messages)-1].(map[string]any)["content"] != "public preview visible" {
		t.Fatalf("public preview did not include recent messages: %v", data)
	}

	private := testutil.CreateChannel(t, ts.URL, adminToken, "Preview Private", "private")
	privateID := stringField(t, private, "id")
	resp, data = testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/channels/"+privateID+"/members", adminToken, map[string]string{"user_id": memberID})
	requireStatus(t, resp, http.StatusOK, data)
	testutil.PostMessage(t, ts.URL, adminToken, privateID, "private preview hidden")

	resp, data = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/channels/"+privateID+"/preview", memberToken, nil)
	requireStatus(t, resp, http.StatusNotFound, data)
}
