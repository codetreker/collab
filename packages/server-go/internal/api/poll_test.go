package api_test

import (
	"net/http"
	"testing"

	"collab-server/internal/store"
	"collab-server/internal/testutil"
)

func TestPollAuthFallback(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	token := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")

	t.Run("CookieAuth", func(t *testing.T) {
		resp, data := testutil.JSON(t, "POST", ts.URL+"/api/v1/poll", token, map[string]any{
			"timeout_ms": 0,
		})
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		if data["cursor"] == nil {
			t.Fatal("expected cursor in response")
		}
	})

	t.Run("APIKeyInBody", func(t *testing.T) {
		apiKey, _ := store.GenerateAPIKey()
		users, _ := s.ListUsers()
		for _, u := range users {
			if u.Role == "admin" {
				s.SetAPIKey(u.ID, apiKey)
				break
			}
		}

		resp, data := testutil.JSON(t, "POST", ts.URL+"/api/v1/poll", "", map[string]any{
			"api_key":    apiKey,
			"timeout_ms": 0,
		})
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 with api_key body auth, got %d", resp.StatusCode)
		}
		if data["cursor"] == nil {
			t.Fatal("expected cursor")
		}
	})

	t.Run("NoAuthReturns401", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "POST", ts.URL+"/api/v1/poll", "", map[string]any{
			"timeout_ms": 0,
		})
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", resp.StatusCode)
		}
	})
}
