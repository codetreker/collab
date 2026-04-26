package api_test

import (
	"net/http"
	"testing"

	"borgee-server/internal/testutil"
)

func TestDMCreate(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	memberToken := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")

	users, _ := s.ListUsers()
	var adminID, memberID string
	for _, u := range users {
		if u.Email != nil && *u.Email == "owner@test.com" {
			adminID = u.ID
		} else if u.Email != nil && *u.Email == "member@test.com" {
			memberID = u.ID
		}
	}

	t.Run("CreateDM", func(t *testing.T) {
		resp, data := testutil.JSON(t, "POST", ts.URL+"/api/v1/dm/"+memberID, adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d: %v", resp.StatusCode, data)
		}
		ch := data["channel"].(map[string]any)
		if ch["type"] != "dm" {
			t.Fatalf("expected dm type, got %v", ch["type"])
		}
		peer := data["peer"].(map[string]any)
		if peer["id"] != memberID {
			t.Fatalf("expected peer %s, got %v", memberID, peer["id"])
		}
	})

	t.Run("Idempotent", func(t *testing.T) {
		resp1, data1 := testutil.JSON(t, "POST", ts.URL+"/api/v1/dm/"+memberID, adminToken, nil)
		resp2, data2 := testutil.JSON(t, "POST", ts.URL+"/api/v1/dm/"+adminID, memberToken, nil)
		if resp1.StatusCode != http.StatusOK || resp2.StatusCode != http.StatusOK {
			t.Fatal("both DM creates should succeed")
		}
		ch1 := data1["channel"].(map[string]any)
		ch2 := data2["channel"].(map[string]any)
		if ch1["id"] != ch2["id"] {
			t.Fatalf("expected same channel, got %v and %v", ch1["id"], ch2["id"])
		}
	})

	t.Run("CannotDMSelf", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "POST", ts.URL+"/api/v1/dm/"+adminID, adminToken, nil)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("NonexistentUser", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "POST", ts.URL+"/api/v1/dm/nonexistent", adminToken, nil)
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})

	t.Run("ListDMs", func(t *testing.T) {
		resp, data := testutil.JSON(t, "GET", ts.URL+"/api/v1/dm", adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		channels := data["channels"].([]any)
		if len(channels) == 0 {
			t.Fatal("expected at least 1 DM channel")
		}
	})
}
