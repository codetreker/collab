// agent_invitation_queries_test.go — CM-4.1 store helper tests.
package store

import (
	"errors"
	"testing"

	"gorm.io/gorm"
)

func mustOpenStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(":memory:")
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if err := s.Migrate(); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func newPendingInv(id, channel, agent, requester string, ts int64) *AgentInvitation {
	return &AgentInvitation{
		ID:          id,
		ChannelID:   channel,
		AgentID:     agent,
		RequestedBy: requester,
		State:       AgentInvitationPending,
		CreatedAt:   ts,
	}
}

func TestCreateAndGetAgentInvitation(t *testing.T) {
	t.Parallel()
	s := mustOpenStore(t)

	inv := newPendingInv("inv-1", "ch-1", "ag-1", "u-1", 1000)
	if err := s.CreateAgentInvitation(inv); err != nil {
		t.Fatalf("CreateAgentInvitation: %v", err)
	}

	got, err := s.GetAgentInvitation("inv-1")
	if err != nil {
		t.Fatalf("GetAgentInvitation: %v", err)
	}
	if got.State != AgentInvitationPending || got.ChannelID != "ch-1" || got.AgentID != "ag-1" {
		t.Fatalf("round-trip mismatch: %+v", got)
	}

	if err := s.CreateAgentInvitation(nil); err == nil {
		t.Fatal("CreateAgentInvitation(nil): want error")
	}

	if _, err := s.GetAgentInvitation("nope"); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("GetAgentInvitation(nope) = %v, want ErrRecordNotFound", err)
	}
}

func TestListAgentInvitationsForAgents(t *testing.T) {
	t.Parallel()
	s := mustOpenStore(t)

	_ = s.CreateAgentInvitation(newPendingInv("a", "ch-1", "ag-1", "u-1", 1000))
	_ = s.CreateAgentInvitation(newPendingInv("b", "ch-2", "ag-1", "u-2", 2000))
	_ = s.CreateAgentInvitation(newPendingInv("c", "ch-1", "ag-2", "u-1", 3000))
	_ = s.CreateAgentInvitation(newPendingInv("d", "ch-1", "ag-3", "u-1", 4000))

	got, err := s.ListAgentInvitationsForAgents([]string{"ag-1", "ag-2"})
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("got %d, want 3", len(got))
	}
	// Newest first.
	if got[0].ID != "c" || got[1].ID != "b" || got[2].ID != "a" {
		t.Fatalf("order mismatch: %v %v %v", got[0].ID, got[1].ID, got[2].ID)
	}

	empty, err := s.ListAgentInvitationsForAgents(nil)
	if err != nil || len(empty) != 0 {
		t.Fatalf("empty input: %v %v", empty, err)
	}
}

func TestListAgentInvitationsByRequester(t *testing.T) {
	t.Parallel()
	s := mustOpenStore(t)

	_ = s.CreateAgentInvitation(newPendingInv("a", "ch-1", "ag-1", "u-1", 1000))
	_ = s.CreateAgentInvitation(newPendingInv("b", "ch-2", "ag-2", "u-1", 2000))
	_ = s.CreateAgentInvitation(newPendingInv("c", "ch-1", "ag-3", "u-2", 3000))

	got, err := s.ListAgentInvitationsByRequester("u-1")
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(got) != 2 || got[0].ID != "b" || got[1].ID != "a" {
		t.Fatalf("got %+v", got)
	}
}

func TestUpdateAgentInvitationState(t *testing.T) {
	t.Parallel()
	s := mustOpenStore(t)

	inv := newPendingInv("inv-1", "ch", "ag", "u", 1000)
	if err := s.CreateAgentInvitation(inv); err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := inv.Transition(AgentInvitationApproved, 5000); err != nil {
		t.Fatalf("Transition: %v", err)
	}
	if err := s.UpdateAgentInvitationState(inv); err != nil {
		t.Fatalf("Update: %v", err)
	}

	got, _ := s.GetAgentInvitation("inv-1")
	if got.State != AgentInvitationApproved {
		t.Fatalf("state = %s, want approved", got.State)
	}
	if got.DecidedAt == nil || *got.DecidedAt != 5000 {
		t.Fatalf("decided_at = %v, want 5000", got.DecidedAt)
	}

	// Update on missing row → ErrRecordNotFound.
	ghost := &AgentInvitation{ID: "ghost", State: AgentInvitationApproved}
	if err := s.UpdateAgentInvitationState(ghost); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("ghost update = %v, want ErrRecordNotFound", err)
	}

	// Nil / unidentified → error.
	if err := s.UpdateAgentInvitationState(nil); err == nil {
		t.Fatal("nil update: want error")
	}
	if err := s.UpdateAgentInvitationState(&AgentInvitation{}); err == nil {
		t.Fatal("unidentified update: want error")
	}
}
