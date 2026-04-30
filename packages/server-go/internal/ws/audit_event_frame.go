// Package ws — audit_event_frame.go: AL-9.1 source-of-truth for the
// `audit_event` SSE push frame fired on every admin_actions INSERT.
//
// Blueprint锚: docs/blueprint/admin-model.md §1.4 (admin 互可见 +
// Audit 100% 留痕 + 受影响者必感知).
// Spec brief: docs/implementation/modules/al-9-spec.md §0 立场 ②
// (audit fan-out 锁链终结) + §5 5 字段 byte-identical 跨链第 6 处.
// Content lock: docs/qa/al-9-content-lock.md §2 + §4.
//
// Behaviour contract (跟 ArtifactUpdated 7 / IterationStateChanged 9 /
// AnchorCommentAdded 10 同 envelope 模式):
//
//   1. Cursor 走 hub.cursors.NextCursor() 单调发号, 跟 ArtifactUpdated /
//      AnchorCommentAdded 共一根 sequence (RT-1 spec §1.1, 反约束: 不另
//      起 channel).
//   2. 字段顺序锁 (envelope 7 字段): type/cursor/action_id/actor_id/
//      action/target_user_id/created_at — type 字面 "audit_event"
//      discriminator. 跟 acceptance §1.3 byte-identical.
//   3. 5 业务字段 byte-identical 跟 ADM-2.1 admin_actions schema:
//      action_id (PK) / actor_id / action / target_user_id / created_at.
//      跨链锁第 6 处 (HB-1 / HB-2 / BPP-4 / BPP-8 / HB-3 v2 / AL-7 同源).
//
// 反约束 (stance §2 立场 ② + spec §3 反向 grep #2):
//   - 不复制 envelope (复用 cursor SSE pattern + 加 type discriminator)
//   - 反向 grep legacy envelope names (audit_event 加 v2 后缀 / audit
//     stream / admin_actions event variants) 在 internal/ count==0
package ws

// FrameTypeAuditEvent is the `type` discriminator emitted on the
// admin-rail SSE envelope; client switch lives in
// packages/client/src/admin/components/AuditLogStream.tsx (AL-9.3).
const FrameTypeAuditEvent = "audit_event"

// AuditEventFrame — server → admin SPA push fired on every
// `admin_actions` INSERT. 7 字段, 严守 spec brief envelope 字面 +
// acceptance §1.3 byte-identical.
//
// Field order is the contract. Do NOT reorder without updating
// packages/client/src/admin/types.ts (AL-9.3) in the same PR.
type AuditEventFrame struct {
	Type         string `json:"type"`
	Cursor       int64  `json:"cursor"`
	ActionID     string `json:"action_id"`
	ActorID      string `json:"actor_id"`
	Action       string `json:"action"`
	TargetUserID string `json:"target_user_id"`
	CreatedAt    int64  `json:"created_at"` // Unix ms
}

// PushAuditEvent broadcasts AuditEventFrame to all connected admin SSE
// subscribers via SignalNewEvents (admin-rail SSE handler is the
// receiver; user-rail unaffected — handler-level rail isolation).
// Cursor is allocated fresh from hub.cursors so the frame slots into
// the same monotonic sequence as ArtifactUpdated /
// IterationStateChanged / AnchorCommentAdded (反约束: 不另起 channel).
//
// Returns (cursor, sent). sent=false only when the hub has no cursor
// allocator (test seam) — nil-safe pusher seam, 跟 ArtifactPusher /
// IterationPusher 5+ 处同模式.
//
// 立场 ② audit fan-out 锁链终结: 6 audit writer (ADM-2.1 / AL-1 /
// BPP-4 / BPP-8 / AP-2 / AL-7) 全经 Store.InsertAdminAction → 此 Push
// 自动 fan-out (改 = 改 InsertAdminAction 一处).
func (h *Hub) PushAuditEvent(actionID, actorID, action, targetUserID string, createdAt int64) (cursor int64, sent bool) {
	if h.cursors == nil {
		return 0, false
	}
	cur := h.cursors.NextCursor()
	frame := AuditEventFrame{
		Type:         FrameTypeAuditEvent,
		Cursor:       cur,
		ActionID:     actionID,
		ActorID:      actorID,
		Action:       action,
		TargetUserID: targetUserID,
		CreatedAt:    createdAt,
	}
	// admin-rail SSE handler reads frames via the auditEventBuffer (per
	// SignalNewEvents wakeup). user-rail clients never see this frame —
	// handler is mounted only behind adminMw (立场 ① admin-rail SSE only).
	h.publishAuditEvent(frame)
	h.SignalNewEvents()
	return cur, true
}

// publishAuditEvent is the in-process delivery seam between
// PushAuditEvent and the SSE handler's per-connection ring buffer.
// Implemented in audit_event_buffer.go (separate file so tests can
// substitute the buffer behaviour without touching frame schema).
func (h *Hub) publishAuditEvent(frame AuditEventFrame) {
	h.auditMu.Lock()
	h.auditBuffer = append(h.auditBuffer, frame)
	// Cap at 200 — admin SSE backfill replay limit is 50 (立场 ⑨), 200
	// gives 4x headroom for late subscribers across short windows.
	if len(h.auditBuffer) > 200 {
		h.auditBuffer = h.auditBuffer[len(h.auditBuffer)-200:]
	}
	h.auditMu.Unlock()
}

// SnapshotAuditBuffer returns a copy of all currently-buffered audit
// frames with cursor > since (asc). Used by handleAuditEvents SSE
// handler to replay the last N frames on subscribe (立场 ⑨ 50 行 limit
// enforced at handler).
func (h *Hub) SnapshotAuditBuffer(since int64) []AuditEventFrame {
	h.auditMu.Lock()
	defer h.auditMu.Unlock()
	out := make([]AuditEventFrame, 0, len(h.auditBuffer))
	for _, f := range h.auditBuffer {
		if f.Cursor > since {
			out = append(out, f)
		}
	}
	return out
}
