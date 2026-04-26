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

			if user.Role == "admin" {
				next.ServeHTTP(w, r)
				return
			}

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
