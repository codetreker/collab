package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

func WriteJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func JSONError(w http.ResponseWriter, status int, msg string) {
	WriteJSON(w, status, map[string]string{"error": msg})
}

func ReadJSON(r *http.Request, dst any) error {
	const maxBytes = 1 << 20 // 1MB
	r.Body = http.MaxBytesReader(nil, r.Body, maxBytes)

	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(dst); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			return fmt.Errorf("request body too large")
		}
		return fmt.Errorf("invalid JSON: %w", err)
	}

	if dec.More() {
		return fmt.Errorf("request body must contain a single JSON object")
	}

	return nil
}

func ParseIDParam(r *http.Request, name string) string {
	return r.PathValue(name)
}

// respondNotImplemented returns a 501 for placeholder routes.
func respondNotImplemented(w http.ResponseWriter, r *http.Request) {
	JSONError(w, http.StatusNotImplemented, "Not implemented")
}

// respondHealthCheck is defined in server.go via SetupRoutes.
// This helper file only contains pure utility functions.

// writeErrorResponse is an alias used by middleware to avoid import cycles.
func writeErrorResponse(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	io.WriteString(w, fmt.Sprintf(`{"error":%q}`, msg))
}
