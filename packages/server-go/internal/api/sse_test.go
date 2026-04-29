package api_test

import (
	"net/http"
	"testing"

	"borgee-server/internal/store"
	"borgee-server/internal/testutil"
)

func TestPollWithEvents(t *testing.T) {
	t.Parallel()
	ts, s, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")

	_, chData := testutil.JSON(t, "GET", ts.URL+"/api/v1/channels", adminToken, nil)
	channels := chData["channels"].([]any)
	var generalID string
	for _, c := range channels {
		cm := c.(map[string]any)
		if cm["name"] == "general" {
			generalID = cm["id"].(string)
			break
		}
	}

	testutil.PostMessage(t, ts.URL, adminToken, generalID, "poll-test-msg")

	t.Run("PollReturnsEvents", func(t *testing.T) {
		resp, data := testutil.JSON(t, "POST", ts.URL+"/api/v1/poll", adminToken, map[string]any{
			"cursor":     0,
			"timeout_ms": 0,
		})
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		events := data["events"].([]any)
		if len(events) == 0 {
			t.Fatal("expected at least one event")
		}
		cursor := data["cursor"].(float64)
		if cursor == 0 {
			t.Fatal("expected non-zero cursor")
		}
	})

	t.Run("PollWithChannelFilter", func(t *testing.T) {
		resp, data := testutil.JSON(t, "POST", ts.URL+"/api/v1/poll", adminToken, map[string]any{
			"cursor":      0,
			"timeout_ms":  0,
			"channel_ids": []string{generalID},
		})
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		if data["events"] == nil {
			t.Fatal("expected events key")
		}
	})

	t.Run("PollBearerAuth", func(t *testing.T) {
		apiKey, _ := store.GenerateAPIKey()
		users, _ := s.ListUsers()
		for _, u := range users {
			if u.Email != nil && *u.Email == "owner@test.com" {
				s.SetAPIKey(u.ID, apiKey)
				break
			}
		}

		req, _ := http.NewRequest("POST", ts.URL+"/api/v1/poll", nil)
		req.Header.Set("Authorization", "Bearer "+apiKey)
		req.Header.Set("Content-Type", "application/json")
		client := &http.Client{}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
	})

	t.Run("StreamHead", func(t *testing.T) {
		req, _ := http.NewRequest("HEAD", ts.URL+"/api/v1/stream", nil)
		req.AddCookie(&http.Cookie{Name: "borgee_token", Value: adminToken})
		client := &http.Client{}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		ct := resp.Header.Get("Content-Type")
		if ct != "text/event-stream" {
			t.Fatalf("expected text/event-stream, got %s", ct)
		}
	})

	t.Run("StreamUnauthorized", func(t *testing.T) {
		resp, err := http.Get(ts.URL + "/api/v1/stream")
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", resp.StatusCode)
		}
	})
}
