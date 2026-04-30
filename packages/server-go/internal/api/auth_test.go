package api

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"borgee-server/internal/auth"
	"borgee-server/internal/config"
	"borgee-server/internal/store"
)

func setupTest(t *testing.T) (*httptest.Server, *store.Store, *config.Config) {
	t.Helper()
	s := store.MigratedStoreFromTemplate(t)

	cfg := &config.Config{
		JWTSecret:     "test-secret",
		NodeEnv:       "development",
		DevAuthBypass: false,
	}

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelError}))

	mux := http.NewServeMux()
	h := &AuthHandler{Store: s, Config: cfg, Logger: logger}
	h.RegisterRoutes(mux)

	authMw := auth.AuthMiddleware(s, cfg)
	mux.Handle("GET /api/v1/users/me", authMw(http.HandlerFunc(h.HandleGetMe)))

	ts := httptest.NewServer(mux)
	t.Cleanup(ts.Close)

	return ts, s, cfg
}

func createTestUser(t *testing.T, s *store.Store, email, password, role string) *store.User {
	t.Helper()
	hash, _ := auth.HashPassword(password)
	user := &store.User{
		DisplayName:  "Test User",
		Role:         role,
		Email:        &email,
		PasswordHash: hash,
	}
	if err := s.CreateUser(user); err != nil {
		t.Fatal(err)
	}
	return user
}

func TestLoginSuccess(t *testing.T) {
	t.Parallel()
	ts, s, _ := setupTest(t)
	createTestUser(t, s, "user@test.com", "password123", "member")

	body, _ := json.Marshal(map[string]string{"email": "user@test.com", "password": "password123"})
	resp, err := http.Post(ts.URL+"/api/v1/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var result map[string]any
	json.NewDecoder(resp.Body).Decode(&result)
	if result["user"] == nil {
		t.Fatal("expected user in response")
	}

	cookies := resp.Cookies()
	found := false
	for _, c := range cookies {
		if c.Name == "borgee_token" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected borgee_token cookie")
	}
}

func TestLoginWrongPassword(t *testing.T) {
	t.Parallel()
	ts, s, _ := setupTest(t)
	createTestUser(t, s, "user@test.com", "password123", "member")

	body, _ := json.Marshal(map[string]string{"email": "user@test.com", "password": "wrong"})
	resp, err := http.Post(ts.URL+"/api/v1/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
}

func TestLoginMissingFields(t *testing.T) {
	t.Parallel()
	ts, _, _ := setupTest(t)

	body, _ := json.Marshal(map[string]string{"email": "user@test.com"})
	resp, err := http.Post(ts.URL+"/api/v1/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}

func TestRegisterSuccess(t *testing.T) {
	t.Parallel()
	ts, s, _ := setupTest(t)

	systemUser := createTestUser(t, s, "system@test.com", "password123", "member")

	now := time.Now().UnixMilli()
	s.DB().Create(&store.InviteCode{
		Code:      "valid-code",
		CreatedBy: systemUser.ID,
		CreatedAt: now,
	})

	body, _ := json.Marshal(map[string]string{
		"invite_code":  "valid-code",
		"email":        "new@test.com",
		"password":     "password123",
		"display_name": "New User",
	})
	resp, err := http.Post(ts.URL+"/api/v1/auth/register", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		var errResp map[string]any
		json.NewDecoder(resp.Body).Decode(&errResp)
		t.Fatalf("expected 201, got %d: %v", resp.StatusCode, errResp)
	}

	// CM-1.2 acceptance: API response must NOT expose org_id (blueprint §1.1).
	// Decode the user object out of the response and check for absence.
	var regResp struct {
		User map[string]any `json:"user"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&regResp); err != nil {
		t.Fatalf("decode register response: %v", err)
	}
	if _, leaked := regResp.User["org_id"]; leaked {
		t.Fatalf("CM-1.2: register response leaked org_id (%v) — sanitizer must not include it", regResp.User["org_id"])
	}

	// AP-0 acceptance: the freshly-registered human owns exactly one
	// permission row, the wildcard (*, *).
	var created store.User
	if err := s.DB().Where("email = ?", "new@test.com").First(&created).Error; err != nil {
		t.Fatalf("lookup new user: %v", err)
	}
	perms, err := s.ListUserPermissions(created.ID)
	if err != nil {
		t.Fatalf("list perms: %v", err)
	}
	if len(perms) != 1 {
		t.Fatalf("AP-0: expected 1 default permission row, got %d", len(perms))
	}
	if perms[0].Permission != "*" || perms[0].Scope != "*" {
		t.Fatalf("AP-0: expected (*, *), got (%s, %s)", perms[0].Permission, perms[0].Scope)
	}

	// CM-1.2 acceptance: registered user has a non-empty org_id pointing at
	// an organizations row that exists. 1 person = 1 org in v0.
	if created.OrgID == "" {
		t.Fatalf("CM-1.2: expected non-empty org_id on registered user")
	}
	var org store.Organization
	if err := s.DB().Where("id = ?", created.OrgID).First(&org).Error; err != nil {
		t.Fatalf("CM-1.2: org row for user.org_id=%q not found: %v", created.OrgID, err)
	}
	// Org count: only the new user's org should exist. systemUser was created
	// via the test helper which doesn't auto-create orgs, so count == 1.
	var orgCount int64
	if err := s.DB().Model(&store.Organization{}).Count(&orgCount).Error; err != nil {
		t.Fatalf("count organizations: %v", err)
	}
	if orgCount != 1 {
		t.Fatalf("CM-1.2: expected exactly 1 organization after register, got %d", orgCount)
	}
}

func TestRegisterDuplicateEmail(t *testing.T) {
	t.Parallel()
	ts, s, _ := setupTest(t)
	user := createTestUser(t, s, "dup@test.com", "password123", "member")

	now := time.Now().UnixMilli()
	s.DB().Create(&store.InviteCode{Code: "code2", CreatedBy: user.ID, CreatedAt: now})

	body, _ := json.Marshal(map[string]string{
		"invite_code":  "code2",
		"email":        "dup@test.com",
		"password":     "password123",
		"display_name": "Dup User",
	})
	resp, err := http.Post(ts.URL+"/api/v1/auth/register", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("expected 409, got %d", resp.StatusCode)
	}
}

func TestRegisterInvalidInvite(t *testing.T) {
	t.Parallel()
	ts, _, _ := setupTest(t)

	body, _ := json.Marshal(map[string]string{
		"invite_code":  "nonexistent",
		"email":        "new@test.com",
		"password":     "password123",
		"display_name": "New User",
	})
	resp, err := http.Post(ts.URL+"/api/v1/auth/register", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}
}

func TestLogout(t *testing.T) {
	t.Parallel()
	ts, _, _ := setupTest(t)

	resp, err := http.Post(ts.URL+"/api/v1/auth/logout", "application/json", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	for _, c := range resp.Cookies() {
		if c.Name == "borgee_token" && c.MaxAge < 0 {
			return
		}
	}
	t.Fatal("expected borgee_token cookie to be cleared")
}

func TestGetMeAuthenticated(t *testing.T) {
	t.Parallel()
	ts, s, cfg := setupTest(t)
	user := createTestUser(t, s, "me@test.com", "password123", "member")

	// Login first to get cookie
	body, _ := json.Marshal(map[string]string{"email": "me@test.com", "password": "password123"})
	loginResp, err := http.Post(ts.URL+"/api/v1/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	loginResp.Body.Close()
	_ = user
	_ = cfg

	var cookie *http.Cookie
	for _, c := range loginResp.Cookies() {
		if c.Name == "borgee_token" {
			cookie = c
		}
	}
	if cookie == nil {
		t.Fatal("no cookie")
	}

	req, _ := http.NewRequest("GET", ts.URL+"/api/v1/users/me", nil)
	req.AddCookie(cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var result map[string]any
	json.NewDecoder(resp.Body).Decode(&result)
	u := result["user"].(map[string]any)
	if u["permissions"] == nil {
		t.Fatal("expected permissions")
	}
}

func TestGetMeUnauthenticated(t *testing.T) {
	t.Parallel()
	ts, _, _ := setupTest(t)

	resp, err := http.Get(ts.URL + "/api/v1/users/me")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
}
