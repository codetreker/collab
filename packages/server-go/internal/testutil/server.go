package testutil

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"collab-server/internal/config"
	"collab-server/internal/server"
	"collab-server/internal/store"

	"golang.org/x/crypto/bcrypt"
)

func NewTestServer(t *testing.T) (*httptest.Server, *store.Store, *config.Config) {
	t.Helper()

	s, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	if err := s.Migrate(); err != nil {
		t.Fatalf("store.Migrate: %v", err)
	}

	cfg := &config.Config{
		JWTSecret:     "test-secret",
		NodeEnv:       "development",
		DevAuthBypass: false,
		UploadDir:     t.TempDir(),
		WorkspaceDir:  t.TempDir(),
		ClientDist:    t.TempDir(),
		CORSOrigin:    "*",
	}

	adminHash, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.MinCost)
	adminEmail := "admin@test.com"
	admin := &store.User{
		DisplayName:  "Admin",
		Role:         "admin",
		Email:        &adminEmail,
		PasswordHash: string(adminHash),
	}
	if err := s.CreateUser(admin); err != nil {
		t.Fatalf("create admin: %v", err)
	}
	if err := s.GrantDefaultPermissions(admin.ID, "admin"); err != nil {
		t.Fatalf("grant admin perms: %v", err)
	}

	memberHash, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.MinCost)
	memberEmail := "member@test.com"
	member := &store.User{
		DisplayName:  "Member",
		Role:         "member",
		Email:        &memberEmail,
		PasswordHash: string(memberHash),
	}
	if err := s.CreateUser(member); err != nil {
		t.Fatalf("create member: %v", err)
	}
	if err := s.GrantDefaultPermissions(member.ID, "member"); err != nil {
		t.Fatalf("grant member perms: %v", err)
	}

	s.DB().Create(&store.InviteCode{
		Code:      "test-invite",
		CreatedBy: admin.ID,
	})

	general := &store.Channel{
		Name:       "general",
		Visibility: "public",
		CreatedBy:  admin.ID,
		Type:       "channel",
		Position:   store.GenerateInitialRank(),
	}
	if err := s.CreateChannel(general); err != nil {
		t.Fatalf("create general: %v", err)
	}
	s.AddChannelMember(&store.ChannelMember{ChannelID: general.ID, UserID: admin.ID})
	s.AddChannelMember(&store.ChannelMember{ChannelID: general.ID, UserID: member.ID})

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv := server.New(cfg, logger, s)
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(func() {
		ts.Close()
		s.Close()
	})

	return ts, s, cfg
}

func LoginAs(t *testing.T, serverURL, email, password string) string {
	t.Helper()

	body, _ := json.Marshal(map[string]string{"email": email, "password": password})
	resp, err := http.Post(serverURL+"/api/v1/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("login request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("login failed (%d): %s", resp.StatusCode, b)
	}

	for _, c := range resp.Cookies() {
		if c.Name == "collab_token" {
			return c.Value
		}
	}
	t.Fatal("no collab_token cookie in login response")
	return ""
}

func JSON(t *testing.T, method, url, token string, body any) (*http.Response, map[string]any) {
	t.Helper()

	var reqBody io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		reqBody = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, url, reqBody)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.AddCookie(&http.Cookie{Name: "collab_token", Value: token})
	}

	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}

	respBody, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	var result map[string]any
	json.Unmarshal(respBody, &result)
	return resp, result
}

func CreateChannel(t *testing.T, serverURL, token, name, visibility string) map[string]any {
	t.Helper()
	resp, data := JSON(t, "POST", serverURL+"/api/v1/channels", token, map[string]string{
		"name":       name,
		"visibility": visibility,
	})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create channel %q: status %d, body %v", name, resp.StatusCode, data)
	}
	ch, _ := data["channel"].(map[string]any)
	return ch
}

func PostMessage(t *testing.T, serverURL, token, channelID, content string) map[string]any {
	t.Helper()
	resp, data := JSON(t, "POST", serverURL+"/api/v1/channels/"+channelID+"/messages", token, map[string]string{
		"content": content,
	})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("post message: status %d, body %v", resp.StatusCode, data)
	}
	msg, _ := data["message"].(map[string]any)
	return msg
}
