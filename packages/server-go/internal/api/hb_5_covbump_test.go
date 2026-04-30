// Package api_test — hb_5_covbump_test.go: extra cov bumps for the 0.1%
// gap in CI. Same pattern as chn-5 covbump — pure predicates + Store helpers.
package api_test

import (
	"errors"
	"testing"

	"borgee-server/internal/store"
	"borgee-server/internal/testutil"
	"gorm.io/gorm"
)

func TestHB5_CovBump_IsAgentStatusNotFound(t *testing.T) {
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

func TestHB5_CovBump_ArchiveChannel(t *testing.T) {
	t.Parallel()
	_, s, _ := testutil.NewTestServer(t)
	owner, _ := s.GetUserByEmail("owner@test.com")
	ch := &store.Channel{
		Name:       "hb5-covbump-archive",
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
	ts2, err := s.ArchiveChannel(ch.ID)
	if err != nil {
		t.Fatalf("ArchiveChannel idempotent: %v", err)
	}
	if ts2 != ts1 {
		t.Errorf("idempotent ts mismatch")
	}
	if _, err := s.ArchiveChannel("00000000-0000-0000-0000-000000000000"); err == nil {
		t.Error("expected error for not-found")
	}
}
