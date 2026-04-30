// cov_sentinels_test.go — unit tests for trivial sentinel helpers and
// public sanitizers that are otherwise reachable only via end-to-end
// HTTP paths. Wraps lightweight assertions to lift package coverage
// without exercising production routing (test-file-only, no production
// changes).
package api

import (
	"errors"
	"testing"

	"borgee-server/internal/store"
)

func TestIsCapabilityDisallowedSentinel(t *testing.T) {
	if !IsCapabilityDisallowed(errCapabilityDisallowed) {
		t.Fatalf("expected sentinel match for errCapabilityDisallowed")
	}
	if IsCapabilityDisallowed(errors.New("other")) {
		t.Fatalf("unrelated error must not match")
	}
	if IsCapabilityDisallowed(nil) {
		t.Fatalf("nil must not match")
	}
}

func TestIsMeGrantsActionUnknownSentinel(t *testing.T) {
	if !IsMeGrantsActionUnknown(errMeGrantsActionUnknown) {
		t.Fatalf("expected sentinel match")
	}
	if IsMeGrantsActionUnknown(errors.New("nope")) {
		t.Fatalf("unrelated error must not match")
	}
}

func TestIsMeGrantsScopeUnknownSentinel(t *testing.T) {
	if !IsMeGrantsScopeUnknown(errMeGrantsScopeUnknown) {
		t.Fatalf("expected sentinel match")
	}
	if IsMeGrantsScopeUnknown(errors.New("nope")) {
		t.Fatalf("unrelated error must not match")
	}
}

func TestSanitizeUserPublicMinimal(t *testing.T) {
	u := &store.User{
		ID:             "u1",
		DisplayName:    "Alice",
		Role:           "member",
		AvatarURL:      "",
		RequireMention: true,
		CreatedAt:      1000,
	}
	m := sanitizeUserPublic(u)
	if m["id"] != "u1" || m["display_name"] != "Alice" || m["role"] != "member" {
		t.Fatalf("missing core fields: %#v", m)
	}
	if _, ok := m["owner_id"]; ok {
		t.Fatalf("owner_id must be omitted when nil")
	}
	if _, ok := m["last_seen_at"]; ok {
		t.Fatalf("last_seen_at must be omitted when nil")
	}
}

func TestSanitizeUserPublicWithOptionalFields(t *testing.T) {
	owner := "owner-1"
	seen := int64(2000)
	u := &store.User{
		ID:             "u2",
		DisplayName:    "Bob",
		Role:           "agent",
		AvatarURL:      "https://x/y",
		RequireMention: false,
		CreatedAt:      1500,
		OwnerID:        &owner,
		LastSeenAt:     &seen,
	}
	m := sanitizeUserPublic(u)
	if m["owner_id"] != owner {
		t.Fatalf("expected owner_id=%s got %#v", owner, m["owner_id"])
	}
	if m["last_seen_at"] != seen {
		t.Fatalf("expected last_seen_at=%d got %#v", seen, m["last_seen_at"])
	}
	if m["require_mention"] != false {
		t.Fatalf("require_mention should be false")
	}
}
