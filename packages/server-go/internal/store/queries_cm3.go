package store

// CM-3 — resource ownership via direct org_id lookups.
//
// Blueprint: docs/qa/cm-3-resource-ownership-checklist.md (野马 #200).
//
// Stance: 1 person = 1 org in v0; resource rows carry org_id stamped at
// INSERT (CM-3.1) so READ paths can filter `WHERE org_id = ?` instead of
// JOINing through owner_id (CM-3.2). The G1.4 black-list grep
//
//	grep -rEn 'JOIN.*(messages|channels|workspace_files|agents|remote_nodes).*owner_id'
//
// must return 0 hits in non-test code under internal/store/.

// CrossOrg returns true iff actor and resource carry **different non-empty**
// org_ids. v0 is permissive: if either side is empty (legacy unstamped row,
// pre-CM-1.1 dev DB), the predicate falls through and lets the request reach
// the existing membership/owner checks. Strict only when both populated.
func CrossOrg(actorOrg, resourceOrg string) bool {
	if actorOrg == "" || resourceOrg == "" {
		return false
	}
	return actorOrg != resourceOrg
}

// MessageOrgID returns the org_id of a message by id. Empty string if the row
// is missing or its org_id was never stamped (legacy backfill miss).
func (s *Store) MessageOrgID(id string) (string, error) {
	var m Message
	if err := s.db.Select("org_id").Where("id = ?", id).First(&m).Error; err != nil {
		return "", err
	}
	return m.OrgID, nil
}

// ChannelOrgID returns the org_id of a channel by id.
func (s *Store) ChannelOrgID(id string) (string, error) {
	var c Channel
	if err := s.db.Select("org_id").Where("id = ?", id).First(&c).Error; err != nil {
		return "", err
	}
	return c.OrgID, nil
}

// WorkspaceFileOrgID returns the org_id of a workspace_files row by id.
func (s *Store) WorkspaceFileOrgID(id string) (string, error) {
	var f WorkspaceFile
	if err := s.db.Select("org_id").Where("id = ?", id).First(&f).Error; err != nil {
		return "", err
	}
	return f.OrgID, nil
}

// RemoteNodeOrgID returns the org_id of a remote_nodes row by id.
func (s *Store) RemoteNodeOrgID(id string) (string, error) {
	var n RemoteNode
	if err := s.db.Select("org_id").Where("id = ?", id).First(&n).Error; err != nil {
		return "", err
	}
	return n.OrgID, nil
}
