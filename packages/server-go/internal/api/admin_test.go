package api_test

import (
	"net/http"
	"testing"

	"collab-server/internal/store"
	"collab-server/internal/testutil"
)

func getAdminAndMemberIDs(t *testing.T, s *store.Store) (string, string) {
	t.Helper()
	users, _ := s.ListUsers()
	var adminID, memberID string
	for _, u := range users {
		if u.Role == "admin" {
			adminID = u.ID
		}
		if u.Role == "member" {
			memberID = u.ID
		}
	}
	return adminID, memberID
}

func TestAdminListUsers(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	memberToken := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")

	t.Run("AdminCanList", func(t *testing.T) {
		resp, data := testutil.JSON(t, "GET", ts.URL+"/api/v1/admin/users", adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		users := data["users"].([]any)
		if len(users) < 2 {
			t.Fatalf("expected at least 2 users, got %d", len(users))
		}
	})

	t.Run("NonAdminForbidden", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "GET", ts.URL+"/api/v1/admin/users", memberToken, nil)
		if resp.StatusCode != http.StatusForbidden {
			t.Fatalf("expected 403, got %d", resp.StatusCode)
		}
	})
}

func TestAdminCreateUser(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	memberToken := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")

	t.Run("CreateMember", func(t *testing.T) {
		resp, data := testutil.JSON(t, "POST", ts.URL+"/api/v1/admin/users", adminToken, map[string]string{
			"email": "newuser@test.com", "password": "password123", "display_name": "New User",
		})
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %v", resp.StatusCode, data)
		}
		user := data["user"].(map[string]any)
		if user["display_name"] != "New User" {
			t.Fatalf("expected New User, got %v", user["display_name"])
		}
	})

	t.Run("CreateAgent", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "POST", ts.URL+"/api/v1/admin/users", adminToken, map[string]string{
			"display_name": "TestBot", "role": "agent",
		})
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
	})

	t.Run("MissingDisplayName", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "POST", ts.URL+"/api/v1/admin/users", adminToken, map[string]string{
			"email": "bad@test.com", "password": "password123",
		})
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("InvalidRole", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "POST", ts.URL+"/api/v1/admin/users", adminToken, map[string]string{
			"display_name": "Bad", "role": "superadmin", "email": "bad2@test.com", "password": "pass1234",
		})
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("NonAdminForbidden", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "POST", ts.URL+"/api/v1/admin/users", memberToken, map[string]string{
			"email": "x@test.com", "password": "password123", "display_name": "X",
		})
		if resp.StatusCode != http.StatusForbidden {
			t.Fatalf("expected 403, got %d", resp.StatusCode)
		}
	})
}

func TestAdminUpdateUser(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	adminID, memberID := getAdminAndMemberIDs(t, s)

	t.Run("UpdateDisplayName", func(t *testing.T) {
		resp, data := testutil.JSON(t, "PATCH", ts.URL+"/api/v1/admin/users/"+memberID, adminToken, map[string]any{
			"display_name": "Updated Member",
		})
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		user := data["user"].(map[string]any)
		if user["display_name"] != "Updated Member" {
			t.Fatalf("expected Updated Member, got %v", user["display_name"])
		}
	})

	t.Run("UpdateRole", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "PATCH", ts.URL+"/api/v1/admin/users/"+memberID, adminToken, map[string]any{
			"role": "admin",
		})
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		// Change back
		testutil.JSON(t, "PATCH", ts.URL+"/api/v1/admin/users/"+memberID, adminToken, map[string]any{"role": "member"})
	})

	t.Run("CannotChangeOwnRole", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "PATCH", ts.URL+"/api/v1/admin/users/"+adminID, adminToken, map[string]any{
			"role": "member",
		})
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("DisableUser", func(t *testing.T) {
		resp, data := testutil.JSON(t, "PATCH", ts.URL+"/api/v1/admin/users/"+memberID, adminToken, map[string]any{
			"disabled": true,
		})
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		user := data["user"].(map[string]any)
		if user["disabled"] != true {
			t.Fatal("expected disabled=true")
		}
		// Re-enable
		testutil.JSON(t, "PATCH", ts.URL+"/api/v1/admin/users/"+memberID, adminToken, map[string]any{"disabled": false})
	})

	t.Run("NotFound", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "PATCH", ts.URL+"/api/v1/admin/users/nonexistent", adminToken, map[string]any{
			"display_name": "X",
		})
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})
}

func TestAdminDeleteUser(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	adminID, _ := getAdminAndMemberIDs(t, s)

	// Create a user to delete
	resp, data := testutil.JSON(t, "POST", ts.URL+"/api/v1/admin/users", adminToken, map[string]string{
		"email": "todelete@test.com", "password": "password123", "display_name": "DeleteMe",
	})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("setup failed: %d", resp.StatusCode)
	}
	deleteID := data["user"].(map[string]any)["id"].(string)

	t.Run("DeleteUser", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/api/v1/admin/users/"+deleteID, adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
	})

	t.Run("CannotDeleteSelf", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/api/v1/admin/users/"+adminID, adminToken, nil)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("NotFound", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/api/v1/admin/users/nonexistent", adminToken, nil)
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})
}

func TestAdminAPIKey(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	_, memberID := getAdminAndMemberIDs(t, s)

	t.Run("GenerateAPIKey", func(t *testing.T) {
		resp, data := testutil.JSON(t, "POST", ts.URL+"/api/v1/admin/users/"+memberID+"/api-key", adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		if data["api_key"] == nil || data["api_key"] == "" {
			t.Fatal("expected api_key in response")
		}
	})

	t.Run("DeleteAPIKey", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/api/v1/admin/users/"+memberID+"/api-key", adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
	})

	t.Run("NotFound", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "POST", ts.URL+"/api/v1/admin/users/nonexistent/api-key", adminToken, nil)
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})
}

func TestAdminPermissions(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	adminID, memberID := getAdminAndMemberIDs(t, s)

	t.Run("AdminGetPermissions", func(t *testing.T) {
		resp, data := testutil.JSON(t, "GET", ts.URL+"/api/v1/admin/users/"+adminID+"/permissions", adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		perms := data["permissions"].([]any)
		if len(perms) == 0 {
			t.Fatal("expected permissions")
		}
		if perms[0] != "*" {
			t.Fatalf("expected *, got %v", perms[0])
		}
	})

	t.Run("MemberGetPermissions", func(t *testing.T) {
		resp, data := testutil.JSON(t, "GET", ts.URL+"/api/v1/admin/users/"+memberID+"/permissions", adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		perms := data["permissions"].([]any)
		if len(perms) == 0 {
			t.Fatal("expected permissions for member")
		}
	})

	t.Run("GrantPermission", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "POST", ts.URL+"/api/v1/admin/users/"+memberID+"/permissions", adminToken, map[string]string{
			"permission": "custom.test", "scope": "test:1",
		})
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
	})

	t.Run("DuplicatePermission", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "POST", ts.URL+"/api/v1/admin/users/"+memberID+"/permissions", adminToken, map[string]string{
			"permission": "custom.test", "scope": "test:1",
		})
		if resp.StatusCode != http.StatusConflict {
			t.Fatalf("expected 409, got %d", resp.StatusCode)
		}
	})

	t.Run("RevokePermission", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/api/v1/admin/users/"+memberID+"/permissions", adminToken, map[string]string{
			"permission": "custom.test", "scope": "test:1",
		})
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
	})

	t.Run("RevokeNotFound", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/api/v1/admin/users/"+memberID+"/permissions", adminToken, map[string]string{
			"permission": "nonexistent.perm",
		})
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})
}

func TestAdminInvites(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")

	var inviteCode string

	t.Run("CreateInvite", func(t *testing.T) {
		resp, data := testutil.JSON(t, "POST", ts.URL+"/api/v1/admin/invites", adminToken, map[string]any{})
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		invite := data["invite"].(map[string]any)
		inviteCode = invite["code"].(string)
		if inviteCode == "" {
			t.Fatal("expected invite code")
		}
	})

	t.Run("CreateInviteWithExpiry", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "POST", ts.URL+"/api/v1/admin/invites", adminToken, map[string]any{
			"expires_in_hours": 24,
		})
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
	})

	t.Run("ListInvites", func(t *testing.T) {
		resp, data := testutil.JSON(t, "GET", ts.URL+"/api/v1/admin/invites", adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		invites := data["invites"].([]any)
		if len(invites) < 2 {
			t.Fatalf("expected at least 2 invites, got %d", len(invites))
		}
	})

	t.Run("DeleteInvite", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/api/v1/admin/invites/"+inviteCode, adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
	})

	t.Run("DeleteInviteNotFound", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/api/v1/admin/invites/nonexistent", adminToken, nil)
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})
}

func TestAdminChannels(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")

	t.Run("ListChannels", func(t *testing.T) {
		resp, data := testutil.JSON(t, "GET", ts.URL+"/api/v1/admin/channels", adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		channels := data["channels"].([]any)
		if len(channels) == 0 {
			t.Fatal("expected at least 1 channel")
		}
	})

	t.Run("ForceDeleteChannel", func(t *testing.T) {
		ch := testutil.CreateChannel(t, ts.URL, adminToken, "admin-delete-test", "public")
		chID := ch["id"].(string)
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/api/v1/admin/channels/"+chID+"/force", adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
	})

	t.Run("CannotDeleteGeneral", func(t *testing.T) {
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
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/api/v1/admin/channels/"+generalID+"/force", adminToken, nil)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("CannotDeleteDM", func(t *testing.T) {
		_, memberID := getAdminAndMemberIDs(t, s)
		resp, data := testutil.JSON(t, "POST", ts.URL+"/api/v1/dm/"+memberID, adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Skip("DM creation failed")
		}
		dmCh := data["channel"].(map[string]any)
		dmID := dmCh["id"].(string)
		resp2, _ := testutil.JSON(t, "DELETE", ts.URL+"/api/v1/admin/channels/"+dmID+"/force", adminToken, nil)
		if resp2.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp2.StatusCode)
		}
	})

	t.Run("NotFound", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/api/v1/admin/channels/nonexistent/force", adminToken, nil)
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})
}
