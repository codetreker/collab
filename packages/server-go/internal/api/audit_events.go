// Package api — audit_events.go: AL-9.1 admin-rail SSE endpoint
// `GET /admin-api/v1/audit-log/events`. Live monitor for admin SPA
// (replaces poll of GET /admin-api/v1/audit-log).
//
// Blueprint锚: docs/blueprint/admin-model.md §1.3 + §1.4 (admin 互可见
// + Audit 100% 留痕 + 受影响者必感知).
// Spec brief: docs/implementation/modules/al-9-spec.md §1 拆段 AL-9.1.
// Acceptance: docs/qa/acceptance-templates/al-9.md §AL-9.1 (1.1-1.6).
// Stance: docs/qa/al-9-stance-checklist.md 立场 ① + ④ + ⑤ + ⑥ + ⑨.
//
// SSE handler ordering — subscribe-before-handshake (跟 PR #533 fix
// 同模式, 反 race window):
//
//   ctx = r.Context()
//   signal = h.Hub.SubscribeEvents()         // (1) subscribe FIRST
//   defer h.Hub.UnsubscribeEvents(signal)
//   snapshot = highest cursor in audit buffer  // (2) snapshot cursor
//   WriteHeader(200) + ":connected\n\n" flush  // (3) THEN handshake
//   loop on signal/ctx                          // (4) live tail
//
// Order is critical: any admin_actions INSERT that races our handshake
// either (a) bumps the buffer + signal-channel slot we drain on entry,
// or (b) was already in the snapshot we replay. There is no window
// where a row commits and we silently drop the signal.
//
// 反约束 (stance §1 立场 ①):
//   - mounted ONLY on /admin-api/v1/* (admin-rail), reverse grep 反向匹配
//     user-rail audit-log events path 在 internal/api/ count==0.
//   - 5 错码字面 const single-source (立场 ⑥).
package api

import (
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"borgee-server/internal/admin"
	"borgee-server/internal/store"
	"borgee-server/internal/ws"
)

// 5 错码字面单源 (跟 AP-1/AP-2/AP-3/CV-2 v2/CV-3 v2/CV-6 const 同模式).
// 改 = 改三处: 此 const + client AUDIT_ERR_TOAST map (api.ts) +
// content-lock §3 文档. CI lint 等价单测守 future drift.
const (
	AuditErrCodeNotAdmin          = "audit.not_admin"
	AuditErrCodeCursorInvalid     = "audit.cursor_invalid"
	AuditErrCodeSSEUnsupported    = "audit.sse_unsupported"
	AuditErrCodeCrossOrgDenied    = "audit.cross_org_denied"
	AuditErrCodeConnectionDropped = "audit.connection_dropped"
)

// auditBackfillLimit caps the number of buffered frames replayed on
// subscribe (since=cursor). 立场 ⑨ unbounded backfill 反约束: hardcoded
// const 50 — reverse grep `audit.*limit.*[0-9]{3,}` (3+ digits) 0 hit.
const auditBackfillLimit = 50

// AuditEventsHandler hosts GET /admin-api/v1/audit-log/events.
// admin-rail mount (走 adminMw, /admin-api/v1/audit-log/events) — 立场 ①.
type AuditEventsHandler struct {
	Store  *store.Store
	Hub    *ws.Hub
	Logger *slog.Logger
}

// RegisterAdminRoutes wires the admin-rail SSE endpoint. Mirrors
// ADM2Handler.RegisterAdminRoutes (path namespace + adminMw shared).
func (h *AuditEventsHandler) RegisterAdminRoutes(mux *http.ServeMux, adminMw func(http.Handler) http.Handler) {
	mux.Handle("GET /admin-api/v1/audit-log/events", adminMw(http.HandlerFunc(h.handleAuditEvents)))
}

// handleAuditEvents — GET /admin-api/v1/audit-log/events (SSE).
//
// Behaviour (acceptance §1.1-§1.6):
//   - Content-Type: text/event-stream + `:connected` flush
//   - Last-Event-ID resume (or ?since=N query) — replay buffered frames
//     with cursor > since (capped at 50 行, 立场 ⑨)
//   - subscribe-before-handshake ordering (#533 fix 同模式)
//   - admin-rail mw 已 401 user cookie (RequireAdmin from admin pkg)
func (h *AuditEventsHandler) handleAuditEvents(w http.ResponseWriter, r *http.Request) {
	a := admin.AdminFromContext(r.Context())
	if a == nil {
		writeJSONError(w, http.StatusUnauthorized, AuditErrCodeNotAdmin)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSONError(w, http.StatusInternalServerError, AuditErrCodeSSEUnsupported)
		return
	}

	// Parse since cursor — Last-Event-ID header (SSE native resume) takes
	// priority, ?since= query is the explicit fallback. Invalid → 400.
	var since int64
	if lastID := r.Header.Get("Last-Event-ID"); lastID != "" {
		c, err := strconv.ParseInt(lastID, 10, 64)
		if err != nil || c < 0 {
			writeJSONError(w, http.StatusBadRequest, AuditErrCodeCursorInvalid)
			return
		}
		since = c
	} else if q := r.URL.Query().Get("since"); q != "" {
		c, err := strconv.ParseInt(q, 10, 64)
		if err != nil || c < 0 {
			writeJSONError(w, http.StatusBadRequest, AuditErrCodeCursorInvalid)
			return
		}
		since = c
	}

	// CRITICAL ordering — subscribe-before-handshake (跟 PR #533 SSE
	// backfill fix 同模式, stance §1 立场 ④):
	//
	//   (1) SubscribeEvents 拿 signal channel (cap=1) BEFORE WriteHeader
	//   (2) Snapshot audit buffer (since cursor) BEFORE WriteHeader
	//   (3) WriteHeader(200) + ":connected" flush
	//   (4) Replay snapshot frames (capped at 50)
	//   (5) Live loop on signal — every PushAuditEvent wakes us
	//
	// Race shape closed: any admin_actions INSERT between (2) and (5)
	// either (a) appends to auditBuffer THEN fires SignalNewEvents which
	// the cap=1 channel buffers (drained at first select), or (b) was
	// already in the snapshot. Reversing (1) and (3) re-opens the race
	// — DO NOT.
	ctx := r.Context()
	var signal chan struct{}
	if h.Hub != nil {
		signal = h.Hub.SubscribeEvents()
		defer h.Hub.UnsubscribeEvents(signal)
	}
	var snapshot []ws.AuditEventFrame
	if h.Hub != nil {
		snapshot = h.Hub.SnapshotAuditBuffer(since)
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	fmt.Fprint(w, ":connected\n\n")
	flusher.Flush()

	// Replay buffered frames (立场 ⑨ 50 行 limit hardcoded).
	if len(snapshot) > auditBackfillLimit {
		snapshot = snapshot[len(snapshot)-auditBackfillLimit:]
	}
	var lastCursor int64 = since
	for _, f := range snapshot {
		writeAuditFrame(w, f)
		lastCursor = f.Cursor
	}
	flusher.Flush()

	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-heartbeat.C:
			fmt.Fprintf(w, "event: heartbeat\nid: %d\ndata: {}\n\n", lastCursor)
			flusher.Flush()
		case <-signal:
			if h.Hub == nil {
				continue
			}
			frames := h.Hub.SnapshotAuditBuffer(lastCursor)
			if len(frames) == 0 {
				continue
			}
			for _, f := range frames {
				writeAuditFrame(w, f)
				lastCursor = f.Cursor
			}
			flusher.Flush()
		}
	}
}

// writeAuditFrame emits one SSE event frame in the wire format
// `event: audit_event\nid: N\ndata: {JSON}\n\n` (cursor goes in `id:`
// header per SSE spec so Last-Event-ID resume works native).
func writeAuditFrame(w http.ResponseWriter, f ws.AuditEventFrame) {
	// Inline JSON encode — 7 字段 byte-identical 跟 spec brief envelope.
	// strconv.Quote handles UUID strings safely (no JSON-special chars in
	// normal payload but defense-in-depth for action 6-tuple literals).
	payload := fmt.Sprintf(
		`{"type":%q,"cursor":%d,"action_id":%q,"actor_id":%q,"action":%q,"target_user_id":%q,"created_at":%d}`,
		f.Type, f.Cursor, f.ActionID, f.ActorID, f.Action, f.TargetUserID, f.CreatedAt,
	)
	fmt.Fprintf(w, "event: %s\nid: %d\ndata: %s\n\n", f.Type, f.Cursor, payload)
}
