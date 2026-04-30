# RT-3 ⭐ stance checklist — multi-device fanout + 活物感 + thinking subject 反约束

> 3 立场 byte-identical 跟 spec §0 (≤80 行).

## 1. 多端 fanout 单源 hub.onlineUsers (蓝图 §1.4 + ws/hub.go::BroadcastToUser)

- [x] `Hub.PushAgentTaskStateChanged` 走 `BroadcastToChannel(channelID, frame, nil)` — channel member subscription 自动 multi-device fanout (one user N concurrent ws sessions all receive)
- [x] cursor 从 `hub.cursors.NextCursor()` 单源发号 — RT-3 是第 6 个 frame 共一根 sequence (RT-1.1 + CV-2.2 + DM-2.2 + CV-4.2 + AL-2b + RT-3 = 6 处)
- [x] 反约束: 不另起 `agent_task_pushed` namespace, 不按 device-id 路由 (user-id 单源)
- [x] **反向 grep 锚** (CI 守门): `device.*route|device_id.*push|device_session.*broadcast` 在 `internal/ws` 0 hit
- [x] 跟 P1MultiDeviceWebSocket #197 同 pattern 验证

## 2. 活物感 / thinking subject 必带非空 (蓝图 §1.1 ⭐ 关键纪律)

- [x] `TaskLifecycleHandler.HandleStarted` 走 `bpp.ValidateTaskStarted` SSOT (BPP-2.2 #485 task_lifecycle.go::errSubjectEmpty 同源)
- [x] 派生路径 fail-closed: empty subject → `errSubjectEmpty` reject + **不 push 任何 fallback 字面** (TestRT3_HandleStarted_EmptySubjectRejected `pusher.calls == 0` 锁)
- [x] busy 态 subject 必带非空字面透传 plugin 上行 source (TestRT3_HandleStarted_HappyPath_BusyFanout 字面对比)
- [x] idle 态 subject 必空 (反字段污染, TestRT3_HandleFinished_Completed_IdleFanout)
- [x] **反向 grep 5-pattern** (CI 守门): `subject\s*=\s*""|defaultSubject|fallbackSubject|"thinking"|"AI is thinking"` 在 `internal/ws/agent_task_state_changed_frame.go` + `internal/bpp/task_lifecycle_handler.go` 排除 _test.go 0 hit
- [x] thinking 5-pattern 锁链 RT-3 = 第 11 处 (源头, server 派生侧首次落地). 跟 BPP-2.2 + AL-1b + CV-5..14 + DM-9 锁链承袭

## 3. cross-device push 拆死 (online → ws / offline → DL-4 fallback)

- [x] online recipient 走 ws 即时 push (Hub.PushAgentTaskStateChanged 多端 fanout)
- [x] offline recipient → DL-4 Web Push fallback (gateway 由 zhanma-b 实施, DL-4 #490 已 merge 6/7)
- [x] **本 PR 范围**: RT-3.1 frame schema (已落) + RT-3.2 server 派生 hook (本 PR) — RT-3.3 client UI + RT-3.4 DL-4 fallback + RT-3.5 e2e 留 follow-up (按 spec §1+§6 deferred)
- [x] task_finished outcome 3-enum {completed, failed, cancelled} fail-closed (反 partial / paused / pending / starting 中间态, ValidateTaskFinished SSOT)
- [x] task_finished + outcome=failed reason ∈ AL-1a 6-dict 字面 byte-identical (api_key_invalid / quota_exceeded / network_unreachable / runtime_crashed / runtime_timeout / unknown), completed/cancelled reason 必空 (字典污染防御)

## 反约束 (跨 milestone byte-identical)

- ❌ device-only push channel (反向 grep 守门)
- ❌ admin god-mode 下发 (反向 grep `admin.*PushAgentTaskStateChanged` 0 hit, ADM-0 §1.3 红线)
- ❌ schema/migration 改 (RT-3 是 0 schema, 跟 RT-4 / DM-9 同精神)
- ❌ thinking fallback 字面 (5-pattern 反向 grep CI 守门)
- ❌ 中间态 partial / paused / pending / starting (反 BPP-2.2 outcome 3-enum)
- ❌ idle + reason 完成态污染 (反 ValidateTaskFinished 字典污染防御)

## 跨 milestone byte-identical 锁链

- BPP-2.2 #485 task_lifecycle.go ValidateTaskStarted/Finished SSOT — RT-3 是 first consumer
- BPP-3 #489 PluginFrameDispatcher boundary — RT-3 register Started/Finished adapters
- AL-1a #249 6-dict reason — RT-3 透传 (ValidateTaskFinished 守)
- RT-1.1 #290 hub.cursors.NextCursor 共序 — RT-3 第 6 个 frame
- P1MultiDeviceWebSocket #197 fanout — RT-3 model 验证
- thinking 5-pattern 锁链 RT-3 = 第 11 处 (源头落地)
- ADM-0 §1.3 红线 (admin god-mode 不挂)
- DL-4 #490 Web Push gateway — RT-3.4 follow-up 接

## ⭐ RT-3 yema G4.x signoff demo 5 张截屏 (deferred 留 follow-up PR)

按 yema notes (§4) — 多端 fan-out / subject 字面渲染 / busy→idle 切换 / subject 反约束 reject / cross-device offline → DL-4. **本 PR 仅 server-side**; client + e2e + 截屏挂 RT-3.3+.5 follow-up.
