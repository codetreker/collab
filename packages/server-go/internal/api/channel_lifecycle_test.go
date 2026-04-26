package api_test

import (
	"fmt"
	"net/http"
	"testing"

	"borgee-server/internal/testutil"
)

func requireStatus(t *testing.T, resp *http.Response, want int, body map[string]any) {
	t.Helper()
	if resp.StatusCode != want {
		t.Fatalf("expected status %d, got %d, body %v", want, resp.StatusCode, body)
	}
}

func stringField(t *testing.T, m map[string]any, key string) string {
	t.Helper()
	v, ok := m[key].(string)
	if !ok || v == "" {
		t.Fatalf("expected non-empty string field %q in %v", key, m)
	}
	return v
}

func getUserIDByName(t *testing.T, serverURL, token, displayName string) string {
	t.Helper()
	resp, data := testutil.JSON(t, http.MethodGet, serverURL+"/api/v1/users", token, nil)
	requireStatus(t, resp, http.StatusOK, data)
	users, ok := data["users"].([]any)
	if !ok {
		t.Fatalf("expected users array, got %v", data)
	}
	for _, raw := range users {
		u := raw.(map[string]any)
		if u["display_name"] == displayName {
			return stringField(t, u, "id")
		}
	}
	t.Fatalf("user %q not found", displayName)
	return ""
}

func getGeneralChannelID(t *testing.T, serverURL, token string) string {
	t.Helper()
	resp, data := testutil.JSON(t, http.MethodGet, serverURL+"/api/v1/channels", token, nil)
	requireStatus(t, resp, http.StatusOK, data)
	channels := data["channels"].([]any)
	for _, raw := range channels {
		ch := raw.(map[string]any)
		if ch["name"] == "general" {
			return stringField(t, ch, "id")
		}
	}
	t.Fatal("general channel not found")
	return ""
}

func containsObjectWithID(items []any, id string) bool {
	for _, raw := range items {
		m, ok := raw.(map[string]any)
		if ok && m["id"] == id {
			return true
		}
	}
	return false
}

func TestP0ChannelLifecycle(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	memberToken := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")

	ch := testutil.CreateChannel(t, ts.URL, memberToken, "P0 Lifecycle", "public")
	channelID := stringField(t, ch, "id")
	if ch["name"] != "p0-lifecycle" {
		t.Fatalf("expected slug p0-lifecycle, got %v", ch["name"])
	}

	resp, data := testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/channels/"+channelID, memberToken, nil)
	requireStatus(t, resp, http.StatusOK, data)
	if members := data["members"].([]any); len(members) < 2 {
		t.Fatalf("public channel should include existing users, got %d members", len(members))
	}

	resp, data = testutil.JSON(t, http.MethodPut, ts.URL+"/api/v1/channels/"+channelID+"/topic", memberToken, map[string]string{"topic": "release room"})
	requireStatus(t, resp, http.StatusOK, data)
	updated := data["channel"].(map[string]any)
	if updated["topic"] != "release room" {
		t.Fatalf("topic was not updated: %v", updated)
	}

	msg := testutil.PostMessage(t, ts.URL, memberToken, channelID, "lifecycle message")
	if stringField(t, msg, "channel_id") != channelID {
		t.Fatalf("message channel mismatch: %v", msg)
	}

	resp, data = testutil.JSON(t, http.MethodPut, ts.URL+"/api/v1/channels/"+channelID+"/read", memberToken, nil)
	requireStatus(t, resp, http.StatusOK, data)

	resp, data = testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/channels/"+channelID+"/leave", memberToken, nil)
	requireStatus(t, resp, http.StatusOK, data)

	resp, data = testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/channels/"+channelID+"/join", memberToken, nil)
	requireStatus(t, resp, http.StatusOK, data)

	resp, data = testutil.JSON(t, http.MethodDelete, fmt.Sprintf("%s/api/v1/channels/%s", ts.URL, channelID), adminToken, nil)
	requireStatus(t, resp, http.StatusOK, data)

	resp, data = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/channels/"+channelID, memberToken, nil)
	requireStatus(t, resp, http.StatusNotFound, data)
}
