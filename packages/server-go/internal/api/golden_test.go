package api_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"borgee-server/internal/testutil"
)

func TestAPIGoldenCompatResponses(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)

	loginResp, loginBody := loginJSON(t, ts.URL, "owner@test.com", "password123")
	if loginResp.StatusCode != http.StatusOK {
		t.Fatalf("login status: got %d body %v", loginResp.StatusCode, loginBody)
	}
	token := cookieValue(t, loginResp, "borgee_token")
	loginUser := requireObject(t, loginBody, "user")
	requireFields(t, "login user", loginUser, []string{
		"id", "display_name", "role", "avatar_url", "email", "created_at",
		"last_seen_at", "require_mention", "owner_id", "deleted_at", "disabled",
	})

	channelsResp, channelsBody := testutil.JSON(t, "GET", ts.URL+"/api/v1/channels", token, nil)
	if channelsResp.StatusCode != http.StatusOK {
		t.Fatalf("channels status: got %d body %v", channelsResp.StatusCode, channelsBody)
	}
	requireFields(t, "channels response", channelsBody, []string{"channels", "groups"})
	channels := requireArray(t, channelsBody, "channels")
	if len(channels) == 0 {
		t.Fatal("expected at least one channel")
	}
	channel := channels[0].(map[string]any)
	requireFields(t, "channel", channel, []string{
		"id", "name", "topic", "visibility", "created_at", "created_by", "type",
		"position", "group_id", "member_count", "unread_count", "is_member",
	})

	channelID := channel["id"].(string)
	testutil.PostMessage(t, ts.URL, token, channelID, "golden compat message")
	messagesResp, messagesBody := testutil.JSON(t, "GET", ts.URL+"/api/v1/channels/"+channelID+"/messages?limit=10", token, nil)
	if messagesResp.StatusCode != http.StatusOK {
		t.Fatalf("messages status: got %d body %v", messagesResp.StatusCode, messagesBody)
	}
	requireFields(t, "messages response", messagesBody, []string{"messages", "has_more"})
	messages := requireArray(t, messagesBody, "messages")
	if len(messages) == 0 {
		t.Fatal("expected at least one message")
	}
	message := messages[0].(map[string]any)
	requireFields(t, "message", message, []string{
		"id", "channel_id", "sender_id", "sender_name", "content", "content_type",
		"reply_to_id", "created_at", "edited_at", "deleted_at", "mentions", "reactions",
	})

	meResp, meBody := testutil.JSON(t, "GET", ts.URL+"/api/v1/users/me", token, nil)
	if meResp.StatusCode != http.StatusOK {
		t.Fatalf("users/me status: got %d body %v", meResp.StatusCode, meBody)
	}
	me := requireObject(t, meBody, "user")
	requireFields(t, "users/me user", me, []string{
		"id", "display_name", "role", "avatar_url", "email", "created_at",
		"last_seen_at", "require_mention", "owner_id", "deleted_at", "disabled", "permissions",
	})
}

func loginJSON(t *testing.T, serverURL, email, password string) (*http.Response, map[string]any) {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"email": email, "password": password})
	resp, err := http.Post(serverURL+"/api/v1/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("login request: %v", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var result map[string]any
	if err := json.Unmarshal(respBody, &result); err != nil {
		t.Fatalf("decode login response: %v body %s", err, respBody)
	}
	return resp, result
}

func cookieValue(t *testing.T, resp *http.Response, name string) string {
	t.Helper()
	for _, c := range resp.Cookies() {
		if c.Name == name {
			return c.Value
		}
	}
	t.Fatalf("missing cookie %q", name)
	return ""
}

func requireObject(t *testing.T, m map[string]any, key string) map[string]any {
	t.Helper()
	v, ok := m[key].(map[string]any)
	if !ok {
		t.Fatalf("expected %q object, got %T", key, m[key])
	}
	return v
}

func requireArray(t *testing.T, m map[string]any, key string) []any {
	t.Helper()
	v, ok := m[key].([]any)
	if !ok {
		t.Fatalf("expected %q array, got %T", key, m[key])
	}
	return v
}

func requireFields(t *testing.T, label string, obj map[string]any, fields []string) {
	t.Helper()
	for _, field := range fields {
		if _, ok := obj[field]; !ok {
			t.Fatalf("%s missing required field %q in %#v", label, field, obj)
		}
	}
}
