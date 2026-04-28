// Package presence — tracker.go: AL-3.1 (#301 spec brief) read-side
// implementation of the PresenceTracker interface locked by #277
// (`contract.go`).
//
// Scope of this PR (AL-3.1):
//   - Reads: `IsOnline(userID)` + `Sessions(userID)` query the
//     `presence_sessions` table that migration v=12 lays down.
//   - Writes: `TrackOnline` / `TrackOffline` are NOT in this PR. They
//     land with AL-3.2 (`internal/ws/hub.go` lifecycle hook) where the
//     write surface needs to coordinate with the WS connection lifecycle
//     (defer-based teardown, ctx-cancel, panic). Adding the writes here
//     without the hook ties them to nothing.
//
// 接口签名锁不破 (#277 contract):
//   - `IsOnline(userID string) bool` — same byte-level signature as the
//     stub. The DB-backed impl below satisfies the same interface; no
//     existing caller (RT-0 / CM-4.3b / DM-2 fallback) recompiles.
//   - `Sessions(userID string) []string` — same. Returns the session_id
//     list; empty slice (not nil-only) when user is offline so callers
//     can `len(...) == 0` without nil-guard noise.
//
// 反约束 (#301 spec §0):
//   - presence reads MUST NOT scan `events` / `messages` / any
//     cursor-bearing table. They live in `presence_sessions` only —
//     瞬时态 vs 不可回退序列, RT-1 拆死.
//   - The agent_id-keyed lookup uses `idx_presence_sessions_agent_id`
//     (created in v=12 partial index); if the agent has no row at all
//     the query returns false (cross-org default-private, #301 §4).
package presence

import (
	"errors"

	"gorm.io/gorm"
)

// SessionsTracker is the DB-backed PresenceTracker implementation.
// Constructed with a *gorm.DB handle (typically `store.Store.DB()`).
//
// Concurrency: gorm's *DB is goroutine-safe for queries; the read path
// here is stateless (no in-memory cache) so it composes with the AL-3.2
// hub writes without locking. The write path (AL-3.2) will likewise go
// straight at the DB; the only shared invariant is the UNIQUE(session_id)
// constraint which the schema enforces.
type SessionsTracker struct {
	db *gorm.DB
}

// NewSessionsTracker wires a tracker against the given gorm handle.
// Returns an error only if db is nil — keeping the constructor explicit
// makes plumbing test failures (forgot to pass store.DB()) loud at boot.
func NewSessionsTracker(db *gorm.DB) (*SessionsTracker, error) {
	if db == nil {
		return nil, errors.New("presence: nil *gorm.DB")
	}
	return &SessionsTracker{db: db}, nil
}

// IsOnline returns true iff at least one row in `presence_sessions`
// matches the given user_id OR agent_id. The OR shape lets callers pass
// either a `users.id` (human owner / agent owner) or an `agents.id`
// (when checking an agent specifically) — DM-2 mention fallback uses
// the agent_id path; RT-0 / sidebar 渲染 uses user_id.
//
// Index path: `idx_presence_sessions_user_id` (full) +
// `idx_presence_sessions_agent_id` (partial WHERE agent_id IS NOT NULL).
// Both are O(log N); the LIMIT 1 + EXISTS shape avoids a full count.
func (t *SessionsTracker) IsOnline(userID string) bool {
	if userID == "" {
		return false
	}
	var present int64
	err := t.db.Raw(`SELECT 1 FROM presence_sessions
		WHERE user_id = ? OR agent_id = ?
		LIMIT 1`, userID, userID).Scan(&present).Error
	if err != nil {
		return false
	}
	return present == 1
}

// Sessions returns the live session_id list for the user. Same OR
// matching as IsOnline so callers see the union of human + agent rows.
// The returned slice is freshly allocated; callers may retain it.
//
// Empty (not nil) when offline so callers can range without nil-guard.
// `MUST NOT mutate` is documented on the interface for parity with the
// stub — this impl returns a fresh slice anyway, but the docstring
// keeps the contract truthful for future cache-backed impls.
func (t *SessionsTracker) Sessions(userID string) []string {
	if userID == "" {
		return []string{}
	}
	var ids []string
	err := t.db.Raw(`SELECT session_id FROM presence_sessions
		WHERE user_id = ? OR agent_id = ?
		ORDER BY connected_at ASC`, userID, userID).Scan(&ids).Error
	if err != nil {
		return []string{}
	}
	if ids == nil {
		return []string{}
	}
	return ids
}

// Compile-time assertion that SessionsTracker satisfies the #277-locked
// PresenceTracker interface. Drift on either method signature trips a
// build error — this is the contract drift test the AL-3 acceptance §1.2
// row pins (`var _ PresenceTracker = (*sessionsImpl)(nil)`).
var _ PresenceTracker = (*SessionsTracker)(nil)
