package auth

import "net/http"

import "borgee-server/internal/store"

func RequirePermission(s *store.Store, permission string, scopeResolver func(r *http.Request) string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := UserFromContext(r.Context())
			if user == nil {
				writeJSON401(w)
				return
			}

			// ADM-0.2: legacy `users.role == "admin"` shortcut removed.
			// Admin authority lives exclusively on the /admin-api/* rail
			// behind admin.RequireAdmin (admin_sessions cookie). User-API
			// permission checks here go through the wildcard `(*, *)` row
			// (granted at registration, AP-0) or scoped permission rows.

			perms, err := s.ListUserPermissions(user.ID)
			if err != nil {
				writeJSON401(w)
				return
			}

			scope := ""
			if scopeResolver != nil {
				scope = scopeResolver(r)
			}

			for _, p := range perms {
				// AP-0: a wildcard `(*, *)` row grants the bearer every
				// capability at every scope. Humans get this by default at
				// registration; bundle-narrowed accounts (AP-2) won't have it.
				if p.Permission == "*" && p.Scope == "*" {
					next.ServeHTTP(w, r)
					return
				}
				if p.Permission == permission && (p.Scope == "*" || p.Scope == scope) {
					next.ServeHTTP(w, r)
					return
				}
			}

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			w.Write([]byte(`{"error":"Forbidden"}`))
		})
	}
}
