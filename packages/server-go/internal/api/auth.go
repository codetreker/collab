package api

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"

	"borgee-server/internal/auth"
	"borgee-server/internal/config"
	"borgee-server/internal/store"
	"borgee-server/internal/testutil/clock"

	"github.com/golang-jwt/jwt/v5"
)

type AuthHandler struct {
	Store  *store.Store
	Config *config.Config
	Logger *slog.Logger
	// Clock is the time source for JWT iat/exp minting. nil → Real (production
	// path byte-identical: time.Now()). Tests inject *clock.Fake to skip JWT
	// 1s iat granularity wait without sleeping (PERF-JWT-CLOCK).
	Clock clock.Clock
}

// now returns the handler's current time, falling back to Real when Clock is
// nil (backward-compat — existing prod construction sites do not pass Clock).
func (h *AuthHandler) now() time.Time {
	if h.Clock != nil {
		return h.Clock.Now()
	}
	return time.Now()
}

var emailRegexp = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

func (h *AuthHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/auth/login", h.handleLogin)
	mux.HandleFunc("POST /api/v1/auth/register", h.handleRegister)
	mux.HandleFunc("POST /api/v1/auth/logout", h.handleLogout)
}

func (h *AuthHandler) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}

	email := strings.ToLower(strings.TrimSpace(body.Email))
	if email == "" || body.Password == "" {
		writeJSONError(w, http.StatusBadRequest, "Email and password are required")
		return
	}

	user, err := h.Store.GetUserByEmail(email)
	if err != nil || user.PasswordHash == "" {
		writeJSONError(w, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	if !auth.CheckPassword(body.Password, user.PasswordHash) {
		writeJSONError(w, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	if user.DeletedAt != nil || user.Disabled {
		writeJSONError(w, http.StatusUnauthorized, "Account disabled")
		return
	}

	h.signAndSetCookie(w, r, user)
	writeJSONResponse(w, http.StatusOK, map[string]any{"user": sanitizeUser(user)})
}

func (h *AuthHandler) handleRegister(w http.ResponseWriter, r *http.Request) {
	var body struct {
		InviteCode  string `json:"invite_code"`
		Email       string `json:"email"`
		Password    string `json:"password"`
		DisplayName string `json:"display_name"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}

	email := strings.ToLower(strings.TrimSpace(body.Email))
	displayName := strings.TrimSpace(body.DisplayName)

	if body.InviteCode == "" || email == "" || body.Password == "" || displayName == "" {
		writeJSONError(w, http.StatusBadRequest, "All fields are required")
		return
	}
	if !emailRegexp.MatchString(email) {
		writeJSONError(w, http.StatusBadRequest, "Invalid email format")
		return
	}
	if len(body.Password) < 8 || len(body.Password) > 72 {
		writeJSONError(w, http.StatusBadRequest, "Password must be 8-72 characters")
		return
	}
	if len(displayName) == 0 || len(displayName) > 50 {
		writeJSONError(w, http.StatusBadRequest, "Display name must be 1-50 characters")
		return
	}

	if existing, _ := h.Store.GetUserByEmail(email); existing != nil {
		writeJSONError(w, http.StatusConflict, "Email already registered")
		return
	}

	ic, err := h.Store.GetInviteCode(body.InviteCode)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "Invalid invite code")
		return
	}
	if ic.UsedBy != nil {
		writeJSONError(w, http.StatusNotFound, "Invalid invite code")
		return
	}
	if ic.ExpiresAt != nil && *ic.ExpiresAt < time.Now().UnixMilli() {
		writeJSONError(w, http.StatusNotFound, "Invalid invite code")
		return
	}

	hash, err := auth.HashPassword(body.Password)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		return
	}

	user := &store.User{
		DisplayName:  displayName,
		Role:         "member",
		Email:        &email,
		PasswordHash: hash,
	}
	if err := h.Store.CreateUser(user); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		return
	}

	// CM-1.2: 1 person = 1 org. Auto-create on register; UI never exposes
	// org_id (blueprint §1.1). Failure here aborts registration so we never
	// leave an orphan user with empty org_id — the data contract is enforced
	// at the app layer until CM-3 promotes (org_id, ...) lookups.
	if _, err := h.Store.CreateOrgForUser(user, displayName+"'s org"); err != nil {
		h.Logger.Error("failed to create organization for user", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		return
	}

	if err := h.Store.ConsumeInviteCode(body.InviteCode, user.ID); err != nil {
		h.Logger.Error("failed to consume invite code", "error", err)
	}

	if err := h.Store.GrantDefaultPermissions(user.ID, "member"); err != nil {
		h.Logger.Error("failed to grant default permissions", "error", err)
	}

	if err := h.Store.AddUserToPublicChannels(user.ID); err != nil {
		h.Logger.Error("failed to add user to public channels", "error", err)
	}

	// CM-onboarding (#42): every newly registered user lands on a non-empty
	// #welcome channel (onboarding-journey.md §3 step 1, README §核心 11).
	// The channel is the hard contract; the system message body is graceful
	// (logged but not fatal). External effects (push / host-bridge) are NOT
	// in this transaction by design.
	if _, sysOK, err := h.Store.CreateWelcomeChannelForUser(user.ID, displayName); err != nil {
		// Channel itself failed to create — don't 500 the registration: the
		// user + org are already committed. Surface a structured log so the
		// client error pill ("正在准备你的工作区, 稍候刷新…") is the
		// user-visible signal, not a generic 500.
		h.Logger.Error("failed to create welcome channel", "user_id", user.ID, "error", err)
	} else if !sysOK {
		h.Logger.Warn("welcome system message insert failed; channel created without it", "user_id", user.ID)
	}

	h.signAndSetCookie(w, r, user)
	writeJSONResponse(w, http.StatusCreated, map[string]any{"user": sanitizeUser(user)})
}

func (h *AuthHandler) handleLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     auth.CookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
	writeJSONResponse(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *AuthHandler) HandleGetMe(w http.ResponseWriter, r *http.Request) {
	user, ok := mustUser(w, r)
	if !ok {
		return
	}

	// ADM-0.3: no role short-circuit. Permissions come from rows only;
	// member humans default to (*, *) at registration (AP-0). Initialise
	// to an empty slice so the JSON field never serialises as null even
	// when a row-less account (e.g. legacy fixture) has no grants.
	permissions := []string{}
	perms, err := h.Store.ListUserPermissions(user.ID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Internal server error")
		return
	}
	for _, p := range perms {
		permissions = append(permissions, fmt.Sprintf("%s:%s", p.Permission, p.Scope))
	}

	u := sanitizeUser(user)
	u["permissions"] = permissions
	writeJSONResponse(w, http.StatusOK, map[string]any{"user": u})
}

func (h *AuthHandler) signAndSetCookie(w http.ResponseWriter, r *http.Request, user *store.User) {
	email := ""
	if user.Email != nil {
		email = *user.Email
	}

	claims := auth.Claims{
		UserID: user.ID,
		Email:  email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(h.now().Add(7 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(h.now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(h.Config.JWTSecret))
	if err != nil {
		return
	}

	cookie := &http.Cookie{
		Name:     auth.CookieName,
		Value:    signed,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   604800,
	}
	if !h.Config.IsDevelopment() {
		host := strings.Split(r.Host, ":")[0]
		if host != "localhost" && host != "127.0.0.1" {
			cookie.Secure = true
		}
	}
	http.SetCookie(w, cookie)
}

func sanitizeUser(user *store.User) map[string]any {
	m := map[string]any{
		"id":              user.ID,
		"display_name":    user.DisplayName,
		"role":            user.Role,
		"avatar_url":      user.AvatarURL,
		"created_at":      user.CreatedAt,
		"last_seen_at":    user.LastSeenAt,
		"require_mention": user.RequireMention,
		"owner_id":        user.OwnerID,
		"deleted_at":      user.DeletedAt,
		"disabled":        user.Disabled,
	}
	if user.Email != nil {
		m["email"] = *user.Email
	}
	return m
}

func writeJSONResponse(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	writeJSONResponse(w, status, map[string]string{"error": msg})
}
