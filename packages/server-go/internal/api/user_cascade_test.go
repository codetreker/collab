package api_test

import (
	"net/http"
	"testing"

	"borgee-server/internal/store"
	"borgee-server/internal/testutil"
)

func TestP0UserDeleteCascadesAgentsAndData(t *testing.T) {
	ts, s, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	memberToken := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")
	memberID := getUserIDByName(t, ts.URL, adminToken, "Member")
	generalID := getGeneralChannelID(t, ts.URL, adminToken)

	agent := testutil.CreateAgent(t, ts.URL, memberToken, "Owned Cascade Bot")
	agentID := stringField(t, agent, "id")
	agentKey := stringField(t, agent, "api_key")

	resp, data := testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/admin/users/"+memberID+"/permissions", adminToken, map[string]string{
		"permission": "channel.manage_members",
		"scope":      "channel:" + generalID,
	})
	requireStatus(t, resp, http.StatusCreated, data)

	resp, data = testutil.JSON(t, http.MethodDelete, ts.URL+"/api/v1/admin/users/"+memberID, adminToken, nil)
	requireStatus(t, resp, http.StatusOK, data)

	if _, err := s.GetUserByID(memberID); err == nil {
		t.Fatal("expected deleted member to be hidden from GetUserByID")
	}
	if _, err := s.GetAgent(agentID); err == nil {
		t.Fatal("expected owned agent to be soft deleted")
	}

	var memberLinks int64
	s.DB().Model(&store.ChannelMember{}).Where("user_id IN ?", []string{memberID, agentID}).Count(&memberLinks)
	if memberLinks != 0 {
		t.Fatalf("expected channel memberships removed for user and agent, got %d", memberLinks)
	}

	var perms int64
	s.DB().Model(&store.UserPermission{}).Where("user_id IN ?", []string{memberID, agentID}).Count(&perms)
	if perms != 0 {
		t.Fatalf("expected permissions removed for user and agent, got %d", perms)
	}

	resp, data = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/users/me", agentKey, nil)
	requireStatus(t, resp, http.StatusUnauthorized, data)
	resp, data = testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/auth/login", "", map[string]string{"email": "member@test.com", "password": "password123"})
	requireStatus(t, resp, http.StatusUnauthorized, data)
}
