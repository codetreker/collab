// ws-frames.ts — RT-0 (#40) client-side TypeScript interfaces for the
// agent invitation push frames defined in docs/blueprint/realtime.md §2.3.
//
// Phase 2 路线: server pushes these via the existing /ws hub; Phase 4 BPP
// will swap the wire layer without changing the schema. The CI lint
// (frame_schemas.go vs ws/event_schemas.go byte-identical) is the hard
// guarantee — these TS interfaces mirror that lock so client handler
// stays 0-改 across the swap.
//
// 字段顺序保留 (跟 server Go struct 字面对得上):
//   pending : invitation_id, requester_user_id, agent_id, channel_id,
//             created_at, expires_at
//   decided : invitation_id, state, decided_at
//
// Out of scope here: server-side push impl, BPP frame envelope. The
// dispatcher consumes these via useWebSocket's existing `data.type`
// switch — see hooks/useWsHubFrames.ts for the listener side.

/**
 * `agent_invitation_pending` — owner 端收到的"有人想拉你的 agent 进
 * channel"通知。Replaces the 60s polling on the bell badge per 野马
 * G2.4 hardline (latency ≤ 3s).
 */
export interface AgentInvitationPendingFrame {
  type: 'agent_invitation_pending';
  invitation_id: string;
  requester_user_id: string;
  agent_id: string;
  channel_id: string;
  /** Unix ms. */
  created_at: number;
  /** Unix ms. */
  expires_at: number;
}

/**
 * `agent_invitation_decided` — 跨 client 同步邀请状态变更 (owner 在
 * 另一端点了同意/拒绝, 或 server 因过期标记 expired)。
 */
export interface AgentInvitationDecidedFrame {
  type: 'agent_invitation_decided';
  invitation_id: string;
  state: 'approved' | 'rejected' | 'expired';
  /** Unix ms. */
  decided_at: number;
}

/** Union of all RT-0 invitation frames. */
export type AgentInvitationFrame =
  | AgentInvitationPendingFrame
  | AgentInvitationDecidedFrame;

/**
 * Window-level CustomEvent names fired by useWsHubFrames after a frame
 * lands. Components (Sidebar bell, InvitationsInbox) listen for these
 * to drop their poll loops.
 *
 * Naming follows the existing `commands_updated` precedent in
 * useWebSocket — namespace prefix `borgee:` to avoid clash with native
 * browser events.
 */
export const INVITATION_PENDING_EVENT = 'borgee:invitation-pending';
export const INVITATION_DECIDED_EVENT = 'borgee:invitation-decided';

/** Strongly-typed CustomEvent payload helpers. */
export type InvitationPendingEvent = CustomEvent<AgentInvitationPendingFrame>;
export type InvitationDecidedEvent = CustomEvent<AgentInvitationDecidedFrame>;
