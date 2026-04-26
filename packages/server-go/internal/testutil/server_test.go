package testutil

import (
	"net/http"
	"testing"
)

func TestHelpersExerciseTestServer(t *testing.T) {
	ts, _, _ := NewTestServer(t)
	token := LoginAs(t, ts.URL, "admin@test.com", "password123")

	resp, data := JSON(t, "GET", ts.URL+"/api/v1/channels", token, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list channels status: got %d body %v", resp.StatusCode, data)
	}

	channel := CreateChannel(t, ts.URL, token, "testutil-channel", "public")
	channelID := channel["id"].(string)

	message := PostMessage(t, ts.URL, token, channelID, "hello from testutil")
	if message["content"] != "hello from testutil" {
		t.Fatalf("message content: got %v", message["content"])
	}
}
