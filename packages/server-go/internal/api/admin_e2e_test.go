package api_test

import (
	"net/http"
	"testing"

	"borgee-server/internal/testutil"
)

func TestP1AdminManagementPanel(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	adminToken := testutil.LoginAs(t, ts.URL, "admin@test.com", "password123")
	memberToken := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")

	resp, data := testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/admin/users", memberToken, nil)
	requireStatus(t, resp, http.StatusForbidden, data)

	resp, data = testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/admin/users", adminToken, map[string]string{
		"email":        "panel-user@test.com",
		"password":     "password123",
		"display_name": "Panel User",
		"role":         "member",
	})
	requireStatus(t, resp, http.StatusCreated, data)
	userID := stringField(t, data["user"].(map[string]any), "id")

	resp, data = testutil.JSON(t, http.MethodPatch, ts.URL+"/api/v1/admin/users/"+userID, adminToken, map[string]any{"display_name": "Panel Renamed", "require_mention": false})
	requireStatus(t, resp, http.StatusOK, data)
	updated := data["user"].(map[string]any)
	if updated["display_name"] != "Panel Renamed" || updated["require_mention"] != false {
		t.Fatalf("admin update failed: %v", updated)
	}

	resp, data = testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/admin/users/"+userID+"/api-key", adminToken, nil)
	requireStatus(t, resp, http.StatusOK, data)
	if data["api_key"] == "" {
		t.Fatalf("expected generated API key: %v", data)
	}

	resp, data = testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/admin/users/"+userID+"/permissions", adminToken, map[string]string{"permission": "channel.delete", "scope": "*"})
	requireStatus(t, resp, http.StatusCreated, data)
	resp, data = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/admin/users/"+userID+"/permissions", adminToken, nil)
	requireStatus(t, resp, http.StatusOK, data)
	if !stringSliceContains(data["permissions"].([]any), "channel.delete") {
		t.Fatalf("granted permission missing: %v", data)
	}
	resp, data = testutil.JSON(t, http.MethodDelete, ts.URL+"/api/v1/admin/users/"+userID+"/permissions", adminToken, map[string]string{"permission": "channel.delete", "scope": "*"})
	requireStatus(t, resp, http.StatusOK, data)

	resp, data = testutil.JSON(t, http.MethodPost, ts.URL+"/api/v1/admin/invites", adminToken, map[string]any{"note": "panel invite", "expires_in_hours": 1})
	requireStatus(t, resp, http.StatusCreated, data)
	code := stringField(t, data["invite"].(map[string]any), "code")
	resp, data = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/admin/invites", adminToken, nil)
	requireStatus(t, resp, http.StatusOK, data)
	if !containsObjectWithCode(data["invites"].([]any), code) {
		t.Fatalf("invite missing from admin list: %v", data)
	}
	resp, data = testutil.JSON(t, http.MethodDelete, ts.URL+"/api/v1/admin/invites/"+code, adminToken, nil)
	requireStatus(t, resp, http.StatusOK, data)

	ch := testutil.CreateChannel(t, ts.URL, adminToken, "Panel Force Delete", "public")
	resp, data = testutil.JSON(t, http.MethodGet, ts.URL+"/api/v1/admin/channels", adminToken, nil)
	requireStatus(t, resp, http.StatusOK, data)
	if !containsObjectWithID(data["channels"].([]any), stringField(t, ch, "id")) {
		t.Fatalf("channel missing from admin list: %v", data)
	}
	resp, data = testutil.JSON(t, http.MethodDelete, ts.URL+"/api/v1/admin/channels/"+stringField(t, ch, "id")+"/force", adminToken, nil)
	requireStatus(t, resp, http.StatusOK, data)

	resp, data = testutil.JSON(t, http.MethodDelete, ts.URL+"/api/v1/admin/users/"+userID+"/api-key", adminToken, nil)
	requireStatus(t, resp, http.StatusOK, data)
	resp, data = testutil.JSON(t, http.MethodDelete, ts.URL+"/api/v1/admin/users/"+userID, adminToken, nil)
	requireStatus(t, resp, http.StatusOK, data)
}

func stringSliceContains(items []any, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}

func containsObjectWithCode(items []any, code string) bool {
	for _, raw := range items {
		m, ok := raw.(map[string]any)
		if ok && m["code"] == code {
			return true
		}
	}
	return false
}
