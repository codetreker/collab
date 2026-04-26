package api_test

import (
	"net/http"
	"testing"

	"borgee-server/internal/store"
	"borgee-server/internal/testutil"
)

func getOwnerAndMemberIDs(t *testing.T, s *store.Store) (string, string) {
	t.Helper()
	users, _ := s.ListUsers()
	var ownerID, memberID string
	for _, u := range users {
		if u.Email != nil && *u.Email == "owner@test.com" {
			ownerID = u.ID
		}
		if u.Email != nil && *u.Email == "member@test.com" {
			memberID = u.ID
		}
	}
	return ownerID, memberID
}

func TestAdminListUsers(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAsAdmin(t, ts.URL)
	memberToken := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")

	t.Run("AdminCanList", func(t *testing.T) {
		resp, data := testutil.JSON(t, "GET", ts.URL+"/admin-api/v1/users", adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		users := data["users"].([]any)
		if len(users) < 1 {
			t.Fatalf("expected at least 1 user, got %d", len(users))
		}
		for _, user := range users {
			if user.(map[string]any)["api_key"] != nil {
				t.Fatal("admin user list must not expose api_key")
			}
		}
	})

	t.Run("NonAdminUnauthorized", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "GET", ts.URL+"/admin-api/v1/users", memberToken, nil)
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", resp.StatusCode)
		}
	})
}

func TestAdminCreateUser(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAsAdmin(t, ts.URL)
	memberToken := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")

	t.Run("CreateMember", func(t *testing.T) {
		resp, data := testutil.JSON(t, "POST", ts.URL+"/admin-api/v1/users", adminToken, map[string]string{
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

	t.Run("RejectCreateAgent", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "POST", ts.URL+"/admin-api/v1/users", adminToken, map[string]string{
			"display_name": "TestBot", "role": "agent",
		})
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("MissingDisplayName", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "POST", ts.URL+"/admin-api/v1/users", adminToken, map[string]string{
			"email": "bad@test.com", "password": "password123",
		})
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("InvalidRole", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "POST", ts.URL+"/admin-api/v1/users", adminToken, map[string]string{
			"display_name": "Bad", "role": "superadmin", "email": "bad2@test.com", "password": "pass1234",
		})
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("NonAdminUnauthorized", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "POST", ts.URL+"/admin-api/v1/users", memberToken, map[string]string{
			"email": "x@test.com", "password": "password123", "display_name": "X",
		})
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", resp.StatusCode)
		}
	})
}

func TestAdminUpdateUser(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAsAdmin(t, ts.URL)
	_, memberID := getOwnerAndMemberIDs(t, s)

	t.Run("UpdateDisplayName", func(t *testing.T) {
		resp, data := testutil.JSON(t, "PATCH", ts.URL+"/admin-api/v1/users/"+memberID, adminToken, map[string]any{
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

	t.Run("RejectAdminRole", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "PATCH", ts.URL+"/admin-api/v1/users/"+memberID, adminToken, map[string]any{
			"role": "member",
		})
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		resp, _ = testutil.JSON(t, "PATCH", ts.URL+"/admin-api/v1/users/"+memberID, adminToken, map[string]any{"role": "admin"})
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400 for admin role, got %d", resp.StatusCode)
		}
	})

	t.Run("DisableUser", func(t *testing.T) {
		resp, data := testutil.JSON(t, "PATCH", ts.URL+"/admin-api/v1/users/"+memberID, adminToken, map[string]any{
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
		testutil.JSON(t, "PATCH", ts.URL+"/admin-api/v1/users/"+memberID, adminToken, map[string]any{"disabled": false})
	})

	t.Run("NotFound", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "PATCH", ts.URL+"/admin-api/v1/users/nonexistent", adminToken, map[string]any{
			"display_name": "X",
		})
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})
}

func TestAdminDeleteUser(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAsAdmin(t, ts.URL)

	// Create a user to delete
	resp, data := testutil.JSON(t, "POST", ts.URL+"/admin-api/v1/users", adminToken, map[string]string{
		"email": "todelete@test.com", "password": "password123", "display_name": "DeleteMe",
	})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("setup failed: %d", resp.StatusCode)
	}
	deleteID := data["user"].(map[string]any)["id"].(string)

	t.Run("DeleteUser", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/admin-api/v1/users/"+deleteID, adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
	})

	t.Run("NotFound", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/admin-api/v1/users/nonexistent", adminToken, nil)
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})
}

func TestAdminAPIKey(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAsAdmin(t, ts.URL)
	_, memberID := getOwnerAndMemberIDs(t, s)

	t.Run("GenerateAPIKey", func(t *testing.T) {
		resp, data := testutil.JSON(t, "POST", ts.URL+"/admin-api/v1/users/"+memberID+"/api-key", adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		if data["ok"] != true || data["api_key"] != nil {
			t.Fatal("expected ok only in response")
		}
	})

	t.Run("DeleteAPIKey", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/admin-api/v1/users/"+memberID+"/api-key", adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
	})

	t.Run("NotFound", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "POST", ts.URL+"/admin-api/v1/users/nonexistent/api-key", adminToken, nil)
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})
}

func TestAdminStatsAndUserAgents(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAsAdmin(t, ts.URL)
	ownerToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	ownerID, _ := getOwnerAndMemberIDs(t, s)

	resp, data := testutil.JSON(t, "GET", ts.URL+"/admin-api/v1/stats", adminToken, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected stats 200, got %d: %v", resp.StatusCode, data)
	}
	if data["user_count"] == nil || data["channel_count"] == nil || data["online_count"] == nil {
		t.Fatalf("missing stats fields: %v", data)
	}

	resp, data = testutil.JSON(t, "POST", ts.URL+"/api/v1/agents", ownerToken, map[string]any{"display_name": "Admin View Bot"})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create agent: %d %v", resp.StatusCode, data)
	}

	resp, data = testutil.JSON(t, "GET", ts.URL+"/admin-api/v1/users/"+ownerID+"/agents", adminToken, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected agents 200, got %d: %v", resp.StatusCode, data)
	}
	agents := data["agents"].([]any)
	if len(agents) != 1 {
		t.Fatalf("expected 1 agent, got %d", len(agents))
	}
	if agents[0].(map[string]any)["api_key"] != nil {
		t.Fatal("agent list must not expose api_key")
	}

	resp, _ = testutil.JSON(t, "GET", ts.URL+"/admin-api/v1/users/missing/agents", adminToken, nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected missing owner 404, got %d", resp.StatusCode)
	}
}

func TestAdminPermissions(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAsAdmin(t, ts.URL)
	_, memberID := getOwnerAndMemberIDs(t, s)

	t.Run("MemberGetPermissions", func(t *testing.T) {
		resp, data := testutil.JSON(t, "GET", ts.URL+"/admin-api/v1/users/"+memberID+"/permissions", adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		perms := data["permissions"].([]any)
		if len(perms) == 0 {
			t.Fatal("expected permissions for member")
		}
	})

	t.Run("GrantPermission", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "POST", ts.URL+"/admin-api/v1/users/"+memberID+"/permissions", adminToken, map[string]string{
			"permission": "custom.test", "scope": "test:1",
		})
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
	})

	t.Run("DuplicatePermission", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "POST", ts.URL+"/admin-api/v1/users/"+memberID+"/permissions", adminToken, map[string]string{
			"permission": "custom.test", "scope": "test:1",
		})
		if resp.StatusCode != http.StatusConflict {
			t.Fatalf("expected 409, got %d", resp.StatusCode)
		}
	})

	t.Run("RevokePermission", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/admin-api/v1/users/"+memberID+"/permissions", adminToken, map[string]string{
			"permission": "custom.test", "scope": "test:1",
		})
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
	})

	t.Run("RevokeNotFound", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/admin-api/v1/users/"+memberID+"/permissions", adminToken, map[string]string{
			"permission": "nonexistent.perm",
		})
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})
}

func TestAdminInvites(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAsAdmin(t, ts.URL)

	var inviteCode string

	t.Run("CreateInvite", func(t *testing.T) {
		resp, data := testutil.JSON(t, "POST", ts.URL+"/admin-api/v1/invites", adminToken, map[string]any{})
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
		resp, _ := testutil.JSON(t, "POST", ts.URL+"/admin-api/v1/invites", adminToken, map[string]any{
			"expires_in_hours": 24,
		})
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
	})

	t.Run("ListInvites", func(t *testing.T) {
		resp, data := testutil.JSON(t, "GET", ts.URL+"/admin-api/v1/invites", adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		invites := data["invites"].([]any)
		if len(invites) < 2 {
			t.Fatalf("expected at least 2 invites, got %d", len(invites))
		}
	})

	t.Run("DeleteInvite", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/admin-api/v1/invites/"+inviteCode, adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
	})

	t.Run("DeleteInviteNotFound", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/admin-api/v1/invites/nonexistent", adminToken, nil)
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})
}

func TestAdminChannels(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAsAdmin(t, ts.URL)
	ownerToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")

	t.Run("ListChannels", func(t *testing.T) {
		resp, data := testutil.JSON(t, "GET", ts.URL+"/admin-api/v1/channels", adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		channels := data["channels"].([]any)
		if len(channels) == 0 {
			t.Fatal("expected at least 1 channel")
		}
	})

	t.Run("ForceDeleteChannel", func(t *testing.T) {
		ch := testutil.CreateChannel(t, ts.URL, ownerToken, "admin-delete-test", "public")
		chID := ch["id"].(string)
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/admin-api/v1/channels/"+chID+"/force", adminToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
	})

	t.Run("CannotDeleteGeneral", func(t *testing.T) {
		_, chData := testutil.JSON(t, "GET", ts.URL+"/api/v1/channels", ownerToken, nil)
		channels := chData["channels"].([]any)
		var generalID string
		for _, c := range channels {
			cm := c.(map[string]any)
			if cm["name"] == "general" {
				generalID = cm["id"].(string)
				break
			}
		}
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/admin-api/v1/channels/"+generalID+"/force", adminToken, nil)
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp.StatusCode)
		}
	})

	t.Run("CannotDeleteDM", func(t *testing.T) {
		_, memberID := getOwnerAndMemberIDs(t, s)
		resp, data := testutil.JSON(t, "POST", ts.URL+"/api/v1/dm/"+memberID, ownerToken, nil)
		if resp.StatusCode != http.StatusOK {
			t.Skip("DM creation failed")
		}
		dmCh := data["channel"].(map[string]any)
		dmID := dmCh["id"].(string)
		resp2, _ := testutil.JSON(t, "DELETE", ts.URL+"/admin-api/v1/channels/"+dmID+"/force", adminToken, nil)
		if resp2.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", resp2.StatusCode)
		}
	})

	t.Run("NotFound", func(t *testing.T) {
		resp, _ := testutil.JSON(t, "DELETE", ts.URL+"/admin-api/v1/channels/nonexistent/force", adminToken, nil)
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})
}
