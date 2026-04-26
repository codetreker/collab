package api

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"borgee-server/internal/config"

	"github.com/golang-jwt/jwt/v5"
)

type adminContextKey string

const adminClaimsContextKey adminContextKey = "admin_claims"

type AdminAuthHandler struct {
	Config *config.Config
	Logger *slog.Logger
}

type AdminClaims struct {
	Role string `json:"role"`
	jwt.RegisteredClaims
}

func (h *AdminAuthHandler) RegisterRoutes(mux *http.ServeMux, adminMw func(http.Handler) http.Handler) {
	mux.HandleFunc("POST /admin-api/v1/auth/login", h.handleLogin)
	mux.HandleFunc("POST /admin-api/v1/auth/logout", h.handleLogout)
	mux.Handle("GET /admin-api/v1/auth/me", adminMw(http.HandlerFunc(h.handleMe)))
}

func (h *AdminAuthHandler) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}

	if body.Username != h.Config.AdminUser || body.Password != h.Config.AdminPassword {
		writeJSONError(w, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	claims := AdminClaims{
		Role: "admin",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(h.Config.JWTSecret))
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Failed to sign token")
		return
	}

	cookie := &http.Cookie{
		Name:     "borgee_admin_token",
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
	writeJSONResponse(w, http.StatusOK, map[string]any{"token": signed})
}

func (h *AdminAuthHandler) handleLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "borgee_admin_token",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
	writeJSONResponse(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *AdminAuthHandler) handleMe(w http.ResponseWriter, r *http.Request) {
	writeJSONResponse(w, http.StatusOK, map[string]any{
		"role":     "admin",
		"username": h.Config.AdminUser,
	})
}

func AdminAuthMiddleware(cfg *config.Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenStr := ""
			if cookie, err := r.Cookie("borgee_admin_token"); err == nil {
				tokenStr = cookie.Value
			}
			if tokenStr == "" {
				if authHeader := r.Header.Get("Authorization"); strings.HasPrefix(authHeader, "Bearer ") {
					tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
				}
			}

			claims := validateAdminJWT(cfg.JWTSecret, tokenStr)
			if claims == nil {
				writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
				return
			}

			ctx := context.WithValue(r.Context(), adminClaimsContextKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func validateAdminJWT(secret, tokenStr string) *AdminClaims {
	if tokenStr == "" {
		return nil
	}
	claims := &AdminClaims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		return []byte(secret), nil
	})
	if err != nil || !token.Valid || claims.Role != "admin" {
		return nil
	}
	return claims
}
