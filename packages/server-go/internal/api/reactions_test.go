package api_test

import (
	"net/http"
	"testing"

	"collab-server/internal/testutil"
)

func TestReactionsCRUD(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	token := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")

	_, chData := testutil.JSON(t, "GET", ts.URL+"/api/v1/channels", token, nil)
	channels := chData["channels"].([]any)
	var generalID string
	for _, c := range channels {
		cm := c.(map[string]any)
		if cm["name"] == "general" {
			generalID = cm["id"].(string)
			break
		}
	}

	msg := testutil.PostMessage(t, ts.URL, token, generalID, "reaction test")
	msgID := msg["id"].(string)

	t.Run("AddReaction", func(t *testing.T) {
		resp, data := testutil.JSON(t, "PUT", ts.URL+"/api/v1/messages/"+msgID+"/reactions", token, map[string]string{
			"emoji": "👍",
		})
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		if data["ok"] != true {
			t.Fatal("expected ok=true")
		}
	})

	t.Run("GetReactions", func(t *testing.T) {
		resp, data := testutil.JSON(t, "GET", ts.URL+"/api/v1/messages/"+msgID+"/reactions", token, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		reactions := data["reactions"].([]any)
		if len(reactions) == 0 {
			t.Fatal("expected at least one reaction")
		}
	})

	t.Run("RemoveReaction", func(t *testing.T) {
		resp, data := testutil.JSON(t, "DELETE", ts.URL+"/api/v1/messages/"+msgID+"/reactions", token, map[string]string{
			"emoji": "👍",
		})
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		reactions := data["reactions"].([]any)
		if len(reactions) != 0 {
			t.Fatalf("expected 0 reactions, got %d", len(reactions))
		}
	})
}
