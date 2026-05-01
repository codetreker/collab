package admin

import (
	"context"
	"net/http"
	"time"

	"gorm.io/gorm"
)

// adminCtxKey is private so callers cannot fabricate context values; only
// RequireAdmin can populate it.
type adminCtxKey struct{}

// AdminFromContext returns the admin attached by RequireAdmin, or nil if the
// request did not pass through the middleware (or auth failed earlier).
func AdminFromContext(ctx context.Context) *Admin {
	if a, ok := ctx.Value(adminCtxKey{}).(*Admin); ok {
		return a
	}
	return nil
}

// WithAdminContext attaches an Admin to ctx — exported for tests that need
// to drive code reading AdminFromContext without setting up cookie + DB
// session machinery. Production path (RequireAdmin → ResolveSession) remains
// the only way admin ctx is set in real requests; this preserves the privacy
// of adminCtxKey while enabling unit tests of helpers like
// api.RequireImpersonationGrant.
func WithAdminContext(ctx context.Context, a *Admin) context.Context {
	return context.WithValue(ctx, adminCtxKey{}, a)
}

// RequireAdmin wraps a handler so it only runs when the request carries a
// valid `borgee_admin_session` cookie resolving to an unexpired admin_sessions
// row. Otherwise it writes 401 and short-circuits.
//
// `now` is injectable for deterministic tests; pass `time.Now` in production.
func RequireAdmin(db *gorm.DB, now func() time.Time) func(http.Handler) http.Handler {
	if now == nil {
		now = time.Now
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c, err := r.Cookie(CookieName)
			if err != nil || c.Value == "" {
				writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
				return
			}
			a, err := ResolveSession(db, c.Value, now())
			if err != nil {
				writeJSONError(w, http.StatusInternalServerError, "session lookup failed")
				return
			}
			if a == nil {
				writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
				return
			}
			ctx := context.WithValue(r.Context(), adminCtxKey{}, a)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
