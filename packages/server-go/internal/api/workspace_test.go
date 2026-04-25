package api_test

import (
	"net/http"
	"testing"

	"collab-server/internal/store"
	"collab-server/internal/testutil"
)

func TestWorkspacePermissions(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	memberToken := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")

	privCh := testutil.CreateChannel(t, ts.URL, adminToken, "private-ws", "private")
	privID := privCh["id"].(string)

	users, _ := s.ListUsers()
	var adminID string
	for _, u := range users {
		if u.Role == "admin" {
			adminID = u.ID
			break
		}
	}

	f := &store.WorkspaceFile{
		ID:        "test-file-1",
		UserID:    adminID,
		ChannelID: privID,
		Name:      "test.txt",
		MimeType:  "text/plain",
		SizeBytes: 0,
		Source:    "upload",
	}
	s.InsertWorkspaceFile(f)

	t.Run("NonMemberCannotDownload", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "GET", ts.URL+"/api/v1/channels/"+privID+"/workspace/files/test-file-1", memberToken, nil)
		if resp.StatusCode != http.StatusForbidden {
			t.Fatalf("expected 403, got %d", resp.StatusCode)
		}
	})

	t.Run("CrossChannelReturns404", func(t *testing.T) {
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
		resp, _ := testutil.JSON(t, "GET", ts.URL+"/api/v1/channels/"+generalID+"/workspace/files/test-file-1", adminToken, nil)
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})

	t.Run("OwnerCanAccess", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/api/v1/channels/"+privID+"/workspace/files/test-file-1", adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
	})
}
