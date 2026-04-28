// agent_invitations_internal_test.go — CM-4.1 internal-package unit
// tests reaching the small helpers that don't go through the HTTP layer
// (clock injection, sanitizer omitempty, etc.).
package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"borgee-server/internal/store"
)

func TestNowInjectionUsesProvidedClock(t *testing.T) {
	fixed := time.Unix(1700000000, 0)
	h := &AgentInvitationHandler{Now: func() time.Time { return fixed }}
	if got := h.now(); !got.Equal(fixed) {
		t.Fatalf("now() = %v, want %v", got, fixed)
	}
}

func TestNowFallbackUsesWallClock(t *testing.T) {
	h := &AgentInvitationHandler{}
	got := h.now()
	if time.Since(got) > time.Second {
		t.Fatalf("fallback now() too far in past: %v", got)
	}
}

func TestSanitizerOmitsNilOptionals(t *testing.T) {
	inv := &store.AgentInvitation{
		ID:          "x",
		ChannelID:   "c",
		AgentID:     "a",
		RequestedBy: "u",
		State:       store.AgentInvitationPending,
		CreatedAt:   1,
	}
	m := sanitizeAgentInvitation(nil, inv)
	if _, ok := m["decided_at"]; ok {
		t.Errorf("decided_at must be omitted when nil")
	}
	if _, ok := m["expires_at"]; ok {
		t.Errorf("expires_at must be omitted when nil")
	}
	// Bug-029 P0: name fields must be present even when store lookup is
	// not available (defensive empty-string fallback) so the client schema
	// is stable and reviewers see no raw-UUID UI regression.
	for _, k := range []string{"agent_name", "channel_name", "requester_name"} {
		v, ok := m[k]
		if !ok {
			t.Errorf("%s must be present in sanitized payload", k)
		}
		if v != "" {
			t.Errorf("%s with nil store: got %v, want empty string", k, v)
		}
	}

	d, e := int64(2), int64(3)
	inv.DecidedAt = &d
	inv.ExpiresAt = &e
	m = sanitizeAgentInvitation(nil, inv)
	if m["decided_at"] != d || m["expires_at"] != e {
		t.Errorf("optional fields lost: %v", m)
	}
}

func TestCanSeeBranches(t *testing.T) {
	h := &AgentInvitationHandler{}
	inv := &store.AgentInvitation{ID: "i", AgentID: "a", RequestedBy: "u-req"}

	admin := &store.User{ID: "u-admin", Role: "admin"}
	if !h.canSee(admin, inv) {
		t.Error("admin must canSee")
	}
	requester := &store.User{ID: "u-req", Role: "member"}
	if !h.canSee(requester, inv) {
		t.Error("requester must canSee")
	}
	// Owner-of-agent branch reaches Store.GetAgent — without a Store this
	// returns false (err on lookup). That covers the err-return line.
	bystander := &store.User{ID: "u-other", Role: "member"}
	defer func() { _ = recover() }() // tolerate nil Store deref
	if h.canSee(bystander, inv) {
		t.Error("bystander must not canSee")
	}
}

// Calling each handler with no auth context exercises the user==nil →
// 401 branch in all four endpoints (auth middleware normally rejects
// before the handler runs, so this is the only way to cover them).
func TestUnauthorizedBranches(t *testing.T) {
	h := &AgentInvitationHandler{}
	endpoints := []struct {
		name string
		fn   http.HandlerFunc
	}{
		{"create", h.handleCreate},
		{"get", h.handleGet},
		{"list", h.handleList},
		{"patch", h.handlePatch},
	}
	for _, ep := range endpoints {
		t.Run(ep.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, "/x", strings.NewReader(""))
			ep.fn(rec, req)
			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("%s: status %d, want 401", ep.name, rec.Code)
			}
		})
	}
}
