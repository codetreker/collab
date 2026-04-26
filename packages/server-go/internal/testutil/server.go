package testutil

import (
	"bufio"
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"borgee-server/internal/config"
	"borgee-server/internal/server"
	"borgee-server/internal/store"

	"github.com/gorilla/websocket"
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
		AdminUser:     "admin",
		AdminPassword: "password123",
		UploadDir:     t.TempDir(),
		WorkspaceDir:  t.TempDir(),
		ClientDist:    t.TempDir(),
		CORSOrigin:    "*",
	}

	ownerHash, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.MinCost)
	ownerEmail := "owner@test.com"
	owner := &store.User{
		DisplayName:  "Owner",
		Role:         "admin",
		Email:        &ownerEmail,
		PasswordHash: string(ownerHash),
	}
	if err := s.CreateUser(owner); err != nil {
		t.Fatalf("create owner: %v", err)
	}
	if err := s.GrantDefaultPermissions(owner.ID, "admin"); err != nil {
		t.Fatalf("grant owner perms: %v", err)
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
		CreatedBy: owner.ID,
	})

	general := &store.Channel{
		Name:       "general",
		Visibility: "public",
		CreatedBy:  owner.ID,
		Type:       "channel",
		Position:   store.GenerateInitialRank(),
	}
	if err := s.CreateChannel(general); err != nil {
		t.Fatalf("create general: %v", err)
	}
	s.AddChannelMember(&store.ChannelMember{ChannelID: general.ID, UserID: owner.ID})
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

func LoginAsAdmin(t *testing.T, serverURL string) string {
	t.Helper()

	body, _ := json.Marshal(map[string]string{"username": "admin", "password": "password123"})
	resp, err := http.Post(serverURL+"/admin-api/v1/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("admin login request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("admin login failed (%d): %s", resp.StatusCode, b)
	}

	for _, c := range resp.Cookies() {
		if c.Name == "borgee_admin_token" {
			return c.Value
		}
	}
	t.Fatal("no borgee_admin_token cookie in admin login response")
	return ""
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
		if c.Name == "borgee_token" {
			return c.Value
		}
	}
	t.Fatal("no borgee_token cookie in login response")
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
		req.AddCookie(&http.Cookie{Name: "borgee_token", Value: token})
		req.Header.Set("Authorization", "Bearer "+token)
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

func GetGeneralChannelID(t *testing.T, serverURL, token string) string {
	t.Helper()
	resp, data := JSON(t, http.MethodGet, serverURL+"/api/v1/channels", token, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list channels: status %d, body %v", resp.StatusCode, data)
	}
	channels, ok := data["channels"].([]any)
	if !ok {
		t.Fatalf("expected channels array, got %v", data)
	}
	for _, raw := range channels {
		ch, ok := raw.(map[string]any)
		if ok && ch["name"] == "general" {
			id, ok := ch["id"].(string)
			if !ok || id == "" {
				t.Fatalf("expected non-empty general channel id in %v", ch)
			}
			return id
		}
	}
	t.Fatal("general channel not found")
	return ""
}

func GetUserIDByName(t *testing.T, serverURL, token, displayName string) string {
	t.Helper()
	resp, data := JSON(t, http.MethodGet, serverURL+"/api/v1/users", token, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list users: status %d, body %v", resp.StatusCode, data)
	}
	users, ok := data["users"].([]any)
	if !ok {
		t.Fatalf("expected users array, got %v", data)
	}
	for _, raw := range users {
		u, ok := raw.(map[string]any)
		if ok && u["display_name"] == displayName {
			id, ok := u["id"].(string)
			if !ok || id == "" {
				t.Fatalf("expected non-empty user id in %v", u)
			}
			return id
		}
	}
	t.Fatalf("user %q not found", displayName)
	return ""
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

func DialWS(t *testing.T, serverURL, path, token string) *websocket.Conn {
	t.Helper()
	if path == "" {
		path = "/ws"
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	wsURL := "ws" + strings.TrimPrefix(serverURL, "http") + path
	header := http.Header{}
	if token != "" {
		header.Set("Cookie", "borgee_token="+url.QueryEscape(token))
		header.Set("Authorization", "Bearer "+token)
	}

	dialer := websocket.Dialer{HandshakeTimeout: 5 * time.Second}
	conn, _, err := dialer.Dial(wsURL, header)
	if err != nil {
		t.Fatalf("ws dial %s: %v", path, err)
	}
	t.Cleanup(func() { conn.Close() })
	return conn
}

func WSWriteJSON(t *testing.T, conn *websocket.Conn, v any) {
	t.Helper()
	if err := conn.SetWriteDeadline(time.Now().Add(5 * time.Second)); err != nil {
		t.Fatalf("ws set write deadline: %v", err)
	}
	if err := conn.WriteJSON(v); err != nil {
		t.Fatalf("ws write json: %v", err)
	}
}

func WSReadJSON(t *testing.T, conn *websocket.Conn) map[string]any {
	t.Helper()
	if err := conn.SetReadDeadline(time.Now().Add(5 * time.Second)); err != nil {
		t.Fatalf("ws set read deadline: %v", err)
	}
	var msg map[string]any
	if err := conn.ReadJSON(&msg); err != nil {
		t.Fatalf("ws read json: %v", err)
	}
	return msg
}

func WSReadUntil(t *testing.T, conn *websocket.Conn, eventType string) map[string]any {
	t.Helper()
	for {
		msg := WSReadJSON(t, conn)
		if msg["type"] == eventType {
			return msg
		}
	}
}

type SSEEvent struct {
	Event string
	ID    string
	Data  string
}

type SSEClient struct {
	resp    *http.Response
	scanner *bufio.Scanner
}

func DialSSE(t *testing.T, serverURL, token string) *SSEClient {
	return DialSSEWithLastEventID(t, serverURL, token, "")
}

func DialSSEWithLastEventID(t *testing.T, serverURL, token, lastID string) *SSEClient {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, serverURL+"/api/v1/stream", nil)
	if err != nil {
		t.Fatalf("new sse request: %v", err)
	}
	req.Header.Set("Accept", "text/event-stream")
	if lastID != "" {
		req.Header.Set("Last-Event-ID", lastID)
	}
	if token != "" {
		req.AddCookie(&http.Cookie{Name: "borgee_token", Value: token})
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("sse connect: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		t.Fatalf("sse connect status %d: %s", resp.StatusCode, b)
	}

	scanner := bufio.NewScanner(resp.Body)
	client := &SSEClient{resp: resp, scanner: scanner}
	t.Cleanup(client.Close)
	return client
}

func (c *SSEClient) Close() {
	if c != nil && c.resp != nil && c.resp.Body != nil {
		c.resp.Body.Close()
	}
}

func (c *SSEClient) ReadEvent(t *testing.T) SSEEvent {
	t.Helper()
	event := SSEEvent{}
	for c.scanner.Scan() {
		line := c.scanner.Text()
		if line == "" {
			if event.Event != "" || event.ID != "" || event.Data != "" {
				return event
			}
			continue
		}
		if strings.HasPrefix(line, ":") {
			continue
		}
		if v, ok := strings.CutPrefix(line, "event: "); ok {
			event.Event = v
			continue
		}
		if v, ok := strings.CutPrefix(line, "id: "); ok {
			event.ID = v
			continue
		}
		if v, ok := strings.CutPrefix(line, "data: "); ok {
			if event.Data != "" {
				event.Data += "\n"
			}
			event.Data += v
		}
	}
	if err := c.scanner.Err(); err != nil {
		t.Fatalf("sse read: %v", err)
	}
	t.Fatal("sse stream ended")
	return SSEEvent{}
}

func CreateAgent(t *testing.T, serverURL, token, displayName string) map[string]any {
	t.Helper()
	resp, data := JSON(t, http.MethodPost, serverURL+"/api/v1/agents", token, map[string]any{
		"display_name": displayName,
	})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create agent %q: status %d, body %v", displayName, resp.StatusCode, data)
	}
	agent, _ := data["agent"].(map[string]any)
	return agent
}
