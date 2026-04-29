# RT-3 ⭐ spec brief — multi-device fanout + 活物感 + thinking subject 反约束

> 战马E · Phase 4 · ≤200 行 spec · 蓝图 [`realtime.md`](../../blueprint/realtime.md) §0 字面 "v1 realtime 只做'足够让用户感到 AI 在工作'的最小集" + §1.1 ⭐ 关键纪律 (thinking 必须带 subject) + §1.4 (activity dot 四态).

## 0. 立场 (3 条, 蓝图字面)

1. **多端 fanout 单源 hub.onlineUsers** (蓝图 §1.4 + ws/hub.go::BroadcastToUser): 一 user 多 ws session 全收 push, 走 `hub.onlineUsers[userID] map[*Client]bool` 数据结构 (P1MultiDeviceWebSocket #197 已验证). **反约束**: 不另起 device-only 通道; 不按 device-id 路由 (user-id 是单源).
2. **活物感 / thinking subject 必带非空** (蓝图 §1.1 ⭐ 关键纪律): server 派生的 `AgentTaskStateChangedFrame` busy 态 `subject` 字段必带非空字面. **反向 grep 守门**: `subject\s*=\s*""|defaultSubject|fallbackSubject|"thinking"|"AI is thinking"` 在 `internal/ws/` 排除 _test.go count==0. 字面承袭 BPP-2.2 task_lifecycle.go ValidateTaskStarted 同源 (改 = 改 server 派生 + plugin 上行 + client UI 三处).
3. **cross-device push: online → ws / offline → DL-4 Web Push** (蓝图 §1.3 离线回放 — 人/agent 拆分): online recipient 走 ws 即时 push; offline recipient 走 DL-4 Web Push gateway (gateway 由 zhanma-b 实施). **本 PR 仅做 (1)+(2), DL-4 merge 后接 (3)**.

## 1. 拆段实施 (单 PR 全闭)

| 段 | 文件 | 范围 |
|---|---|---|
| RT-3.1 frame schema | `internal/ws/agent_task_state_changed_frame.go` (新) | `AgentTaskStateChangedFrame` 7 字段 byte-identical {type, cursor, agent_id, state, subject, reason, changed_at} + state 2-enum {busy, idle} + `Hub.PushAgentTaskStateChanged()` BroadcastToChannel 多端 fanout |
| RT-3.1 tests | `internal/ws/agent_task_state_changed_frame_test.go` (新) | 6 test: FieldOrder / 7Fields reflect lock / EnumValues / NoCursorAllocator seam / **ReverseGrep_NoSubjectFallback** (反向 grep 5 pattern) / SharedSequence_WithRT1_CV2_DM2_CV4_AL2b (共序锁) |
| RT-3.1 multi-device | `internal/ws/rt_3_multi_device_test.go` (新) | live multi-device fanout test 跟 P1MultiDeviceWebSocket #197 同 pattern |
| RT-3.2 server派生 hook | `internal/api/al_1b_2_status.go` (改, 待 BPP-2.2 plugin 上行 task_started/finished 真实施落地后接) | 收到 BPP-2.2 上行 frame → 调 `hub.PushAgentTaskStateChanged(agent_id, channel_id, state, subject, reason, changed_at)` |
| RT-3.3 client UI | `packages/client/src/realtime/wsClient.ts` + `components/ChannelView/AgentActivityDot.tsx` (改) | switch case `agent_task_state_changed` → 渲染 thinking 动画 (subject 非空 字面渲染); idle → spinner 消失 |
| RT-3.4 DL-4 fallback | `internal/api/al_1b_2_status.go` (改, 待 DL-4 #?? merged 后接) | offline recipient → 调 DL-4 Web Push gateway emit |
| RT-3.5 e2e + closure | `packages/e2e/tests/rt-3.spec.ts` (新) + REG-RT3-* + acceptance + PROGRESS [x] | 5 cases: 多端 fanout / busy subject 渲染 / 中间态 reject / SharedSequence drift detect / cross-device offline → DL-4 |

## 2. 错误码 byte-identical (跟 BPP-2.2 / AL-2b 命名同模式)

- `rt.subject_required` — busy 态空 subject reject (server 派生路径 fail-closed, validator 守门)
- `rt.state_unknown` — state 2-enum 外 reject

## 3. 反约束 (反向 grep CI lint count==0)

- `internal/ws/agent_task_state_changed_frame.go` 不含 fallback subject 字面 (5 pattern, 见上 §0 立场 ②)
- 不另起 `agent_task_pushed` namespace (复用 BPP-1 envelope cursor 共序)
- 不按 device-id 路由 (user-id 单源, hub.onlineUsers 数据结构闸位)
- admin god-mode 不下发 (反向 grep `admin.*PushAgentTaskStateChanged` count==0)

## 4. 不在本轮范围 (deferred)

- ❌ multi-agent 编排可视化 (蓝图 §1.1 v2)
- ❌ agent 头像独立动画 (蓝图 §1.1 v2)
- ❌ DL-4 Web Push fallback (等 zhanma-b DL-4 merge)
