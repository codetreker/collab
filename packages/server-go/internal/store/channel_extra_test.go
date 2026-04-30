package store

// TEST-FIX-3-COV extra: cover 0% store funcs to push package ≥70% and
// every function ≥50%. All deterministic; no t.Sleep / no race-dep.

import (
	"testing"
	"time"
)

func TestPinChannelLayout(t *testing.T) {
	t.Parallel()
	s := migratedStore(t)
	u := createUser(t, s, "pin_user", "member")
	ch := createChannel(t, s, "pin-ch", "public", u.ID)

	now := time.Now().UnixMilli()
	if err := s.PinChannelLayout(u.ID, ch.ID, float64(-now), now); err != nil {
		t.Fatalf("PinChannelLayout fresh: %v", err)
	}
	// Idempotent overwrite branch.
	if err := s.PinChannelLayout(u.ID, ch.ID, float64(-(now + 1)), now+1); err != nil {
		t.Fatalf("PinChannelLayout overwrite: %v", err)
	}
}

func TestSetNotifPrefBits(t *testing.T) {
	t.Parallel()
	s := migratedStore(t)
	u := createUser(t, s, "snp_user", "member")
	ch := createChannel(t, s, "snp-ch", "public", u.ID)

	// Initial — no row, write.
	got, err := s.SetNotifPrefBits(u.ID, ch.ID, 4, 0x3, 1)
	if err != nil {
		t.Fatalf("SetNotifPrefBits initial: %v", err)
	}
	if got == 0 {
		t.Fatal("expected non-zero after first set")
	}
	// Existing row branch (pos != 0 and conflict path).
	got2, err := s.SetNotifPrefBits(u.ID, ch.ID, 4, 0x3, 2)
	if err != nil {
		t.Fatalf("SetNotifPrefBits existing: %v", err)
	}
	pref, _ := s.GetNotifPrefForUser(u.ID, ch.ID, 4, 0x3)
	if pref != 2 {
		t.Fatalf("GetNotifPrefForUser: got %d want 2 (raw=%d)", pref, got2)
	}
}

func TestUpdateChannelDescription_AndHistory(t *testing.T) {
	t.Parallel()
	s := migratedStore(t)
	u := createUser(t, s, "ucd_user", "member")
	ch := createChannel(t, s, "ucd-ch", "public", u.ID)

	// First update — no prior history, must append entry with old="".
	if err := s.UpdateChannelDescription(ch.ID, "first"); err != nil {
		t.Fatalf("UpdateChannelDescription first: %v", err)
	}
	hist, err := s.GetChannelDescriptionHistory(ch.ID)
	if err != nil {
		t.Fatalf("GetChannelDescriptionHistory: %v", err)
	}
	if len(hist) == 0 {
		t.Fatal("expected at least 1 history entry after update")
	}
	// Idempotent — same description doesn't add entry.
	if err := s.UpdateChannelDescription(ch.ID, "first"); err != nil {
		t.Fatalf("UpdateChannelDescription idempotent: %v", err)
	}
	hist2, _ := s.GetChannelDescriptionHistory(ch.ID)
	if len(hist2) != len(hist) {
		t.Fatalf("idempotent should not append: was %d now %d", len(hist), len(hist2))
	}
	// Different content — appends.
	if err := s.UpdateChannelDescription(ch.ID, "second"); err != nil {
		t.Fatalf("UpdateChannelDescription change: %v", err)
	}
	hist3, _ := s.GetChannelDescriptionHistory(ch.ID)
	if len(hist3) <= len(hist2) {
		t.Fatalf("change should append: was %d now %d", len(hist2), len(hist3))
	}

	// missing-row branch
	if _, err := s.GetChannelDescriptionHistory("nonexistent-ch"); err == nil {
		t.Fatal("expected err for missing channel")
	}
	if err := s.UpdateChannelDescription("nonexistent-ch", "x"); err == nil {
		t.Fatal("expected err for missing channel update")
	}
}

func TestListArchivedChannels_AndAdmin(t *testing.T) {
	t.Parallel()
	s := migratedStore(t)
	u := createUser(t, s, "arc_user", "member")
	ch := createChannel(t, s, "arc-ch", "public", u.ID)
	if err := s.AddChannelMember(&ChannelMember{ChannelID: ch.ID, UserID: u.ID}); err != nil {
		t.Fatal(err)
	}

	// Empty before archive.
	got, err := s.ListArchivedChannelsForUser(u.ID)
	if err != nil {
		t.Fatalf("ListArchivedChannelsForUser empty: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("want 0 archived, got %d", len(got))
	}
	// Archive then list.
	if _, err := s.ArchiveChannel(ch.ID); err != nil {
		t.Fatalf("ArchiveChannel: %v", err)
	}
	got, err = s.ListArchivedChannelsForUser(u.ID)
	if err != nil {
		t.Fatalf("ListArchivedChannelsForUser: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("want 1 archived, got %d", len(got))
	}
	all, err := s.ListAllArchivedChannelsForAdmin()
	if err != nil {
		t.Fatalf("ListAllArchivedChannelsForAdmin: %v", err)
	}
	if len(all) != 1 {
		t.Fatalf("want 1 archived (admin), got %d", len(all))
	}
}

func TestGetChannelByNameInOrg(t *testing.T) {
	t.Parallel()
	s := migratedStore(t)
	u := createUser(t, s, "orgname_user", "member")
	if _, err := s.CreateOrgForUser(u, "OrgX"); err != nil {
		t.Fatalf("CreateOrgForUser: %v", err)
	}
	ch := &Channel{
		Name: "byname-ch", Visibility: "public", CreatedBy: u.ID,
		Type: "channel", Position: GenerateInitialRank(), OrgID: u.OrgID,
	}
	if err := s.CreateChannel(ch); err != nil {
		t.Fatal(err)
	}
	got, err := s.GetChannelByNameInOrg(u.OrgID, "byname-ch")
	if err != nil {
		t.Fatalf("GetChannelByNameInOrg: %v", err)
	}
	if got.ID != ch.ID {
		t.Fatalf("ID mismatch")
	}
	if _, err := s.GetChannelByNameInOrg(u.OrgID, "no-such"); err == nil {
		t.Fatal("expected err for missing")
	}
}

func TestStatsByOrg(t *testing.T) {
	t.Parallel()
	s := migratedStore(t)
	// Empty org snapshot OK.
	rows, err := s.StatsByOrg()
	if err != nil {
		t.Fatalf("StatsByOrg empty: %v", err)
	}
	_ = rows

	u := createUser(t, s, "stats_owner", "member")
	if _, err := s.CreateOrgForUser(u, "StatsOrg"); err != nil {
		t.Fatalf("CreateOrgForUser: %v", err)
	}
	createChannel(t, s, "stats-ch", "public", u.ID)
	rows, err = s.StatsByOrg()
	if err != nil {
		t.Fatalf("StatsByOrg: %v", err)
	}
	if len(rows) == 0 {
		t.Fatal("StatsByOrg: expected rows")
	}
}

func TestAgentStatusQueries(t *testing.T) {
	t.Parallel()
	s := migratedStore(t)
	u := createUser(t, s, "as_owner", "member")
	apiKey, _ := GenerateAPIKey()
	agent := &User{DisplayName: "AS-Bot", Role: "agent", OwnerID: &u.ID, APIKey: &apiKey}
	if err := s.CreateUser(agent); err != nil {
		t.Fatalf("CreateUser agent: %v", err)
	}

	// TableName via instance receiver — direct call.
	if got := (AgentStatus{}).TableName(); got != "agent_status" {
		t.Fatalf("TableName: got %q", got)
	}
	// Empty agent_id error branches.
	if err := s.SetAgentTaskStarted("", "task1", time.Now()); err == nil {
		t.Fatal("SetAgentTaskStarted empty: expected err")
	}
	if err := s.SetAgentTaskFinished("", "task1", time.Now()); err == nil {
		t.Fatal("SetAgentTaskFinished empty: expected err")
	}
	// GetAgentStatus: no row → not found.
	if _, err := s.GetAgentStatus(agent.ID); err == nil {
		t.Fatal("GetAgentStatus pre: expected not-found")
	} else if !IsAgentStatusNotFound(err) {
		t.Fatalf("expected IsAgentStatusNotFound, got %v", err)
	}

	// Real flow.
	now := time.Now()
	if err := s.SetAgentTaskStarted(agent.ID, "task-1", now); err != nil {
		t.Fatalf("SetAgentTaskStarted: %v", err)
	}
	got, err := s.GetAgentStatus(agent.ID)
	if err != nil {
		t.Fatalf("GetAgentStatus busy: %v", err)
	}
	if got.State != "busy" {
		t.Fatalf("state=%q want busy", got.State)
	}
	if err := s.SetAgentTaskFinished(agent.ID, "task-1", now.Add(time.Second)); err != nil {
		t.Fatalf("SetAgentTaskFinished: %v", err)
	}
	got2, _ := s.GetAgentStatus(agent.ID)
	if got2.State != "idle" {
		t.Fatalf("state=%q want idle", got2.State)
	}
}
