# server-go — ws/event_schemas.go (RT-0 push frame schema)

> RT-0 (#237 server, #218 client) · 蓝图 `realtime.md §2.3` · CI lint ↔ `bpp/frame_schemas.go` (Phase 4) byte-identical

## 1. 适用范围

`internal/ws/event_schemas.go` 是 server → client push frame 的 **source of truth**. Phase 2 走 `/ws` hub, Phase 4 BPP cutover 时 `bpp/frame_schemas.go` 跟此 file 字节相同, 客户端 handler 0 改.

字段顺序是契约的一部分. TS 镜像在 `packages/client/src/types/ws-frames.ts` (#218); JSON tag 必须 = TS field name. 加字段 = 两端同 PR 加, 否则 CI 红.

## 2. Frame 清单

| Frame | type 字符串 | 字段顺序 | 触发点 |
|-------|------------|---------|--------|
| `AgentInvitationPendingFrame` | `agent_invitation_pending` | invitation_id, requester_user_id, agent_id, channel_id, created_at, expires_at | `POST /api/v1/agent_invitations` 写库后, 推 owner 单端 |
| `AgentInvitationDecidedFrame` | `agent_invitation_decided` | invitation_id, state, decided_at | `PATCH /api/v1/agent_invitations/{id}` 双推 (requester + owner) |

`expires_at = 0` 是 sentinel (client TS `required: number`); `TestAgentInvitationPendingFrame_ZeroExpiresIsSentinel` 锁 wire parity.

## 3. Hub 推送入口

| Method | 用途 |
|--------|------|
| `Hub.PushAgentInvitationPending(ownerUserID string, frame *AgentInvitationPendingFrame)` | 单推 owner |
| `Hub.PushAgentInvitationDecided(userIDs []string, frame *AgentInvitationDecidedFrame)` | 多推, POST 路径双推方向断言 `got.UserID != frame.RequesterUserID` |

## 4. 不在范围

- 不带 ack/retry — RT-0 走 best-effort, 客户端断线靠 cursor replay (events 表) 兜底.
- BPP frame 完整集 (Phase 4) 跟此 file 同步加, 不在 Phase 2 范围.
