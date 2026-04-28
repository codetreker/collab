// Package bpp — envelope.go: BPP-1 (#274/#280) source-of-truth for the
// 9 envelope frames defined in docs/blueprint/plugin-protocol.md §2.1
// (control plane, Borgee→Plugin) + §2.2 (data plane, Plugin→Borgee).
//
// Layout contract — BPP-1 envelope is byte-identical with RT-0 (#237)
// envelope on the discriminator + payload-first-field convention:
//
//   - Field 0 is `Type` tagged `json:"type"` — the wire dispatcher
//     matches on this exactly like RT-0 (`AgentInvitationPendingFrame`)
//     and RT-1.1 (`ArtifactUpdatedFrame`) do.
//   - Subsequent fields are payload, ordered by semantic weight (IDs
//     first, then timestamps / counters). No `version` field on the
//     frame itself — protocol version is negotiated on `connect` once.
//   - There is NO `timestamp` ordering field; the cursor (or, for
//     control-plane fan-out, the server's monotonic seq) IS the order.
//
// Direction lock — per §2.1 / §2.2 headings, every frame in this file
// has a hard direction lock enforced by FrameDirection() below + the
// reflection lint in frame_schemas_test.go. A drift is a CI red.
//
// Whitelist — only the 9 OpName constants enumerated in
// `bppEnvelopeWhitelist` are permitted. Adding a frame here without a
// matching blueprint row is a CI red (TestBPPEnvelopeFrameWhitelist).
//
// 反约束 — this file MUST NOT contain any `replay_mode = "full"`
// default, `defaultReplayMode` symbol, or `default.*ResumeModeFull`
// branch (RT-1.3 hardline carried forward). The reverse grep step in
// the bpp-envelope-lint workflow enforces 0 hits across this package
// (excluding _test.go).

package bpp

// Frame `type` discriminator strings on the BPP-1 wire. These are the
// only OpName constants the envelope lint accepts; the lint asserts
// each control-plane / data-plane registry below has exactly the
// expected length and that `bppEnvelopeWhitelist` covers them all.
const (
	// Control plane (Server → Plugin) — §2.1.
	FrameTypeBPPConnect                = "connect"
	FrameTypeBPPAgentRegister          = "agent_register"
	FrameTypeBPPRuntimeSchemaAdvertise = "runtime_schema_advertise"
	FrameTypeBPPAgentConfigUpdate      = "agent_config_update"
	FrameTypeBPPAgentToggle            = "agent_toggle" // disable/enable: one frame, action field
	FrameTypeBPPInboundMessage         = "inbound_message"

	// Data plane (Plugin → Server) — §2.2.
	FrameTypeBPPHeartbeat      = "heartbeat"
	FrameTypeBPPSemanticAction = "semantic_action"
	FrameTypeBPPErrorReport    = "error_report"
)

// Direction is the hard direction lock the lint enforces.
type Direction string

const (
	// DirectionServerToPlugin — every control-plane envelope.
	DirectionServerToPlugin Direction = "server_to_plugin"
	// DirectionPluginToServer — every data-plane envelope.
	DirectionPluginToServer Direction = "plugin_to_server"
)

// BPPEnvelope is the marker every BPP-1 envelope struct implements. The
// reflection lint walks all exported structs in this file and asserts
// each one returns a non-empty FrameType + a valid Direction.
type BPPEnvelope interface {
	FrameType() string
	FrameDirection() Direction
}

// ----- Control plane (Server → Plugin) — 6 envelopes -----

// ConnectFrame — handshake. Sent first when a plugin opens the BPP
// socket. Carries the auth token + the protocol version the plugin
// supports; server replies with its version on the same frame type
// (per §2.1, the row is one frame, the direction tag below pins the
// outbound side).
type ConnectFrame struct {
	Type         string `json:"type"`
	PluginID     string `json:"plugin_id"`
	Token        string `json:"token"`
	Version      string `json:"version"` // protocol version, e.g. "bpp-1"
	Capabilities string `json:"capabilities"`
}

func (ConnectFrame) FrameType() string         { return FrameTypeBPPConnect }
func (ConnectFrame) FrameDirection() Direction { return DirectionServerToPlugin }

// AgentRegisterFrame — multi-agent registration (§1.1). One plugin
// connection hosts N agents; this frame carries the list.
type AgentRegisterFrame struct {
	Type     string   `json:"type"`
	PluginID string   `json:"plugin_id"`
	AgentIDs []string `json:"agent_ids"`
}

func (AgentRegisterFrame) FrameType() string         { return FrameTypeBPPAgentRegister }
func (AgentRegisterFrame) FrameDirection() Direction { return DirectionServerToPlugin }

// RuntimeSchemaAdvertiseFrame — runtime declares its model list +
// opaque blob keys (§1.4 "Runtime 上报 model schema"). The server
// stores the schema verbatim; UI renders generic select widgets.
type RuntimeSchemaAdvertiseFrame struct {
	Type      string `json:"type"`
	PluginID  string `json:"plugin_id"`
	Models    string `json:"models"`    // JSON-encoded list; opaque to server
	BlobKeys  string `json:"blob_keys"` // JSON-encoded list of allowed keys
	SchemaVer int    `json:"schema_ver"`
}

func (RuntimeSchemaAdvertiseFrame) FrameType() string {
	return FrameTypeBPPRuntimeSchemaAdvertise
}
func (RuntimeSchemaAdvertiseFrame) FrameDirection() Direction { return DirectionServerToPlugin }

// AgentConfigUpdateFrame — server pushes a config delta (§1.5). Plugin
// MUST reload idempotently; same payload pushed twice is a no-op.
type AgentConfigUpdateFrame struct {
	Type      string `json:"type"`
	AgentID   string `json:"agent_id"`
	ConfigRev int64  `json:"config_rev"`
	Payload   string `json:"payload"` // JSON-encoded delta; opaque
}

func (AgentConfigUpdateFrame) FrameType() string         { return FrameTypeBPPAgentConfigUpdate }
func (AgentConfigUpdateFrame) FrameDirection() Direction { return DirectionServerToPlugin }

// AgentToggleFrame — pause / resume an agent's inbound (§2.1
// `agent_disable / enable` row). One frame; `Action` is "disable" or
// "enable".
type AgentToggleFrame struct {
	Type    string `json:"type"`
	AgentID string `json:"agent_id"`
	Action  string `json:"action"` // "disable" | "enable"
	Reason  string `json:"reason"`
}

func (AgentToggleFrame) FrameType() string         { return FrameTypeBPPAgentToggle }
func (AgentToggleFrame) FrameDirection() Direction { return DirectionServerToPlugin }

// InboundMessageFrame — server pushes a new channel message at the
// agent (§2.1 `inbound_message`).
type InboundMessageFrame struct {
	Type      string `json:"type"`
	AgentID   string `json:"agent_id"`
	ChannelID string `json:"channel_id"`
	MessageID string `json:"message_id"`
	AuthorID  string `json:"author_id"`
	Body      string `json:"body"`
	CreatedAt int64  `json:"created_at"` // Unix ms
}

func (InboundMessageFrame) FrameType() string         { return FrameTypeBPPInboundMessage }
func (InboundMessageFrame) FrameDirection() Direction { return DirectionServerToPlugin }

// ----- Data plane (Plugin → Server) — 3 envelopes -----

// HeartbeatFrame — plugin liveness + per-agent state (§1.6 + §2.2).
// `Status` is one of "online" / "working" / "offline" — matches the
// AL-1a three-state runtime registry (PR #249).
type HeartbeatFrame struct {
	Type      string `json:"type"`
	PluginID  string `json:"plugin_id"`
	AgentID   string `json:"agent_id"`
	Status    string `json:"status"`
	Reason    string `json:"reason"`    // empty when status==online; reason code per AL-1a
	Timestamp int64  `json:"timestamp"` // Unix ms (semantic only — server cursor IS the order)
}

func (HeartbeatFrame) FrameType() string         { return FrameTypeBPPHeartbeat }
func (HeartbeatFrame) FrameDirection() Direction { return DirectionPluginToServer }

// SemanticActionFrame — collaborative-intent action (§1.3). The
// `Action` field carries one of the v1 whitelisted verbs
// (create_artifact / update_artifact / reply_in_thread / mention_user /
// request_agent_join / read_channel_history / read_artifact). Server
// dispatches to the matching REST handler with permission checks.
type SemanticActionFrame struct {
	Type    string `json:"type"`
	AgentID string `json:"agent_id"`
	Action  string `json:"action"`
	Payload string `json:"payload"` // JSON-encoded action args; opaque on the wire
	Nonce   string `json:"nonce"`   // idempotency key
}

func (SemanticActionFrame) FrameType() string         { return FrameTypeBPPSemanticAction }
func (SemanticActionFrame) FrameDirection() Direction { return DirectionPluginToServer }

// ErrorReportFrame — plugin proactively reports an agent fault
// (§1.6 "故障 UX 区分"). `Kind` is "runtime_disconnected" or
// "agent_misconfigured" so the UI can route the user to the right
// remediation path.
type ErrorReportFrame struct {
	Type    string `json:"type"`
	AgentID string `json:"agent_id"`
	Kind    string `json:"kind"`
	Detail  string `json:"detail"`
}

func (ErrorReportFrame) FrameType() string         { return FrameTypeBPPErrorReport }
func (ErrorReportFrame) FrameDirection() Direction { return DirectionPluginToServer }

// bppEnvelopeWhitelist — single-source-of-truth list of permitted
// BPP-1 envelope OpNames. The reflection lint asserts every exported
// frame struct in this file maps to exactly one entry here and
// vice-versa (no orphans, no extras). Adding a row here without a
// matching blueprint §2 entry is a CI red.
var bppEnvelopeWhitelist = map[string]Direction{
	FrameTypeBPPConnect:                DirectionServerToPlugin,
	FrameTypeBPPAgentRegister:          DirectionServerToPlugin,
	FrameTypeBPPRuntimeSchemaAdvertise: DirectionServerToPlugin,
	FrameTypeBPPAgentConfigUpdate:      DirectionServerToPlugin,
	FrameTypeBPPAgentToggle:            DirectionServerToPlugin,
	FrameTypeBPPInboundMessage:         DirectionServerToPlugin,
	FrameTypeBPPHeartbeat:              DirectionPluginToServer,
	FrameTypeBPPSemanticAction:         DirectionPluginToServer,
	FrameTypeBPPErrorReport:            DirectionPluginToServer,
}

// BPPEnvelopeWhitelist exposes the registry to tests in other packages
// (and to future BPP-1 wire dispatcher impls). Returns a fresh copy so
// callers can't mutate the source-of-truth.
func BPPEnvelopeWhitelist() map[string]Direction {
	out := make(map[string]Direction, len(bppEnvelopeWhitelist))
	for k, v := range bppEnvelopeWhitelist {
		out[k] = v
	}
	return out
}

// AllBPPEnvelopes returns one zero-valued instance of each registered
// envelope, in stable order. Used by the lint to drive reflection
// without needing build-time tag scanning.
func AllBPPEnvelopes() []BPPEnvelope {
	return []BPPEnvelope{
		ConnectFrame{},
		AgentRegisterFrame{},
		RuntimeSchemaAdvertiseFrame{},
		AgentConfigUpdateFrame{},
		AgentToggleFrame{},
		InboundMessageFrame{},
		HeartbeatFrame{},
		SemanticActionFrame{},
		ErrorReportFrame{},
	}
}
