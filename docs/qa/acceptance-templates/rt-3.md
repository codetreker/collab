# Acceptance Template — RT-3 ⭐: multi-device fanout + thinking subject 反约束 ✅

> RT-3 ⭐ Phase 4 退出闸阻塞项 — server派生 hook 落地 (RT-3.1 frame schema 已在 main, RT-3.2 hook 本 PR). **0 schema 改 + 0 新错码** (复用 BPP-2.2 ValidateTask* SSOT). RT-3.3 client UI + RT-3.4 DL-4 fallback + RT-3.5 e2e + 5 张截屏 demo 留 follow-up (按 spec §1+§6 deferred). content-lock 不需 server-only hook.

## 验收清单

### §1 RT-3.2 — server派生 hook (本 PR 范围)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 1.1 TaskLifecycleHandler.HandleStarted: empty subject → errSubjectEmpty + pusher 0 calls (立场 ② fail-closed) | unit | `TestRT3_HandleStarted_EmptySubjectRejected` PASS |
| 1.2 HandleStarted happy: state='busy' + subject 透传 + reason="" | unit | `TestRT3_HandleStarted_HappyPath_BusyFanout` 字面对比 PASS |
| 1.3 HandleFinished completed: state='idle' subject="" reason="" | unit | `TestRT3_HandleFinished_Completed_IdleFanout` PASS |
| 1.4 HandleFinished failed + AL-1a reason: state='idle' reason 透传 | unit | `TestRT3_HandleFinished_Failed_ReasonTransparent` PASS |
| 1.5 HandleFinished invalid outcome (partial): errOutcomeUnknown + 0 calls | unit | `TestRT3_HandleFinished_InvalidOutcome_Rejected` PASS |
| 1.6 HandleFinished completed + reason 字典污染 reject + 0 calls | unit | `TestRT3_HandleFinished_CompletedWithReason_RejectedDictPollution` PASS |
| 1.7 StartedAdapter raw JSON decode + dispatch chain | unit | `TestRT3_StartedAdapter_RawDecode_Dispatch` + `_FinishedAdapter_RawDecode_Dispatch` PASS |
| 1.8 BadJSON decode err + Nil pusher panic | unit | `TestRT3_StartedAdapter_BadJSON_DecodeErr` + `_NilPusherPanics` PASS |
| 1.9 sentinel chain preservation (errors.Is + IsTaskSubjectEmpty) | unit | `TestRT3_StartedAdapter_EmptySubject_PreservesSentinelChain` PASS |
| 1.10 server.go register pfd.Register 真挂 (boot wire) | inspect | server.go 加 hubAgentTaskPusherAdapter + 2 register lines |

### §2 RT-3.1 — 既有 frame schema (已在 main, regression 锁不破)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 2.1 AgentTaskStateChangedFrame 7 字段 byte-identical (FieldOrder 锁) | unit | `TestRT3_AgentTaskStateChangedFrame_FieldOrder` 全 PASS |
| 2.2 reflection 7Fields 锁 | unit | `TestRT3_AgentTaskStateChangedFrame_7Fields` PASS |
| 2.3 state 2-enum {busy, idle} | unit | `TestRT3_AgentTaskStateEnum` PASS |
| 2.4 nil cursors 测试 seam | unit | `TestRT3_PushAgentTaskStateChanged_NoCursorAllocator` PASS |
| 2.5 反向 grep 5-pattern 0 hit (ws/agent_task_state_changed_frame.go) | unit | `TestRT3_ReverseGrep_NoSubjectFallback` PASS |
| 2.6 SharedSequence 共序锁跨 RT-1 + CV-2 + DM-2 + CV-4 + AL-2b | unit | `TestRT3_SharedSequence_WithRT1_CV2_DM2_CV4_AL2b` PASS |

### §3 RT-3.3 — closure

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 3.1 server-go ./... 全 25 packages 全绿 (+sqlite_fts5 tag) | go test | 全绿 |
| 3.2 反向 grep 5-pattern 在 task_lifecycle_handler.go 排除 _test.go 0 hit (锁链 RT-3 = 第 11 处) | grep | 0 hit |
| 3.3 反向 grep `admin.*PushAgentTaskStateChanged` 0 hit (ADM-0 §1.3) | grep | 0 hit |
| 3.4 REG-RT3-001..006 6 行 🟢 | regression-registry.md | 6 行 |
| 3.5 PROGRESS [x] 加行 | PROGRESS.md | changelog 加行 |
| 3.6 acceptance template ✅ closed | 本文件 | 关闭区块加日期 |

### §4 RT-3.3+ — deferred (留 follow-up PR)

- RT-3.3 client UI (wsClient.ts switch case + AgentActivityDot.tsx)
- RT-3.4 DL-4 Web Push fallback (offline recipient)
- RT-3.5 e2e (5 case multi-device / subject 字面 / reject)
- ⭐ yema G4.x signoff 5 张截屏 demo (multi-device / subject / busy-idle / reject / offline-fallback)

## 边界

- BPP-2.2 #485 task_lifecycle.go ValidateTask* SSOT (RT-3 first consumer) / BPP-3 #489 PluginFrameDispatcher boundary / AL-1a #249 6-dict reason / RT-1.1 #290 hub.cursors.NextCursor 共序 / P1MultiDeviceWebSocket #197 fanout 模式 / DL-4 #490 Web Push gateway (RT-3.4 接) / thinking 5-pattern 锁链 RT-3 = 第 11 处 / ADM-0 §1.3 admin god-mode 红线

## 退出条件

- §1+§2+§3 全绿
- 0 schema 改 + 0 新错码
- 11 RT-3.2 unit + 6 RT-3.1 既有 unit 全 PASS
- 反向 grep 5-pattern + admin god-mode 0 hit
- REG-RT3-001..006 6 行

## 关闭

✅ 2026-04-30 战马E (RT-3.2 server派生 hook) — TaskLifecycleHandler 走 BPP-2.2 ValidateTask* SSOT + AgentTaskPusher 接口 seam (HubAgentTaskPusherAdapter 跨 bpp↛ws 包边界胶水) + server.go 真 register pfd 2 frame; 11 unit PASS + server-go ./... 全 25 packages 全绿 (+sqlite_fts5 tag); thinking 5-pattern 锁链 RT-3 = 第 11 处 (源头, server 派生侧首次落地). RT-3.3 client + RT-3.4 DL-4 fallback + RT-3.5 e2e + 5 截屏 demo 留 follow-up PR.
