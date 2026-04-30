# BPP-8 plugin lifecycle audit log (复用 admin_actions, 0 新表) — 烈马 (QA acceptance) signoff

> **状态**: ✅ **SIGNED** (烈马 acceptance 代签, 2026-04-30, post-#532 merged)
> **范围**: BPP-8 — admin_actions CHECK enum 加 5 plugin_* + LifecycleAuditor interface + GET /api/v1/agents/{agentId}/lifecycle owner-only
> **关联**: REG-BPP8-001..006 6🟢; AL-1a 锁链第 13 处; audit forward-only 锁链第 5 处 (跟 ADM-2.1 + AP-2 + BPP-4 + BPP-7 跨五 milestone 同精神)

## 1. 验收清单 (5 项)

| # | 验收项 | 结果 | 实施证据 |
|---|---|---|---|
| ① | schema migration v=31 admin_actions CHECK 12-step rebuild 6 → 11 项加 5 条 plugin_* 字面 (`plugin_connect/disconnect/reconnect/cold_start/heartbeat_timeout`) + sequencing 跟 AP-2.1 v=30 顺位 | ✅ | REG-BPP8-001 (TestBPP81_AcceptsAllNewActions 6 legacy + 5 new + RejectsUnknownAction 5 反约束 + VersionIs31 + Idempotent) |
| ② | 不裂表反断 — 反向 grep `plugin_lifecycle_events\|plugin_audit_log\|bpp_event_log` 在 internal/ + sqlite_master 0 hit (复用 admin_actions 跟 ADM-2.1 + AP-2 + BPP-4 + BPP-7 跨 5 milestone audit forward-only 同精神, 锁链第 5 处) | ✅ | REG-BPP8-002 (NoSeparateLifecycleTable sqlite_master 反向 3 forbidden table 0 hit) |
| ③ | LifecycleAuditor interface + AdminActionsLifecycleAuditor 5 method (RecordConnect/Disconnect/Reconnect/ColdStart/HeartbeatTimeout) + reason 复用 reasons.NetworkUnreachable/RuntimeCrashed byte-identical 跟 BPP-6/BPP-7 同源 (AL-1a 锁链第 13 处) | ✅ | REG-BPP8-003 (5 method + reason 复用 byte-identical 跟 #522 + #529 同源) |
| ④ | single-gate (反向 grep plugin_* action literals 在 lifecycle_audit.go 外 0 hit) + nil-safe ctor + best-effort fire-and-forget (InsertAdminAction error 不 fail handler) + GET endpoint owner-only 7 unit | ✅ | REG-BPP8-004 + 005 (HappyPath + CrossOwnerReject + 401 + 404 + LimitClamp + NonPluginActionsExcluded + NoAdminLifecyclePath ADM-0 §1.3 红线) |
| ⑤ | AST scan best-effort 锁链延伸第 5 处 3 forbidden token (`pendingLifecycleAudit/lifecycleQueue/deadLetterLifecycle`) 0 hit + LifecycleSystemActor='system' byte-identical 跟 BPP-4 watchdog + AP-2 sweeper 跨 5 milestone 同源 | ✅ | REG-BPP8-006 (AST scan 3 forbidden tokens 0 hit + SystemActor const byte-identical) |

## 2. 反向断言

- 0 新表 (sqlite_master 反向 3 forbidden table 0 hit) — 复用 admin_actions 跟 ADM-2.1 + AP-2 + BPP-4 + BPP-7 audit forward-only 锁链第 5 处
- AST scan lifecycle-queue 3 forbidden tokens 0 hit — best-effort 反 retry queue 偷渡 (跟 BPP-4 + BPP-5 + BPP-6 + BPP-7 锁链延伸第 5 处)
- admin god-mode 不挂 GET /api/v1/agents/{agentId}/lifecycle (ADM-0 §1.3 红线承袭)
- non-plugin actions 排除 (反向断言 limit clamp + filter)

## 3. 留账

⏸️ Prometheus metrics exporter (v3); ⏸️ WS push (RT-3.2 follow-up); ⏸️ cross-org lifecycle aggregation (跟 AP-3); ⏸️ retention policy sweep (v3); ⏸️ G4.audit 飞马软 gate

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-30 | 烈马 | v0 — BPP-8 acceptance ✅ SIGNED post-#532 merged. 5/5 验收 covers REG-BPP8-001..006. 跨 milestone byte-identical: BPP-3 #489 dispatcher + BPP-4 #499 watchdog + BPP-5 #503 reconnect + BPP-6 #522 cold-start + BPP-7 SDK + AL-1 #492 + REFACTOR-REASONS #496 6-dict (锁链第 13 处) + ADM-2.1 #484 admin_actions audit forward-only (锁链第 5 处) + AP-2 #525 sweeper 复用同精神 + ADM-0 §1.3 + AST 锁链延伸第 5 处 (BPP-4+5+6+7+8). 23 unit PASS (5 migration + 11 bpp + 7 api). |
