package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"borgee-server/internal/config"
	"borgee-server/internal/store"

	"github.com/golang-jwt/jwt/v5"
)

func TestValidateJWT(t *testing.T) {
	s := testStore(t)
	user := &store.User{ID: "jwt-user", DisplayName: "JWT User", Role: "member"}
	s.CreateUser(user)

	secret := "test-secret"
	claims := &Claims{
		UserID: user.ID,
		Email:  "test@test.com",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatal(err)
	}

	result := ValidateJWT(s, secret, signed)
	if result == nil {
		t.Fatal("expected user")
	}
	if result.ID != user.ID {
		t.Fatal("user mismatch")
	}

	result2 := ValidateJWT(s, "wrong-secret", signed)
	if result2 != nil {
		t.Fatal("expected nil with wrong secret")
	}

	result3 := ValidateJWT(s, secret, "invalid-token")
	if result3 != nil {
		t.Fatal("expected nil with invalid token")
	}
}

func TestValidateJWT_ExpiredToken(t *testing.T) {
	s := testStore(t)
	user := &store.User{ID: "exp-user", DisplayName: "Expired", Role: "member"}
	s.CreateUser(user)

	secret := "test-secret"
	claims := &Claims{
		UserID: user.ID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Hour)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, _ := token.SignedString([]byte(secret))

	if ValidateJWT(s, secret, signed) != nil {
		t.Fatal("expected nil for expired token")
	}
}

func TestValidateJWT_DisabledUser(t *testing.T) {
	s := testStore(t)
	user := &store.User{ID: "dis-user", DisplayName: "Disabled", Role: "member", Disabled: true}
	s.CreateUser(user)

	secret := "test-secret"
	claims := &Claims{
		UserID: user.ID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, _ := token.SignedString([]byte(secret))

	if ValidateJWT(s, secret, signed) != nil {
		t.Fatal("expected nil for disabled user")
	}
}

func TestAuthMiddleware_Cookie(t *testing.T) {
	s := testStore(t)
	user := &store.User{ID: "mw-user", DisplayName: "MW User", Role: "member"}
	s.CreateUser(user)

	cfg := &config.Config{JWTSecret: "test-secret", NodeEnv: "development"}

	claims := &Claims{
		UserID: user.ID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, _ := token.SignedString([]byte(cfg.JWTSecret))

	handler := AuthMiddleware(s, cfg)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := UserFromContext(r.Context())
		if u == nil {
			t.Fatal("expected user in context")
		}
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.AddCookie(&http.Cookie{Name: "borgee_token", Value: signed})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestAuthMiddleware_BearerAPIKey(t *testing.T) {
	s := testStore(t)
	apiKey := "bgr_testapikey123"
	user := &store.User{ID: "bearer-user", DisplayName: "Bearer", Role: "member", APIKey: &apiKey}
	s.CreateUser(user)

	cfg := &config.Config{JWTSecret: "test-secret", NodeEnv: "development"}

	handler := AuthMiddleware(s, cfg)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := UserFromContext(r.Context())
		if u == nil {
			t.Fatal("expected user")
		}
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+apiKey)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestAuthMiddleware_Unauthorized(t *testing.T) {
	s := testStore(t)
	cfg := &config.Config{JWTSecret: "test-secret", NodeEnv: "production"}

	handler := AuthMiddleware(s, cfg)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestAuthMiddleware_DevBypass(t *testing.T) {
	s := testStore(t)
	user := &store.User{ID: "dev-user", DisplayName: "Dev User", Role: "admin"}
	s.CreateUser(user)

	cfg := &config.Config{JWTSecret: "test-secret", NodeEnv: "development", DevAuthBypass: true}

	handler := AuthMiddleware(s, cfg)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := UserFromContext(r.Context())
		if u == nil {
			t.Fatal("expected user")
		}
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("X-Dev-User-Id", user.ID)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestAuthMiddleware_DevBypassFallback(t *testing.T) {
	s := testStore(t)
	// ADM-0.3: dev fallback picks the first member (users.role enum collapsed).
	user := &store.User{ID: "fb-member", DisplayName: "FB Member", Role: "member"}
	s.CreateUser(user)

	cfg := &config.Config{JWTSecret: "test-secret", NodeEnv: "development", DevAuthBypass: true}

	handler := AuthMiddleware(s, cfg)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 from dev bypass fallback, got %d", rec.Code)
	}
}

func TestAuthenticateFlexible(t *testing.T) {
	s := testStore(t)
	apiKey := "bgr_flexkey123"
	user := &store.User{ID: "flex-user", DisplayName: "Flex", Role: "member", APIKey: &apiKey}
	s.CreateUser(user)

	cfg := &config.Config{JWTSecret: "test-secret", NodeEnv: "development"}

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+apiKey)

	result := AuthenticateFlexible(s, cfg, req)
	if result == nil {
		t.Fatal("expected user")
	}

	req2 := httptest.NewRequest("GET", "/", nil)
	result2 := AuthenticateFlexible(s, cfg, req2)
	if result2 != nil {
		t.Fatal("expected nil without auth")
	}
}

func TestAuthenticateFromAPIKey(t *testing.T) {
	s := testStore(t)
	apiKey := "bgr_fromkey123"
	user := &store.User{ID: "fromkey-user", DisplayName: "FromKey", Role: "member", APIKey: &apiKey}
	s.CreateUser(user)

	result := AuthenticateFromAPIKey(s, apiKey)
	if result == nil {
		t.Fatal("expected user")
	}

	result2 := AuthenticateFromAPIKey(s, "")
	if result2 != nil {
		t.Fatal("expected nil for empty key")
	}

	result3 := AuthenticateFromAPIKey(s, "invalid-key")
	if result3 != nil {
		t.Fatal("expected nil for invalid key")
	}
}

func TestAuthenticateFromQuery(t *testing.T) {
	s := testStore(t)
	apiKey := "bgr_querykey123"
	user := &store.User{ID: "query-user", DisplayName: "Query", Role: "member", APIKey: &apiKey}
	s.CreateUser(user)

	req := httptest.NewRequest("GET", "/?api_key="+apiKey, nil)
	result := AuthenticateFromQuery(s, req, "api_key")
	if result == nil {
		t.Fatal("expected user")
	}
}

func TestUserFromContext_Nil(t *testing.T) {
	ctx := context.Background()
	if UserFromContext(ctx) != nil {
		t.Fatal("expected nil")
	}
}

func TestRequirePermission_ScopedPermission(t *testing.T) {
	s := testStore(t)
	member := &store.User{ID: "scoped-m", DisplayName: "Scoped", Role: "member"}
	s.CreateUser(member)
	s.GrantPermission(&store.UserPermission{UserID: "scoped-m", Permission: "channel.delete", Scope: "channel:ch1"})

	handler := RequirePermission(s, "channel.delete", func(r *http.Request) string {
		return "channel:ch1"
	})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req = req.WithContext(context.WithValue(req.Context(), userContextKey, member))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	handler2 := RequirePermission(s, "channel.delete", func(r *http.Request) string {
		return "channel:ch2"
	})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req2 := httptest.NewRequest("GET", "/", nil)
	req2 = req2.WithContext(context.WithValue(req2.Context(), userContextKey, member))
	rec2 := httptest.NewRecorder()
	handler2.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for wrong scope, got %d", rec2.Code)
	}
}
