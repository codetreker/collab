# AP-2 expires_at sweeper 业务化 — 烈马 (QA acceptance) signoff

> **状态**: ✅ **SIGNED** (烈马 acceptance 代签, 2026-04-30, post-#525 merged)
> **范围**: AP-2 — expires_at soft-delete + admin_actions audit + ExpiresSweeper goroutine; AP-1 #493 留账之二
> **关联**: REG-AP2-001..006 6🟢 (post #525 merged); 跟 AL-1b sweeper + AP-1 SSOT + ADM-2.1 admin_actions audit forward-only 同精神

## 1. 验收清单 (5 项)

| # | 验收项 | 结果 | 实施证据 |
|---|---|---|---|
| ① | schema migration v=30 — `ALTER TABLE user_permissions ADD COLUMN revoked_at INTEGER NULL` + sparse idx + admin_actions CHECK 12-step rebuild 加 `permission_expired` | ✅ | REG-AP2-001 (TestAP21_AddsRevokedAtColumn + HasRevokedAtIndex + AdminActionsCHECK + Rejects + V30 + Idempotent) |
| ② | server `ExpiresSweeper` 1h ticker + ctx-aware shutdown + RunOnce 同步入口 (跟 AL-1b agent_status sweeper 同模式 nil-safe); ListUserPermissions WHERE revoked_at IS NULL 排除软删行 | ✅ | REG-AP2-002 (RunOnceFindsExpired 3+2 + RunOnceSoftDeletesNotRealDelete UPDATE not DELETE + Idempotent + StartCtxShutdown) |
| ③ | audit 复用 admin_actions — sweeper revoke 调既有 InsertAdminAction(actor='system', action='permission_expired') + const `auth.ReasonPermissionExpired` + `auth.SystemActorID` byte-identical 跟 BPP-4/AP-2 跨 milestone 锁 | ✅ | REG-AP2-003 (RevokeWritesAuditEntry + ReasonConstByteIdentical + SystemActorByteIdentical + AuditPayloadShape 3-key JSON) |
| ④ | 反向 grep 5 pattern 全 count==0 — DELETE FROM user_permissions / 不另起 expires_audit 表 / 不引入 cron 框架 / admin god-mode 不入 sweeper / hardcode "permission_expired" 字面 0 hit | ✅ | REG-AP2-004 (ReverseGrep_5Patterns_AllZeroHit) |
| ⑤ | full-flow integration — insert grant w/expires_at < now → RunOnce → revoked_at 落库 + admin_actions 行写入 + ListUserPermissions 排除 + HasCapability 后续返 false (AP-1 SSOT 同精神) | ✅ | REG-AP2-005 + REG-AP2-006 (FullFlow + ticker not Sleep, audit forward-only 跟 AL-1 / ADM-2.1 / BPP-4 五处同精神) |

## 2. 反向断言

- soft-delete UPDATE not DELETE — row stays in table, revoked_at = expires_at
- audit forward-only — 跟 AL-1 agent_state_log + ADM-2.1 admin_actions + BPP-4 watchdog audit 五 milestone 跨 schema 共享精神
- ticker not Sleep — 反向 grep `time.Sleep` 在 expires_sweeper.go count==0
- admin god-mode 不入 sweeper (ADM-0 §1.3 红线承袭)

## 3. 留账

⏸️ AL-1b deferred e2e BPP-2 真 frame 后翻 (跟 AP-1 follow-up 同期); ⏸️ G4.audit 飞马软 gate

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-30 | 烈马 | v0 — AP-2 acceptance ✅ SIGNED post-#525 merged. 5/5 验收 covers REG-AP2-001..006. 跨 milestone byte-identical: AL-1b sweeper / AP-1 SSOT / ADM-2.1 admin_actions audit / BPP-4 watchdog actor='system' 跨 5 处 byte-identical. AP-1 #493 留账之二闭环. |
