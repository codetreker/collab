package api_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"borgee-server/internal/testutil"
)

func TestAdminAuthLoginMeLogout(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)

	body, _ := json.Marshal(map[string]string{"username": "admin", "password": "password123"})
	resp, err := http.Post(ts.URL+"/admin-api/v1/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, b)
	}

	var data map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		t.Fatalf("decode login: %v", err)
	}
	token, _ := data["token"].(string)
	if token == "" {
		t.Fatal("expected token")
	}

	meReq, _ := http.NewRequest("GET", ts.URL+"/admin-api/v1/auth/me", nil)
	meReq.Header.Set("Authorization", "Bearer "+token)
	meResp, err := http.DefaultClient.Do(meReq)
	if err != nil {
		t.Fatalf("me: %v", err)
	}
	defer meResp.Body.Close()
	if meResp.StatusCode != http.StatusOK {
		t.Fatalf("expected me 200, got %d", meResp.StatusCode)
	}

	var me map[string]any
	if err := json.NewDecoder(meResp.Body).Decode(&me); err != nil {
		t.Fatalf("decode me: %v", err)
	}
	if me["role"] != "admin" || me["username"] != "admin" {
		t.Fatalf("unexpected me payload: %v", me)
	}

	logoutResp, logoutData := testutil.JSON(t, "POST", ts.URL+"/admin-api/v1/auth/logout", token, nil)
	if logoutResp.StatusCode != http.StatusOK || logoutData["ok"] != true {
		t.Fatalf("expected logout ok, got %d %v", logoutResp.StatusCode, logoutData)
	}
}

func TestAdminAuthRejectsUserTokenAndUserAuthRejectsAdminToken(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	userToken := testutil.LoginAs(t, ts.URL, "member@test.com", "password123")
	adminToken := testutil.LoginAsAdmin(t, ts.URL)

	resp, _ := testutil.JSON(t, "GET", ts.URL+"/admin-api/v1/auth/me", userToken, nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected user token rejected by admin auth, got %d", resp.StatusCode)
	}

	resp, _ = testutil.JSON(t, "GET", ts.URL+"/api/v1/users/me", adminToken, nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected admin token rejected by user auth, got %d", resp.StatusCode)
	}
}

func TestAdminAuthBadCredentials(t *testing.T) {
	ts, _, _ := testutil.NewTestServer(t)
	body, _ := json.Marshal(map[string]string{"username": "admin", "password": "wrong"})
	resp, err := http.Post(ts.URL+"/admin-api/v1/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
}
