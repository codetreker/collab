package store

import (
	"errors"
	"testing"
)

// TestAgentInvitation_ValidStates positively asserts the four states named by
// blueprint §4.2 (pending / approved / rejected / expired) are recognized,
// and that obviously-wrong inputs (empty, wrong case, unrelated words) are
// rejected.
func TestAgentInvitation_ValidStates(t *testing.T) {
	t.Parallel()
	for _, s := range []AgentInvitationState{
		AgentInvitationPending,
		AgentInvitationApproved,
		AgentInvitationRejected,
		AgentInvitationExpired,
	} {
		if !s.IsValid() {
			t.Errorf("state %q should be valid", s)
		}
	}

	for _, s := range []AgentInvitationState{
		"",
		"PENDING", // case sensitive
		"completed",
		"weird",
	} {
		if s.IsValid() {
			t.Errorf("state %q must be invalid", s)
		}
	}
}

// TestAgentInvitation_TerminalStates positively asserts approved / rejected /
// expired are the three legal terminal states (blueprint §4.2 wording).
func TestAgentInvitation_TerminalStates(t *testing.T) {
	t.Parallel()
	terminals := []AgentInvitationState{
		AgentInvitationApproved,
		AgentInvitationRejected,
		AgentInvitationExpired,
	}
	for _, s := range terminals {
		if !s.IsTerminal() {
			t.Errorf("%s must be a terminal state", s)
		}
	}
	if AgentInvitationPending.IsTerminal() {
		t.Error("pending must NOT be a terminal state")
	}
}

func TestAgentInvitation_IsTerminal(t *testing.T) {
	t.Parallel()
	cases := map[AgentInvitationState]bool{
		AgentInvitationPending:  false,
		AgentInvitationApproved: true,
		AgentInvitationRejected: true,
		AgentInvitationExpired:  true,
	}
	for s, want := range cases {
		if got := s.IsTerminal(); got != want {
			t.Errorf("%s.IsTerminal() = %v, want %v", s, got, want)
		}
	}
}

// TestCanTransition_AllPairs is the matrix-shaped contract: it asserts the
// outcome of CanTransition for every (from, to) pair across the full enum.
// Adding a new state forces this test to be updated, which is the point.
func TestCanTransition_AllPairs(t *testing.T) {
	t.Parallel()
	all := []AgentInvitationState{
		AgentInvitationPending,
		AgentInvitationApproved,
		AgentInvitationRejected,
		AgentInvitationExpired,
	}
	allowed := map[[2]AgentInvitationState]bool{
		{AgentInvitationPending, AgentInvitationApproved}: true,
		{AgentInvitationPending, AgentInvitationRejected}: true,
		{AgentInvitationPending, AgentInvitationExpired}:  true,
	}
	for _, from := range all {
		for _, to := range all {
			want := allowed[[2]AgentInvitationState{from, to}]
			if got := CanTransition(from, to); got != want {
				t.Errorf("CanTransition(%s, %s) = %v, want %v", from, to, got, want)
			}
		}
	}
}

func TestCanTransition_RejectsUnknownStates(t *testing.T) {
	t.Parallel()
	cases := []struct{ from, to AgentInvitationState }{
		{"", AgentInvitationApproved},
		{AgentInvitationPending, ""},
		{"completed", AgentInvitationApproved},
		{AgentInvitationPending, "completed"},
		{"weird", "weirder"},
	}
	for _, c := range cases {
		if CanTransition(c.from, c.to) {
			t.Errorf("CanTransition(%q, %q) = true, want false", c.from, c.to)
		}
	}
}

func TestTransition_Success_StampsDecidedAt(t *testing.T) {
	t.Parallel()
	for _, target := range []AgentInvitationState{
		AgentInvitationApproved,
		AgentInvitationRejected,
		AgentInvitationExpired,
	} {
		inv := &AgentInvitation{
			ID:    "i-1",
			State: AgentInvitationPending,
		}
		const now int64 = 1_700_000_000_000
		if err := inv.Transition(target, now); err != nil {
			t.Fatalf("transition pending → %s: %v", target, err)
		}
		if inv.State != target {
			t.Errorf("State after transition = %s, want %s", inv.State, target)
		}
		if inv.DecidedAt == nil {
			t.Fatal("DecidedAt must be stamped on successful transition")
		}
		if *inv.DecidedAt != now {
			t.Errorf("DecidedAt = %d, want %d", *inv.DecidedAt, now)
		}
	}
}

// TestTransition_RejectsAllIllegalEdges enumerates every illegal (from, to)
// pair and asserts each one returns ErrInvalidTransition without mutating
// the invitation. Combined with TestCanTransition_AllPairs this is the
// "行为不变量 4.1" acceptance evidence: no illegal transition can succeed.
func TestTransition_RejectsAllIllegalEdges(t *testing.T) {
	t.Parallel()
	all := []AgentInvitationState{
		AgentInvitationPending,
		AgentInvitationApproved,
		AgentInvitationRejected,
		AgentInvitationExpired,
	}
	allowed := map[[2]AgentInvitationState]bool{
		{AgentInvitationPending, AgentInvitationApproved}: true,
		{AgentInvitationPending, AgentInvitationRejected}: true,
		{AgentInvitationPending, AgentInvitationExpired}:  true,
	}
	for _, from := range all {
		for _, to := range all {
			if allowed[[2]AgentInvitationState{from, to}] {
				continue
			}
			inv := &AgentInvitation{ID: "i-1", State: from}
			err := inv.Transition(to, 999)
			if !errors.Is(err, ErrInvalidTransition) {
				t.Errorf("Transition(%s → %s): err = %v, want ErrInvalidTransition", from, to, err)
			}
			if inv.State != from {
				t.Errorf("Transition(%s → %s) mutated State to %s on failure", from, to, inv.State)
			}
			if inv.DecidedAt != nil {
				t.Errorf("Transition(%s → %s) stamped DecidedAt on failure", from, to)
			}
		}
	}
}

func TestTransition_NilReceiver(t *testing.T) {
	t.Parallel()
	var inv *AgentInvitation
	err := inv.Transition(AgentInvitationApproved, 1)
	if !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("nil receiver: err = %v, want ErrInvalidTransition", err)
	}
}

func TestAgentInvitation_TableName(t *testing.T) {
	t.Parallel()
	if got := (AgentInvitation{}).TableName(); got != "agent_invitations" {
		t.Errorf("TableName() = %q, want %q", got, "agent_invitations")
	}
}
