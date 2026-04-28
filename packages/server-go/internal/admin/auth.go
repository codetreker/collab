// Package admin implements the ADM-0 admin auth path — completely independent
// from internal/auth (the user auth path).
//
// Blueprint: admin-model §1.2 (B env bootstrap, 无 promote) + §3 (admins
// 独立表). Implementation R3 PR #189 lays out the 3 sub-PRs (ADM-0.1 / 0.2 /
// 0.3); this file lands in ADM-0.1.
//
// Hard constraints (review checklist §ADM-0.1 §3 红线):
//   - cookie name MUST be the literal `borgee_admin_session`
//   - this package MUST NOT import borgee-server/internal/auth (auth path
//     isolation; grep for that import path must come up empty)
//   - bcrypt verify MUST use subtle.ConstantTimeCompare wrapping
//     bcrypt.CompareHashAndPassword's success/failure semantics
//   - admins table fields are strict: id / login / password_hash / created_at
//
// During ADM-0.1 the legacy `/admin-api/v1/*` route family (api package,
// users.role='admin') still works — that is the "dual-rail coexistence"
// invariant 1.F. ADM-0.2 is what cuts the legacy rail.
package admin

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// CookieName is the literal cookie name for the new admin auth path.
// Locked by blueprint admin-model §1.2 and review checklist §ADM-0.1 红线.
// DO NOT change this value — tests assert the exact string.
const CookieName = "borgee_admin_session"

// Env var names — locked literals (review checklist 红线).
const (
	EnvAdminLogin        = "BORGEE_ADMIN_LOGIN"
	EnvAdminPasswordHash = "BORGEE_ADMIN_PASSWORD_HASH"
)

// SessionTTL is the lifetime of an admin session cookie. v0: 7 days.
const SessionTTL = 7 * 24 * time.Hour

// MinBcryptCost mirrors the review checklist requirement that
// password_hash be a bcrypt hash with cost ≥ 10.
const MinBcryptCost = 10

// Admin is the in-package row shape for the `admins` table created by
// migration adm_0_1_admins (v=4).
type Admin struct {
	ID           string `gorm:"primaryKey;column:id"`
	Login        string `gorm:"column:login;uniqueIndex"`
	PasswordHash string `gorm:"column:password_hash"`
	CreatedAt    int64  `gorm:"column:created_at"`
}

// TableName pins the GORM table mapping to the literal name created by the
// migration; we deliberately do not rely on naming conventions here.
func (Admin) TableName() string { return "admins" }

// FindByLogin returns the admin row matching login or (nil, nil) if none.
// All other DB errors propagate.
func FindByLogin(db *gorm.DB, login string) (*Admin, error) {
	var a Admin
	err := db.Where("login = ?", login).Take(&a).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// VerifyPassword checks plaintext against the stored bcrypt hash. The bcrypt
// library already runs in constant time relative to its input length, but per
// review checklist §1.E we additionally wrap the success signal in
// subtle.ConstantTimeCompare so timing of the boolean result cannot leak.
func VerifyPassword(hash, plain string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain))
	ok := byte(0)
	if err == nil {
		ok = 1
	}
	// Compare the boolean signal against the constant 1 in constant time.
	return subtle.ConstantTimeCompare([]byte{ok}, []byte{1}) == 1
}

// Handler exposes the new admin auth endpoint that issues a
// `borgee_admin_session` cookie. It is intentionally narrow: only the login
// surface lands in ADM-0.1; logout / me are kept in the legacy admin path
// during dual-rail and will be rebuilt under ADM-0.2.
type Handler struct {
	DB     *gorm.DB
	Logger *slog.Logger
	// IsDevelopment toggles cookie Secure flag selection (dev allows http).
	IsDevelopment bool
}

// RegisterRoutes wires `POST /admin-api/auth/login` (review checklist 1.C path).
// The path deliberately does NOT include `/v1/` so it does not collide with
// the legacy `/admin-api/v1/auth/login` route still served by the api package
// during dual-rail coexistence.
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /admin-api/auth/login", h.handleLogin)
}

type loginRequest struct {
	Login    string `json:"login"`
	Password string `json:"password"`
}

func (h *Handler) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body loginRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if body.Login == "" || body.Password == "" {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	admin, err := FindByLogin(h.DB, body.Login)
	if err != nil {
		if h.Logger != nil {
			h.Logger.Error("admin login lookup failed", "error", err)
		}
		writeJSONError(w, http.StatusInternalServerError, "lookup failed")
		return
	}

	// Always run bcrypt verify (even on missing row) to preserve constant-time
	// shape — feed a bogus hash so timing is comparable to the hit path.
	hash := ""
	if admin != nil {
		hash = admin.PasswordHash
	} else {
		hash = "$2a$10$0000000000000000000000000000000000000000000000000000"
	}
	if !VerifyPassword(hash, body.Password) || admin == nil {
		writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	// Session token: signed value carrying admin id. ADM-0.1 keeps it simple —
	// store the admin id directly. ADM-0.2 will swap to a server-side session
	// table; the cookie name stays the same.
	cookie := &http.Cookie{
		Name:     CookieName,
		Value:    admin.ID,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(SessionTTL.Seconds()),
	}
	if !h.IsDevelopment {
		host := strings.Split(r.Host, ":")[0]
		if host != "localhost" && host != "127.0.0.1" {
			cookie.Secure = true
		}
	}
	http.SetCookie(w, cookie)

	writeJSON(w, http.StatusOK, map[string]any{
		"id":    admin.ID,
		"login": admin.Login,
	})
}

// AdminFromRequest looks up the admin associated with the request's
// `borgee_admin_session` cookie. Returns (nil, nil) when no cookie is set or
// the session does not match a row.
func AdminFromRequest(db *gorm.DB, r *http.Request) (*Admin, error) {
	c, err := r.Cookie(CookieName)
	if err != nil || c.Value == "" {
		return nil, nil
	}
	var a Admin
	err = db.Where("id = ?", c.Value).Take(&a).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"error": msg})
}

// Bootstrap inserts (or no-ops on conflict) the env-configured admin into the
// admins table. Called from cmd/collab/main.go startup.
//
// fail-loud: missing env vars panic with a clear message (review checklist
// §ADM-0.1 §1.A). This is deliberate — admin auth must not silently degrade.
//
// Idempotent: re-runs with the same login do nothing (review checklist §1.B).
// The migration's UNIQUE(login) index is the source of truth; this function
// uses INSERT … ON CONFLICT DO NOTHING semantics.
func Bootstrap(db *gorm.DB) error {
	login := os.Getenv(EnvAdminLogin)
	hash := os.Getenv(EnvAdminPasswordHash)
	return BootstrapWith(db, login, hash)
}

// BootstrapWith is the testable form of Bootstrap. cmd/collab uses Bootstrap;
// tests inject explicit values.
func BootstrapWith(db *gorm.DB, login, hash string) error {
	if login == "" {
		panic(fmt.Sprintf("admin bootstrap: %s is required (set to the admin login)", EnvAdminLogin))
	}
	if hash == "" {
		panic(fmt.Sprintf("admin bootstrap: %s is required (set to a bcrypt hash, cost ≥ %d)", EnvAdminPasswordHash, MinBcryptCost))
	}

	// Reject obviously-non-bcrypt or low-cost hashes — review checklist 红线
	// "password_hash 不是 bcrypt (明文 / sha256 / md5)" + "bcrypt cost ≥ 10".
	cost, err := bcrypt.Cost([]byte(hash))
	if err != nil {
		panic(fmt.Sprintf("admin bootstrap: %s is not a valid bcrypt hash: %v", EnvAdminPasswordHash, err))
	}
	if cost < MinBcryptCost {
		panic(fmt.Sprintf("admin bootstrap: %s bcrypt cost %d < required %d", EnvAdminPasswordHash, cost, MinBcryptCost))
	}

	// Idempotent insert: ON CONFLICT(login) DO NOTHING via the UNIQUE index.
	row := Admin{
		ID:           uuid.NewString(),
		Login:        login,
		PasswordHash: hash,
		CreatedAt:    time.Now().UnixMilli(),
	}
	res := db.Exec(
		`INSERT INTO admins (id, login, password_hash, created_at)
		 VALUES (?, ?, ?, ?)
		 ON CONFLICT(login) DO NOTHING`,
		row.ID, row.Login, row.PasswordHash, row.CreatedAt,
	)
	return res.Error
}
