// Package store — cv5_branch_coverage_test.go: trivial branch fills
// to push CV-5 server-go cov ≥ 84% threshold (CI ratchet).
//
// 0 production change; tests target ArchiveChannel + IsAgentStatusNotFound
// which sit at 0% pre-CV-5 (orthogonal helpers, not exercised by api flow).

package store

import (
	"errors"
	"testing"
	"time"

	"gorm.io/gorm"
)

func TestIsAgentStatusNotFound_True(t *testing.T) {
	if !IsAgentStatusNotFound(gorm.ErrRecordNotFound) {
		t.Errorf("expected true for ErrRecordNotFound")
	}
}

func TestIsAgentStatusNotFound_False(t *testing.T) {
	if IsAgentStatusNotFound(errors.New("some other error")) {
		t.Errorf("expected false for non-record-not-found error")
	}
	if IsAgentStatusNotFound(nil) {
		t.Errorf("expected false for nil")
	}
}

func TestArchiveChannel_HappyPath(t *testing.T) {
	s := testStore(t)
	if err := s.Migrate(); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UnixMilli()
	ch := &Channel{
		ID:         "ch-archive-1",
		Name:       "archive-target",
		Visibility: "public",
		Type:       "channel",
		CreatedAt:  now,
		Position:   "0|aaaaaa",
	}
	if err := s.db.Create(ch).Error; err != nil {
		t.Fatal(err)
	}

	archivedAt, err := s.ArchiveChannel(ch.ID)
	if err != nil {
		t.Fatalf("first archive: %v", err)
	}
	if archivedAt == 0 {
		t.Errorf("expected non-zero archived_at, got 0")
	}

	// Second call returns the existing archived_at without re-updating.
	archivedAt2, err := s.ArchiveChannel(ch.ID)
	if err != nil {
		t.Fatalf("second archive: %v", err)
	}
	if archivedAt2 != archivedAt {
		t.Errorf("idempotency broken: second call returned %d want %d", archivedAt2, archivedAt)
	}
}

func TestArchiveChannel_NotFound(t *testing.T) {
	s := testStore(t)
	if err := s.Migrate(); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ArchiveChannel("does-not-exist"); err == nil {
		t.Errorf("expected error for missing channel, got nil")
	}
}
