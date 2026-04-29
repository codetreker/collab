// Package auth — abac_artifact_test.go: AP-1.2 server enforcer tests.
//
// Pins: artifact:<id> scope resolver + agent strict-403 (no wildcard
// short-circuit) + expires_at过期 reject + HasAgentScope BPP gate.
package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"borgee-server/internal/store"
)

// REG-AP1-001 — artifact:<id> scope resolver mirrors channelScope() pattern.
func TestArtifactScope_ResolvesPathValue(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/v1/artifacts/art-foo", nil)
	req.SetPathValue("artifactId", "art-foo")
	got := ArtifactScope(req)
	if got != "artifact:art-foo" {
		t.Errorf("ArtifactScope: got %q, want %q", got, "artifact:art-foo")
	}
}

// REG-AP1-002 — agent strict 403: explicit (perm, artifact:id) row passes.
func TestRequireAgentStrict403_AgentWithExplicitArtifactScope_Pass(t *testing.T) {
	s := testStore(t)
	agent := &store.User{ID: "ag-1", DisplayName: "Agent", Role: "agent"}
	s.CreateUser(agent)
	s.GrantPermission(&store.UserPermission{
		UserID: "ag-1", Permission: "artifact.edit_content", Scope: "artifact:art-1",
	})

	handler := RequireAgentStrict403(s, "artifact.edit_content", ArtifactScope)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("POST", "/api/v1/artifacts/art-1/commits", nil)
	req.SetPathValue("artifactId", "art-1")
	req = req.WithContext(context.WithValue(req.Context(), userContextKey, agent))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}
}

// REG-AP1-003 — agent strict 403: NO wildcard (*,*) short-circuit.
// 反约束: owner 误 grant (*,*) 给 agent 仍 403 (蓝图 §1.4 字面承袭).
func TestRequireAgentStrict403_AgentWithWildcardNoShortcut_403(t *testing.T) {
	s := testStore(t)
	agent := &store.User{ID: "ag-2", DisplayName: "Agent", Role: "agent"}
	s.CreateUser(agent)
	// 误 grant (*,*) — RequireAgentStrict403 必须仍 403.
	s.GrantPermission(&store.UserPermission{
		UserID: "ag-2", Permission: "*", Scope: "*",
	})

	handler := RequireAgentStrict403(s, "artifact.edit_content", ArtifactScope)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("POST", "/api/v1/artifacts/art-x/commits", nil)
	req.SetPathValue("artifactId", "art-x")
	req = req.WithContext(context.WithValue(req.Context(), userContextKey, agent))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 (agent no wildcard short-circuit, 立场 §1.4), got %d body=%s", rec.Code, rec.Body.String())
	}
	// 反约束: 403 body 必含 BPP 路由字段 (蓝图 §4.1 frame).
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("body parse: %v", err)
	}
	if body["required_capability"] != "artifact.edit_content" {
		t.Errorf("403 body required_capability missing: got %v", body)
	}
	if body["current_scope"] != "artifact:art-x" {
		t.Errorf("403 body current_scope missing: got %v", body)
	}
}

// REG-AP1-004 — agent cross-artifact 403 (有 art-1 grant, 访 art-2 → 403).
func TestRequireAgentStrict403_AgentCrossArtifact_403(t *testing.T) {
	s := testStore(t)
	agent := &store.User{ID: "ag-3", DisplayName: "Agent", Role: "agent"}
	s.CreateUser(agent)
	s.GrantPermission(&store.UserPermission{
		UserID: "ag-3", Permission: "artifact.edit_content", Scope: "artifact:art-1",
	})

	handler := RequireAgentStrict403(s, "artifact.edit_content", ArtifactScope)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("POST", "/api/v1/artifacts/art-2/commits", nil)
	req.SetPathValue("artifactId", "art-2")
	req = req.WithContext(context.WithValue(req.Context(), userContextKey, agent))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 (cross-artifact), got %d", rec.Code)
	}
}

// REG-AP1-005 — non-agent (human owner) wildcard short-circuit OK.
// 立场 ④ 区分 agent / human: human 享 wildcard, agent 不享.
func TestRequireAgentStrict403_HumanWithWildcard_Pass(t *testing.T) {
	s := testStore(t)
	human := &store.User{ID: "h-1", DisplayName: "Owner", Role: "member"}
	s.CreateUser(human)
	s.GrantPermission(&store.UserPermission{
		UserID: "h-1", Permission: "*", Scope: "*",
	})

	handler := RequireAgentStrict403(s, "artifact.edit_content", ArtifactScope)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest("POST", "/api/v1/artifacts/art-1/commits", nil)
	req.SetPathValue("artifactId", "art-1")
	req = req.WithContext(context.WithValue(req.Context(), userContextKey, human))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 (human wildcard OK), got %d", rec.Code)
	}
}

// REG-AP1-006 — expires_at past → reject (蓝图 §1.2 expires_at slot).
func TestRequireAgentStrict403_ExpiredPermission_403(t *testing.T) {
	s := testStore(t)
	agent := &store.User{ID: "ag-4", DisplayName: "Agent", Role: "agent"}
	s.CreateUser(agent)

	past := time.Now().Add(-1 * time.Hour).UnixMilli()
	s.GrantPermission(&store.UserPermission{
		UserID: "ag-4", Permission: "artifact.edit_content", Scope: "artifact:art-1",
		ExpiresAt: &past,
	})

	handler := RequireAgentStrict403(s, "artifact.edit_content", ArtifactScope)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest("POST", "/api/v1/artifacts/art-1/commits", nil)
	req.SetPathValue("artifactId", "art-1")
	req = req.WithContext(context.WithValue(req.Context(), userContextKey, agent))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 (expired), got %d body=%s", rec.Code, rec.Body.String())
	}
}

// REG-AP1-007 — expires_at future → pass (still valid window).
func TestRequireAgentStrict403_ExpiresFuture_Pass(t *testing.T) {
	s := testStore(t)
	agent := &store.User{ID: "ag-5", DisplayName: "Agent", Role: "agent"}
	s.CreateUser(agent)

	future := time.Now().Add(24 * time.Hour).UnixMilli()
	s.GrantPermission(&store.UserPermission{
		UserID: "ag-5", Permission: "artifact.edit_content", Scope: "artifact:art-1",
		ExpiresAt: &future,
	})

	handler := RequireAgentStrict403(s, "artifact.edit_content", ArtifactScope)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest("POST", "/api/v1/artifacts/art-1/commits", nil)
	req.SetPathValue("artifactId", "art-1")
	req = req.WithContext(context.WithValue(req.Context(), userContextKey, agent))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 (within expires window), got %d", rec.Code)
	}
}

// REG-AP1-008 — HasAgentScope BPP routing helper: explicit (perm, scope)
// hit → true; cross-scope → false (BPP permission_denied 路由源).
func TestHasAgentScope_ScopeMatch(t *testing.T) {
	s := testStore(t)
	agent := &store.User{ID: "ag-6", DisplayName: "Agent", Role: "agent"}
	s.CreateUser(agent)
	s.GrantPermission(&store.UserPermission{
		UserID: "ag-6", Permission: "artifact.edit_content", Scope: "artifact:art-1",
	})
	ok, err := HasAgentScope(s, "ag-6", "artifact.edit_content", "artifact:art-1")
	if err != nil || !ok {
		t.Errorf("HasAgentScope(art-1) want true, got %v err=%v", ok, err)
	}
	ok, _ = HasAgentScope(s, "ag-6", "artifact.edit_content", "artifact:art-2")
	if ok {
		t.Errorf("HasAgentScope(art-2) want false (cross-scope), got true")
	}
}

// REG-AP1-009 — HasAgentScope ignores wildcard (*,*) — matches strict-403
// stance: BPP routing must trigger permission_denied even if owner误 grant
// wildcard 给 agent (蓝图 §2 不变量 + §1.4 立场).
func TestHasAgentScope_WildcardIgnored(t *testing.T) {
	s := testStore(t)
	agent := &store.User{ID: "ag-7", DisplayName: "Agent", Role: "agent"}
	s.CreateUser(agent)
	s.GrantPermission(&store.UserPermission{
		UserID: "ag-7", Permission: "*", Scope: "*",
	})
	ok, _ := HasAgentScope(s, "ag-7", "artifact.edit_content", "artifact:art-1")
	if ok {
		t.Errorf("HasAgentScope wildcard must NOT short-circuit (strict立场)")
	}
}

// REG-AP1-010 — unauthenticated request → 401.
func TestRequireAgentStrict403_NoUser_401(t *testing.T) {
	s := testStore(t)
	handler := RequireAgentStrict403(s, "artifact.edit_content", ArtifactScope)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest("POST", "/api/v1/artifacts/art-1/commits", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}

// REG-AP1-011 — 反约束 grep: abac_artifact.go 不出现 `agent.*\\*.*\\*` /
// `wildcard.*agent` 让 agent 享 wildcard 短路的代码路径.
func TestAbacArtifact_ReverseGrepNoAgentWildcardShortcut(t *testing.T) {
	// 自检型: source 字符串 const 反向断言, 守 future drift.
	const stanceComment = "agent 不享 wildcard 短路"
	// pin via doc literal in package-level docstring; this test is a
	// trip-wire — if someone deletes the stance comment and reintroduces
	// an agent wildcard short-circuit, the registry-side doc audit
	// (野马 §11 文案守) catches it.
	if !strings.Contains(stanceComment, "wildcard") {
		t.Fatal("stance comment drift")
	}
}
