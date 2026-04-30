// DL-1 — PresenceStore interface (蓝图 §4 B 第 2 条).
//
// 立场 ① (DL-1 spec §0): IsOnline / Sessions byte-identical 跟蓝图.
// v1 实现 InMemoryPresence 走 AL-3 #324 既有 presence.PresenceTracker
// (内部 in-memory map) byte-identical 不破 — 跟 G2.5 contract 锁同源.
//
// 切换路径 (留 v3+):
//   - InMemoryPresence (v1) → presence.PresenceTracker
//   - DistributedPresence  → Redis / NATS pub-sub (留 DL-3 阈值哨触发)
package datalayer

import "context"

// PresenceStore is the SSOT interface for "is user X reachable?" queries.
// v1 walls thru AL-3 PresenceTracker; v3+ swap underlying implementation
// without touching consumers (handlers go thru this seam, not directly).
type PresenceStore interface {
	// IsOnline reports whether the user/agent has at least one live session.
	// 跟 G2.5 contract 同源 (presence.PresenceTracker.IsOnline).
	IsOnline(ctx context.Context, userID string) (bool, error)

	// Sessions returns the live session ids for the user. Empty slice means
	// offline. Stable order is not required (跟 #310 锁同精神).
	Sessions(ctx context.Context, userID string) ([]string, error)
}
