// Package store — agent_invitation.go: CM-4.0 model + state machine helper.
//
// Blueprint: concept-model.md §4.2 跨 org 邀请 agent 进 channel.
//
// Scope (CM-4.0): only the data model + transition rules. No HTTP handler,
// no BPP frame, no client UI, no creation/accept/decline API. Those land in
// CM-4.1.
package store

import (
	"errors"
	"fmt"
)

// AgentInvitationState is the enum for agent_invitations.state.
//
// State machine (terminal states are accepted/declined/expired):
//
//	pending → accepted   (owner agreed)
//	pending → declined   (owner rejected)
//	pending → expired    (created_at + ttl elapsed without decision)
//
// All non-pending → * transitions are illegal and rejected by Transition.
type AgentInvitationState string

const (
	AgentInvitationPending  AgentInvitationState = "pending"
	AgentInvitationAccepted AgentInvitationState = "accepted"
	AgentInvitationDeclined AgentInvitationState = "declined"
	AgentInvitationExpired  AgentInvitationState = "expired"
)

// validStates lists every state the schema CHECK constraint accepts. Kept in
// sync with cm_4_0_agent_invitations.go.
var validStates = map[AgentInvitationState]struct{}{
	AgentInvitationPending:  {},
	AgentInvitationAccepted: {},
	AgentInvitationDeclined: {},
	AgentInvitationExpired:  {},
}

// IsValid reports whether s is a recognized state.
func (s AgentInvitationState) IsValid() bool {
	_, ok := validStates[s]
	return ok
}

// IsTerminal reports whether s is a terminal state (no outbound transitions).
func (s AgentInvitationState) IsTerminal() bool {
	return s == AgentInvitationAccepted ||
		s == AgentInvitationDeclined ||
		s == AgentInvitationExpired
}

// AgentInvitation is the GORM model for the agent_invitations table.
//
// Columns mirror the migration 1:1. Use json tags so existing serializers
// don't accidentally leak gorm internals (规则: 永不 auto-marshal model — see
// admin sanitizer pattern). Handlers in CM-4.1 must still hand-build response
// payloads from this struct.
type AgentInvitation struct {
	ID          string               `gorm:"primaryKey;size:36"             json:"id"`
	ChannelID   string               `gorm:"not null;size:36;index"         json:"channel_id"`
	AgentID     string               `gorm:"not null;size:36;index"         json:"agent_id"`
	RequestedBy string               `gorm:"not null;size:36;index"         json:"requested_by"`
	State       AgentInvitationState `gorm:"not null;size:20;default:pending" json:"state"`
	CreatedAt   int64                `gorm:"not null"                       json:"created_at"`
	DecidedAt   *int64               `                                      json:"decided_at,omitempty"`
	ExpiresAt   *int64               `gorm:"index"                          json:"expires_at,omitempty"`
}

// TableName pins GORM to the migration's table name regardless of the global
// naming strategy.
func (AgentInvitation) TableName() string { return "agent_invitations" }

// ErrInvalidTransition is returned by Transition when a transition is not
// allowed by the state machine. Callers SHOULD compare with errors.Is.
var ErrInvalidTransition = errors.New("agent_invitation: invalid state transition")

// allowedTransitions enumerates every legal (from, to) pair. The state
// machine is intentionally tiny — three transitions, all out of pending.
var allowedTransitions = map[AgentInvitationState]map[AgentInvitationState]struct{}{
	AgentInvitationPending: {
		AgentInvitationAccepted: {},
		AgentInvitationDeclined: {},
		AgentInvitationExpired:  {},
	},
	// Terminal states have no outbound edges.
	AgentInvitationAccepted: {},
	AgentInvitationDeclined: {},
	AgentInvitationExpired:  {},
}

// CanTransition reports whether moving from `from` to `to` is permitted.
// Returns false (without panicking) for any unknown state — callers receive
// the same answer as for an explicitly-illegal transition.
func CanTransition(from, to AgentInvitationState) bool {
	if !from.IsValid() || !to.IsValid() {
		return false
	}
	outs, ok := allowedTransitions[from]
	if !ok {
		return false
	}
	_, ok = outs[to]
	return ok
}

// Transition mutates inv.State in place to `to` if the transition is
// allowed, also stamping DecidedAt with `nowMillis` on every successful
// transition out of pending. Returns ErrInvalidTransition wrapped with
// context otherwise. inv is unchanged on error.
//
// `nowMillis` is injected (rather than read from time.Now()) so callers and
// tests stay deterministic — Phase 1 testutil/clock convention.
func (inv *AgentInvitation) Transition(to AgentInvitationState, nowMillis int64) error {
	if inv == nil {
		return fmt.Errorf("%w: nil invitation", ErrInvalidTransition)
	}
	if !CanTransition(inv.State, to) {
		return fmt.Errorf("%w: %s → %s", ErrInvalidTransition, inv.State, to)
	}
	inv.State = to
	d := nowMillis
	inv.DecidedAt = &d
	return nil
}
