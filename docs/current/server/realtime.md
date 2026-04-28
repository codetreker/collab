# server-go — realtime push 路径

> RT-0 (#40) · Phase 2 临时载体 `/ws` hub · Phase 4 BPP cutover 不动 schema

## 1. 适用范围

CM-4 流程 B 邀请回路的 push 通知:

- `agent_invitation_pending` — owner 端: 有人想拉你的 agent 进 channel
- `agent_invitation_decided` — 跨 client 同步 (owner 在另一端 approve/reject, 或 server 标 expired)

替代 60s 轮询; 落 ≤ 3s 端到端 latency (G2.4 hardline).

## 2. 服务端 API

文件:

| 文件 | 角色 |
|------|------|
| `internal/ws/event_schemas.go` | typed frame structs + discriminator 常量 (source of truth) |
| `internal/ws/hub.go` | `Hub.PushAgentInvitationPending(userID, *Frame)` / `Hub.PushAgentInvitationDecided(userID, *Frame)` |
| `internal/api/agent_invitations.go` | `AgentInvitationPusher` interface + handler 调用点 (POST + PATCH) |
| `internal/server/server.go` | `agentInvitationHandler.Hub = s.hub` 装配 |

行为:

- `userID == ""` 或 `frame == nil` → 静默 no-op (handler 一侧也 nil-guard, Hub 一侧二次 nil-guard).
- `userID` 没有 live session → 静默 drop. Persisted invitation 行是 source of truth, 客户端 reconnect / bell-poll fallback 自我对齐.
- 每次 push 后 `Hub.SignalNewEvents()` 唤醒 `/events` long-poll waiter, 与 `BroadcastEventTo*` 行为一致.

## 3. handler 触发点

POST `/api/v1/agent_invitations` 创建后, push pending → `agent.OwnerID`.

PATCH `/api/v1/agent_invitations/{id}` (approve/reject) 落库后, push decided → 双方 (`inv.RequestedBy` + `agent.OwnerID`); 多设备并发 (realtime.md §1.4 A 全推默认).

## 4. schema 锁

字段顺序 + JSON tag 必须与 `packages/client/src/types/ws-frames.ts` (PR #218) 字面对齐:

```
pending : type, invitation_id, requester_user_id, agent_id, channel_id, created_at, expires_at
decided : type, invitation_id, state, decided_at
```

`expires_at` 客户端类型为 `number` (required), 服务器无 row-level expiry 时也必须 emit (sentinel `0`, 非 `omitempty`).

`internal/ws/push_agent_invitation_test.go::TestAgentInvitationPendingFrame_WireSchema` 是 schema 红线: 加/删字段不在两边同 PR 同步会 CI red.

## 5. Phase 4 BPP cutover

调用方 (`agent_invitations.go` handler) 不动. `Hub.PushAgentInvitation*` 实现内部把 `BroadcastToUser` 换成 `bpp.SendFrame` 即可. struct 字段顺序锁让 `bpp/frame_schemas.go` 与 `ws/event_schemas.go` 可 type-alias 共用 (G2.6 CI lint 兜底).
