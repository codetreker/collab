package server

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"borgee-server/internal/config"
	"borgee-server/internal/store"
)

type flushResponseRecorder struct {
	*httptest.ResponseRecorder
	flushed bool
}

func (r *flushResponseRecorder) Flush() {
	r.flushed = true
}

func testServer(t *testing.T) (*Server, *store.Store) {
	t.Helper()
	s, err := store.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Migrate(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })

	cfg := &config.Config{
		JWTSecret:     "test-secret",
		NodeEnv:       "development",
		DevAuthBypass: false,
		UploadDir:     t.TempDir(),
		WorkspaceDir:  t.TempDir(),
		ClientDist:    t.TempDir(),
		CORSOrigin:    "*",
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv := New(cfg, logger, s)
	return srv, s
}

func TestHealth(t *testing.T) {
	srv, _ := testServer(t)
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/health")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestStaticFallback(t *testing.T) {
	srv, _ := testServer(t)

	indexPath := filepath.Join(srv.cfg.ClientDist, "index.html")
	os.WriteFile(indexPath, []byte("<html></html>"), 0644)

	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/some-route")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for SPA fallback, got %d", resp.StatusCode)
	}
}

func TestStaticFile(t *testing.T) {
	srv, _ := testServer(t)

	os.WriteFile(filepath.Join(srv.cfg.ClientDist, "test.js"), []byte("var x=1;"), 0644)

	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/test.js")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for static file, got %d", resp.StatusCode)
	}
}

func TestNotFoundAPI(t *testing.T) {
	srv, _ := testServer(t)
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/api/v1/nonexistent")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}
}

func TestCORSHeaders(t *testing.T) {
	srv, _ := testServer(t)
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	req, _ := http.NewRequest("OPTIONS", ts.URL+"/api/v1/channels", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	acao := resp.Header.Get("Access-Control-Allow-Origin")
	if acao == "" {
		t.Fatal("expected CORS header")
	}
}

func TestSecurityHeaders(t *testing.T) {
	srv, _ := testServer(t)
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/health")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.Header.Get("X-Content-Type-Options") != "nosniff" {
		t.Fatal("expected X-Content-Type-Options: nosniff")
	}
}

func TestWriteJSON(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteJSON(rec, http.StatusOK, map[string]string{"test": "value"})
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "test") {
		t.Fatal("expected body to contain 'test'")
	}
}

func TestJSONError(t *testing.T) {
	rec := httptest.NewRecorder()
	JSONError(rec, http.StatusBadRequest, "bad request")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestReadJSON(t *testing.T) {
	body := strings.NewReader(`{"key":"value"}`)
	req := httptest.NewRequest("POST", "/", body)
	var dst map[string]string
	err := ReadJSON(req, &dst)
	if err != nil {
		t.Fatal(err)
	}
	if dst["key"] != "value" {
		t.Fatal("expected value")
	}
}

func TestReadJSON_Invalid(t *testing.T) {
	body := strings.NewReader(`not json`)
	req := httptest.NewRequest("POST", "/", body)
	var dst map[string]string
	err := ReadJSON(req, &dst)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestParseIDParam(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	id := ParseIDParam(req, "id")
	if id != "" {
		t.Fatal("expected empty string")
	}
}

func TestRequestIDMiddleware(t *testing.T) {
	srv, _ := testServer(t)
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/health")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	reqID := resp.Header.Get("X-Request-Id")
	if reqID == "" {
		t.Fatal("expected X-Request-Id header")
	}
}

func TestStatusRecorderFlush(t *testing.T) {
	base := &flushResponseRecorder{ResponseRecorder: httptest.NewRecorder()}
	rec := &statusRecorder{ResponseWriter: base, status: http.StatusOK}
	rec.WriteHeader(http.StatusCreated)
	rec.Flush()

	if rec.status != http.StatusCreated {
		t.Fatalf("expected recorded status 201, got %d", rec.status)
	}
	if !base.flushed {
		t.Fatal("expected underlying flusher to be called")
	}
	if rec.Unwrap() != base {
		t.Fatal("expected unwrap to return underlying response writer")
	}
}

func TestRateLimiter(t *testing.T) {
	rl := newRateLimiter()
	ip := "127.0.0.1"

	for i := 0; i < 10; i++ {
		if !rl.allow(ip, false) {
			t.Fatal("should allow within rate limit")
		}
	}
}

func TestHub(t *testing.T) {
	srv, _ := testServer(t)
	if srv.Hub() == nil {
		t.Fatal("expected hub")
	}
}

func TestAdapters(t *testing.T) {
	srv, _ := testServer(t)
	hub := srv.Hub()

	// hubCommandAdapter
	ca := &hubCommandAdapter{hub: hub}
	cmds := ca.GetAllCommands()
	if cmds == nil {
		t.Fatal("expected non-nil commands")
	}

	// hubRemoteAdapter
	ra := &hubRemoteAdapter{hub: hub}
	if ra.IsNodeOnline("nonexistent") {
		t.Fatal("expected false")
	}
	_, err := ra.ProxyRequest("nonexistent", "ls", map[string]string{"path": "/"})
	if err == nil {
		t.Fatal("expected error for offline node")
	}

	// hubBroadcastAdapter
	ba := &hubBroadcastAdapter{hub: hub}
	ba.BroadcastEventToChannel("ch-1", "test", map[string]string{})
	ba.BroadcastEventToAll("test", map[string]string{})
	ba.BroadcastEventToUser("user-1", "test", map[string]string{})
	ba.SignalNewEvents()

	// hubPluginAdapter
	pa := &hubPluginAdapter{hub: hub}
	_, _, err = pa.ProxyPluginRequest("nonexistent", "read_file", "/test", nil)
	if err == nil {
		t.Fatal("expected error for disconnected plugin")
	}
}

func TestWriteErrorResponse(t *testing.T) {
	rec := httptest.NewRecorder()
	writeErrorResponse(rec, http.StatusInternalServerError, "test error")
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
}

func TestRespondNotImplemented(t *testing.T) {
	rec := httptest.NewRecorder()
	respondNotImplemented(rec, nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}
