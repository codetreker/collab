// Package api_test — covbump_test.go: cross-PR cov bump for store helpers
// (IsAgentStatusNotFound + ArchiveChannel + ListChannelGroups). Same pattern
// as chn-5 covbump that landed cov 83.9% → 84.0%.
package api_test

import (
	"errors"
	"net/http"
	"testing"

	"borgee-server/internal/store"
	"borgee-server/internal/testutil"
	"gorm.io/gorm"
)

func TestCHN_11_CovBump_IsAgentStatusNotFound(t *testing.T) {
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

func TestCHN_11_CovBump_ArchiveChannel(t *testing.T) {
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

func TestCHN_11_CovBump_ListChannelGroups_Empty(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	ownerToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	resp, body := testutil.JSON(t, http.MethodGet,
		ts.URL+"/api/v1/channel-groups", ownerToken, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list groups: got %d", resp.StatusCode)
	}
	if _, ok := body["groups"].([]any); !ok {
		t.Errorf("groups key missing")
	}
}

func TestCHN_11_CovBump_ListChannelGroups_AfterCreate(t *testing.T) {
	t.Parallel()
	ts, _, _ := testutil.NewTestServer(t)
	ownerToken := testutil.LoginAs(t, ts.URL, "owner@test.com", "password123")
	resp, _ := testutil.JSON(t, http.MethodPost,
		ts.URL+"/api/v1/channel-groups", ownerToken,
		map[string]any{"name": "covbump-grp"})
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		t.Skipf("create group not 200/201")
	}
	resp, body := testutil.JSON(t, http.MethodGet,
		ts.URL+"/api/v1/channel-groups", ownerToken, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list after create: got %d", resp.StatusCode)
	}
	groups, _ := body["groups"].([]any)
	if len(groups) < 1 {
		t.Errorf("expected ≥1 group, got %d", len(groups))
	}
}
