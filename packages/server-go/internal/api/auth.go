package api

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"

	"collab-server/internal/auth"
	"collab-server/internal/config"
	"collab-server/internal/store"

	"github.com/golang-jwt/jwt/v5"
)

type AuthHandler struct {
	Store  *store.Store
	Config *config.Config
	Logger *slog.Logger
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
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid JSON")
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
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid JSON")
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

	if err := h.Store.ConsumeInviteCode(body.InviteCode, user.ID); err != nil {
		h.Logger.Error("failed to consume invite code", "error", err)
	}

	if err := h.Store.GrantDefaultPermissions(user.ID, "member"); err != nil {
		h.Logger.Error("failed to grant default permissions", "error", err)
	}

	if err := h.Store.AddUserToPublicChannels(user.ID); err != nil {
		h.Logger.Error("failed to add user to public channels", "error", err)
	}

	h.signAndSetCookie(w, r, user)
	writeJSONResponse(w, http.StatusCreated, map[string]any{"user": sanitizeUser(user)})
}

func (h *AuthHandler) handleLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "collab_token",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
	writeJSONResponse(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *AuthHandler) HandleGetMe(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var permissions []string
	if user.Role == "admin" {
		permissions = []string{"*"}
	} else {
		perms, err := h.Store.ListUserPermissions(user.ID)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Internal server error")
			return
		}
		for _, p := range perms {
			permissions = append(permissions, fmt.Sprintf("%s:%s", p.Permission, p.Scope))
		}
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
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(h.Config.JWTSecret))
	if err != nil {
		return
	}

	cookie := &http.Cookie{
		Name:     "collab_token",
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
		"id":           user.ID,
		"display_name": user.DisplayName,
		"role":         user.Role,
		"avatar_url":   user.AvatarURL,
		"created_at":   user.CreatedAt,
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
