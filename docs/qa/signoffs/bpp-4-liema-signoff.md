# BPP-4 失联检测 (heartbeat watchdog 30s + dead-letter audit log) — 烈马 (QA acceptance) signoff

> **状态**: ✅ **SIGNED** (烈马 acceptance 代签, 2026-04-30, post-#499 merged)
> **范围**: BPP-4 — heartbeat watchdog 30s 触发 reason=network_unreachable + dead-letter log key + retry-queue 反约束
> **关联**: REG-BPP4-001..009 9🟢; AL-1a 6-dict 锁链第 9 处; BPP-1 #304 envelope reflect lint 自动覆盖; HB-1/HB-2 audit 三处同源

## 1. 验收清单 (5 项)

| # | 验收项 | 结果 | 实施证据 |
|---|---|---|---|
| ① | 单源阈值锁 BPP_HEARTBEAT_TIMEOUT_SECONDS == 30 (acceptance §1.1 + content-lock §1.①) | ✅ | REG-BPP4-001 (TestBPP4_Watchdog_ThresholdConstant) |
| ② | watchdog 触发路径 = AgentErrorSink.SetError, 不下 cancel/abort frame; reason byte-identical 跟 AL-1a 6-dict (BPP-4 = 第 9 处) | ✅ | REG-BPP4-002 (TriggersErrorOn30sTimeout fake clock 31s + reason==network_unreachable) |
| ③ | 重连 (lastSeenAt 刷新) → markedErr 清, 下次 disconnect 重新 flip + 多 plugin 隔离 + 防重复扫 | ✅ | REG-BPP4-003 + 004 (ReconnectClearsMarked + MultiPluginIsolated + NotSpammyOnRepeatedScan) |
| ④ | log key `bpp.heartbeat_timeout` + dead-letter `bpp.frame_dropped_plugin_offline` byte-identical (改 = 改三处单测锁) + DeadLetterAuditEntry 5 字段 byte-identical 跟 HB-1/HB-2 audit 三处同源 | ✅ | REG-BPP4-005 + 006 + 007 (LogKeyOnTimeout + DeadLetter_LogKeyByteIdentical + AuditSchema5FieldsByteIdentical reflect 字段名 + JSON tag 锁) |
| ⑤ | 反向断言 retry-queue 类标识符 0 hit (best-effort 立场, 防偷偷下沉 v2 retry) + bpp envelope 不动 (whitelist 数量不变, BPP-4 仅复用 HeartbeatFrame 触发源) | ✅ | REG-BPP4-008 + 009 (NoRetryQueueInBPPPackage AST ident scan 4 forbidden tokens 0 hit + frame_schemas_test whitelist count 不变) |

## 2. 反向断言

- AST scan internal/bpp/ 非 _test.go forbidden tokens (pendingAcks/retryQueue/deadLetterQueue/ackTimeout) count==0 — 立场 best-effort 反 v2 retry 偷渡
- BPP-1 #304 envelope reflect lint 自动覆盖 — whitelist count 不变 (BPP-4 不开新 frame)
- AL-1a 6-dict 锁链第 9 处 byte-identical (#249/#305/#321/#380/#454/#458/#481/#492/#499) — 跟 REFACTOR-REASONS #496 dedupe 后立场承袭
- audit 5 字段 byte-identical 跟 HB-1/HB-2 同源 (actor/action/target/when/scope) — 跟 ADM-2.1 audit forward-only 同精神

## 3. 留账

⏸️ BPP-4 v2 retry queue (永不实施立场, 反约束守门); ⏸️ G4.audit 飞马软 gate

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-30 | 烈马 | v0 — BPP-4 acceptance ✅ SIGNED post-#499 merged. 5/5 验收 covers REG-BPP4-001..009. 跨 milestone byte-identical: AL-1a 6-dict 锁链第 9 处 + BPP-1 envelope reflect lint + HB-1/HB-2 audit 5 字段 + ADM-2.1 audit forward-only + AST 锁链 best-effort 反 retry queue. 反约束立场守门 (永不实施 v2 retry). |
