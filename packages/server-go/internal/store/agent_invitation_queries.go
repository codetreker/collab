// Package store — agent_invitation_queries.go: CM-4.1 CRUD helpers.
//
// CM-4.0 landed the model + state machine helper. CM-4.1 adds the storage
// methods the HTTP handler needs. Behavior helpers (Transition / CanTransition)
// stay in agent_invitation.go; only the *Store methods live here.
package store

import (
	"errors"

	"gorm.io/gorm"
)

// CreateAgentInvitation inserts a new invitation row. Caller is responsible
// for setting ID (uuid), ChannelID, AgentID, RequestedBy, State (typically
// AgentInvitationPending — handlers MUST set it explicitly per CM-4.1
// review flag #2), and CreatedAt. ExpiresAt is optional.
func (s *Store) CreateAgentInvitation(inv *AgentInvitation) error {
	if inv == nil {
		return errors.New("CreateAgentInvitation: nil invitation")
	}
	return s.db.Create(inv).Error
}

// GetAgentInvitation fetches a single invitation by ID. Returns
// gorm.ErrRecordNotFound if the row is missing.
func (s *Store) GetAgentInvitation(id string) (*AgentInvitation, error) {
	var inv AgentInvitation
	if err := s.db.Where("id = ?", id).First(&inv).Error; err != nil {
		return nil, err
	}
	return &inv, nil
}

// ListAgentInvitationsForAgents returns all invitations whose agent_id is in
// the given set, newest first. Used by the handler's GET ?role=owner — the
// caller passes in the agent ids that they own; we then return everything
// addressed to those agents (any state).
//
// Returns an empty slice when agentIDs is empty (the underlying SQL would
// return zero rows anyway, but we short-circuit to avoid an empty IN ()).
func (s *Store) ListAgentInvitationsForAgents(agentIDs []string) ([]AgentInvitation, error) {
	if len(agentIDs) == 0 {
		return []AgentInvitation{}, nil
	}
	var invs []AgentInvitation
	err := s.db.Where("agent_id IN ?", agentIDs).
		Order("created_at DESC").
		Find(&invs).Error
	return invs, err
}

// ListAgentInvitationsByRequester returns all invitations created by the given
// user, newest first. Used by GET ?role=requester.
func (s *Store) ListAgentInvitationsByRequester(userID string) ([]AgentInvitation, error) {
	var invs []AgentInvitation
	err := s.db.Where("requested_by = ?", userID).
		Order("created_at DESC").
		Find(&invs).Error
	return invs, err
}

// UpdateAgentInvitationState writes back a state transition. The handler is
// expected to load the invitation, call inv.Transition() (which stamps
// DecidedAt and returns ErrInvalidTransition for illegal edges), then call
// this method to persist. Updates only the two columns that the state
// machine touches — never overwrites identity or audit columns.
func (s *Store) UpdateAgentInvitationState(inv *AgentInvitation) error {
	if inv == nil || inv.ID == "" {
		return errors.New("UpdateAgentInvitationState: nil or unidentified invitation")
	}
	res := s.db.Model(&AgentInvitation{}).
		Where("id = ?", inv.ID).
		Updates(map[string]any{
			"state":      inv.State,
			"decided_at": inv.DecidedAt,
		})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}
