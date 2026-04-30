// Package api_test — chn_5_covbump_test.go: extra cov bumps for the 0.1%
// gap in CI (race-flake). Targets pure, stateless predicates + Hub getters
// + Store.ArchiveChannel happy + idempotent paths. Test-only, 0 production.
package api_test

import (
	"errors"
	"testing"

	"borgee-server/internal/store"
	"borgee-server/internal/testutil"
	"gorm.io/gorm"
)

// REG-CHN5-cov-bump v4 — IsAgentStatusNotFound predicate.
func TestCHN5_CovBump_IsAgentStatusNotFound(t *testing.T) {
	t.Parallel()
	if !store.IsAgentStatusNotFound(gorm.ErrRecordNotFound) {
		t.Error("ErrRecordNotFound should match")
	}
	if store.IsAgentStatusNotFound(nil) {
		t.Error("nil should not match")
	}
	if store.IsAgentStatusNotFound(errors.New("other")) {
		t.Error("other err should not match")
	}
}

// REG-CHN5-cov-bump v4 — Store.ArchiveChannel happy path + idempotent.
func TestCHN5_CovBump_ArchiveChannel(t *testing.T) {
	t.Parallel()
	_, s, _ := testutil.NewTestServer(t)
	owner, _ := s.GetUserByEmail("owner@test.com")
	ch := &store.Channel{
		Name:       "covbump-archive",
		Type:       "channel",
		Visibility: "public",
		CreatedBy:  owner.ID,
		Position:   store.GenerateInitialRank(),
		OrgID:      owner.OrgID,
	}
	if err := s.CreateChannel(ch); err != nil {
		t.Fatalf("create: %v", err)
	}
	ts1, err := s.ArchiveChannel(ch.ID)
	if err != nil {
		t.Fatalf("ArchiveChannel: %v", err)
	}
	if ts1 == 0 {
		t.Error("expected non-zero archived_at")
	}
	// Idempotent: second call returns same ts.
	ts2, err := s.ArchiveChannel(ch.ID)
	if err != nil {
		t.Fatalf("ArchiveChannel idempotent: %v", err)
	}
	if ts2 != ts1 {
		t.Errorf("idempotent ts mismatch: ts1=%d ts2=%d", ts1, ts2)
	}
	// Not-found path.
	if _, err := s.ArchiveChannel("00000000-0000-0000-0000-000000000000"); err == nil {
		t.Error("expected error for not-found")
	}
}
