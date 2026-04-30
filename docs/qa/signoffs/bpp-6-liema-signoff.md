# BPP-6 plugin cold-start handshake + state re-derive — 烈马 (QA acceptance) signoff

> **状态**: ✅ **SIGNED** (烈马 acceptance 代签, 2026-04-30, post-#522 merged)
> **范围**: BPP-6 — ColdStartHandshakeFrame 5 字段 + envelope 14→15 + handler 走 AL-1 single-gate AppendAgentStateTransition + 字段集与 ReconnectHandshakeFrame 互斥
> **关联**: REG-BPP6-001..006 6🟢; AL-1a 锁链第 11 处; BPP-1 #304 reflect lint 自动覆盖; BPP-3/4/5 ACL 同模式 + AL-1 #492 single-gate

## 1. 验收清单 (5 项)

| # | 验收项 | 结果 | 实施证据 |
|---|---|---|---|
| ① | ColdStartHandshakeFrame 5 字段 byte-identical 顺序锁 (`type/plugin_id/agent_id/restart_at/restart_reason`) + direction lock plugin→server + envelope whitelist 14→15 reflect 自动覆盖 + data 7→8 | ✅ | REG-BPP6-001 + 002 (FieldOrder + DirectionLock + frame_schemas_test count==15) |
| ② | 字段集与 ReconnectHandshakeFrame 互斥 (cold-start 不含 LastKnownCursor/DisconnectAt/ReconnectAt; spec §0.1 立场守门, 反向 grep `cold_start.*last_known_cursor\|cold_start.*resume\|cold_start.*cursor` count==0) | ✅ | REG-BPP6-003 (FrameSet_NoReconnectFields 反射 + 反向 grep 0 hit) |
| ③ | handler 调 agent.Tracker.Clear + AL-1 #492 single-gate AppendAgentStateTransition(from→online, runtime_crashed) — 3 valid edges (initial/error/offline → online); reason 复用 6-dict 不扩第 7 (AL-1a 锁链第 11 处) | ✅ | REG-BPP6-004 (TransitionsToOnline_FromInitial + FromError + FromOffline 3 sub-case) |
| ④ | cross-owner reject (跟 BPP-3/4/5 ACL 同模式) + handler 不调 ResolveResume / SessionResumeRequest (AST scan 反向 BPP-5; spec §0.2 不重放历史) + 3 deps NilSafe panic | ✅ | REG-BPP6-005 (CrossOwnerReject + DoesNotInvokeResolveResume AST + sentinel errColdStartCrossOwnerReject + NilSafeCtor) |
| ⑤ | restart 计数走 state-log COUNT(WHERE to_state='online' AND reason='runtime_crashed') 反向 derive — 不另开 plugin_restart_count 列 + AST scan cold-start-queue 锁链延伸 BPP-4+BPP-5 第 3 处 (6 forbidden tokens 0 hit) | ✅ | REG-BPP6-006 (RestartCount_DerivedFromStateLog 3→COUNT==3 + NoColdStartQueueInBPPPackage AST ident scan 6 forbidden tokens) |

## 2. 反向断言

- ColdStart vs Reconnect 字段集互斥 — 反向 grep 3 forbidden literal 0 hit (cold_start 不带 cursor/resume 字段)
- AST scan cold-start-queue 6 forbidden tokens 0 hit (pendingColdStart/coldStartQueue/deadLetterColdStart/plugin_restart_count/coldStartCount/restartCounter) — 跟 BPP-4 retry-queue + BPP-5 dead-letter 锁链延伸第 3 处
- restart 计数走 derive (反向 derive from state-log) — 不另开列, forward-only audit 立场承袭
- AL-1 single-gate AppendAgentStateTransition 唯一 entry (跟 ActionHandler/Pusher/HasCapability/PermissionDeniedPusher 同精神依赖反转)

## 3. 留账

⏸️ cross-plugin restart takeover (v2 不做); ⏸️ SDK backoff (BPP-7 范围); ⏸️ restart rate limit (v2); ⏸️ G4.audit 飞马软 gate

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-30 | 烈马 | v0 — BPP-6 acceptance ✅ SIGNED post-#522 merged. 5/5 验收 covers REG-BPP6-001..006. 跨 milestone byte-identical: BPP-1 envelope reflect lint (whitelist 14→15) + BPP-3 #489 PluginFrameDispatcher (handler 复用) + BPP-5 #503 反向帧 (字段集互斥) + AL-1 #492 single-gate (any→online valid edge) + REFACTOR-REASONS #496 6-dict (锁链第 11 处) + AST 锁链延伸第 3 处 + ADM-0 §1.3 红线. |
