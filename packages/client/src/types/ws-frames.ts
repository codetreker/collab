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

// ─── CV-1.2 ArtifactUpdated frame (RT-1.1 #290 envelope) ────
//
// Spec: docs/implementation/modules/cv-1-spec.md §1 + cv-1.md §2.5.
// 锁: server 端 internal/ws/cursor.go::ArtifactUpdatedFrame — 7 字段顺序
// byte-identical:
//   {type, cursor, artifact_id, version, channel_id, updated_at, kind}
// Push 仅信号 (立场 ⑤): 不带 body, 不带 committer; client 收到后必须
// 拉 GET /api/v1/artifacts/:id 才能渲染. `kind` 取 'commit' / 'rollback'.

/**
 * `artifact_updated` — server → client push fired after a successful
 * commit or rollback in CV-1.2. Reuses RT-1.1 cursor envelope so the
 * existing reconnect-backfill path covers it for free (RT-1.2 #292).
 */
export interface ArtifactUpdatedFrame {
  type: 'artifact_updated';
  /** RT-1.1 monotonic server cursor; client must NOT sort by updated_at. */
  cursor: number;
  artifact_id: string;
  version: number;
  channel_id: string;
  /** Unix ms — 仅展示, 不可作排序键 (反约束: server cursor 唯一可信序). */
  updated_at: number;
  kind: 'commit' | 'rollback';
}

export const ARTIFACT_UPDATED_EVENT = 'borgee:artifact-updated';
export type ArtifactUpdatedEvent = CustomEvent<ArtifactUpdatedFrame>;

// ─── DM-2.2 MentionPushed frame (#372 envelope) ─────────────
//
// Spec: docs/implementation/modules/dm-2.3-spec.md §0 立场 ②③ + 飞马
// #362 8-field envelope.
// 锁: server 端 internal/ws/mention_pushed_frame.go::MentionPushedFrame
// — 8 字段顺序 byte-identical:
//   {type, cursor, message_id, channel_id, sender_id,
//    mention_target_id, body_preview, created_at}
// body_preview is rune-truncated to 80 chars server-side
// (TruncateBodyPreview); client must NOT re-parse it (反约束: 显示
// 即真值, 隐私 §13 红线).

/**
 * `mention_pushed` — server → client push fired when a message body
 * `@<target_user_id>` token resolves to an online target. Target-only
 * BroadcastToUser (反约束: 不抄送 owner; offline owner-fallback uses
 * a system DM, not this envelope). MessageList listens via
 * useMentionPushed → actions.loadMessages 触发重渲.
 */
export interface MentionPushedFrame {
  type: 'mention_pushed';
  /** RT-1.1 monotonic server cursor; client must NOT sort by created_at. */
  cursor: number;
  message_id: string;
  channel_id: string;
  sender_id: string;
  mention_target_id: string;
  /** Server-truncated to 80 runes (UTF-8 rune-safe). 立场 ②: 不重解析. */
  body_preview: string;
  /** Unix ms — 仅展示, 不可作排序键 (反约束: server cursor 唯一可信序). */
  created_at: number;
}

export const MENTION_PUSHED_EVENT = 'borgee:mention-pushed';
export type MentionPushedEvent = CustomEvent<MentionPushedFrame>;

// ─── CV-2.2 AnchorCommentAdded frame (#360 envelope) ────────
//
// Spec: docs/implementation/modules/cv-2-spec.md §0 立场 ③ + 飞马 v3 字段锁.
// Server lock: packages/server-go/internal/ws/anchor_comment_frame.go
//   AnchorCommentAddedFrame — 10 字段 byte-identical:
//   {type, cursor, anchor_id, comment_id, artifact_id,
//    artifact_version_id, channel_id, author_id, author_kind, created_at}
// 注: 第 9 字段 `author_kind` (不是 `kind` / `committer_kind`) — anchor
// 是评论作者非 commit 提交者; 第 6 字段 `artifact_version_id` 是 schema
// FK PK 非用户号 `version` (立场 ② 钉死 PK row immutable).
//
// Push 仅信号 (立场 ⑤ 同模式): 不带 body, client 收到后必须拉
// GET /api/v1/artifacts/:id/anchors 才能拿评论列表.

/**
 * `anchor_comment_added` — server → client push fired after a comment
 * lands on an active anchor thread (CV-2.2 #360). Reuses RT-1.1 cursor
 * envelope so reconnect-backfill (RT-1.2) covers it for free.
 */
export interface AnchorCommentAddedFrame {
  type: 'anchor_comment_added';
  /** RT-1.1 monotonic server cursor; client must NOT sort by created_at. */
  cursor: number;
  anchor_id: string;
  comment_id: number;
  artifact_id: string;
  /** Schema FK PK (artifact_versions.id) — not the user-facing `version` int. */
  artifact_version_id: number;
  channel_id: string;
  author_id: string;
  /** 'human' | 'agent' — naming aligned with anchor_comments.author_kind column. */
  author_kind: 'human' | 'agent';
  /** Unix ms — 仅展示, 不可作排序键 (反约束: server cursor 唯一可信序). */
  created_at: number;
}

export const ANCHOR_COMMENT_ADDED_EVENT = 'borgee:anchor-comment-added';
export type AnchorCommentAddedEvent = CustomEvent<AnchorCommentAddedFrame>;
