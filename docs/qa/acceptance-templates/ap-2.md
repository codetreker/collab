# Acceptance Template — AP-2: expires_at sweeper 业务化 wrapper milestone

> Spec: `docs/implementation/modules/ap-2-spec.md` (战马C v0, cfa3869)
> 蓝图: `auth-permissions.md` §5 expires_at "暂不业务化" 解锁 + `admin-model.md` §1.4 audit forward-only
> 前置: AP-1.1 #493 user_permissions.expires_at 列 ✅ + AP-3 #521 user_permissions.org_id 列 ✅ + ADM-2.1 #484 admin_actions audit table ✅ + AL-1 #492 forward-only state_log ✅ + BPP-4 watchdog actor='system' 字面 ✅
> Owner: 战马C (主战) + 飞马 (spec) + 烈马 (验收)

## 验收清单

### AP-2.1 schema migration v=30 + sweeper goroutine

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 1.1 `ALTER TABLE user_permissions ADD COLUMN revoked_at INTEGER NULL` (跟 AP-1.1 expires_at + AP-3 org_id ALTER ADD COLUMN NULL 同模式) + sparse `idx_user_permissions_revoked WHERE revoked_at IS NOT NULL` | unit | 战马C / 烈马 | `internal/migrations/ap_2_1_user_permissions_revoked_test.go::TestAP21_AddsRevokedAtColumn` + `TestAP21_HasRevokedAtIndex` (sparse WHERE byte-identical) |
| 1.2 admin_actions CHECK enum 12-step rebuild: 5 项 → 6 项 (`'permission_expired'` 加, byte-identical 跟 sweeper actor='system' 路径) | unit | 战马C / 烈马 | `TestAP21_AdminActionsCHECKAcceptsPermissionExpired` + `TestAP21_AdminActionsRejectsUnknownAction` (反向断言 spec 外 reject) |
| 1.3 `ExpiresSweeper{Store, Logger, Interval, Now}` struct + `Start(ctx)` goroutine 启动 (1h ticker, ctx-aware shutdown — 跟 AL-1b agent_status sweeper 同精神 nil-safe) | unit | 战马C / 烈马 | `internal/auth/expires_sweeper_test.go::TestAP21_StartCtxShutdown` (cancel context → goroutine 退出 ≤100ms) |
| 1.4 `RunOnce(ctx) (count int, err error)` 同步入口 — 单次扫描 + revoke + audit 的 testable 入口 | unit | 战马C / 烈马 | `TestAP21_RunOnceFindsExpired` (insert 3 expired + 2 永久 grants → RunOnce returns count=3) + `TestAP21_RunOnceSoftDeletesNotRealDelete` (revoked_at 落库, row 仍 exists in table) |
| 1.5 sweeper SQL forward-only — `UPDATE user_permissions SET revoked_at = expires_at WHERE expires_at IS NOT NULL AND expires_at < ? AND revoked_at IS NULL`; 不接 admin god-mode 触发, actor='system' 字面 | unit + reverse grep | 战马C / 烈马 | `TestAP21_RunOnceIdempotentSecondTick` (二次扫不再写入, count==0) + 反向 grep `DELETE FROM user_permissions\|s\.db.*Delete.*&UserPermission` 在 internal/auth/+internal/api/ count==0 |
| 1.6 idempotent re-run guard (跟 AP-1.1 expires_at + AP-3 org_id ALTER 同模式 schema_migrations 框架守) + registry.go 字面锁 v=30 | unit | 战马C / 烈马 | `TestAP21_Idempotent` + `TestAP21_RegistryHasV30` |

### AP-2.2 audit log 复用 admin_actions

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 2.1 sweeper revoke 时调 `Store.InsertAdminAction(actor='system', action='permission_expired', target=<grantee_user_id>, metadata=JSON{permission, scope, original_expires_at})` (复用 ADM-2.1 #484 既有 path) | unit | 战马C / 烈马 | `expires_sweeper_test.go::TestAP22_RevokeWritesAuditEntry` (RunOnce 后 admin_actions 表新增行 + actor / action / target_user_id 字面正确) |
| 2.2 `auth.ReasonPermissionExpired = "permission_expired"` const 字面单源 (跟 AP-1 capabilities.go const + AP-3 ErrCodeCrossOrgDenied 同模式) + `auth.SystemActorID = "system"` const (跟 BPP-4 watchdog actor='system' 字面同源, 跨五 milestone 锁) | unit | 战马C / 烈马 | `TestAP22_ReasonConstByteIdentical` + `TestAP22_SystemActorByteIdentical` |
| 2.3 audit metadata JSON shape — `{"permission":"...","scope":"...","original_expires_at":<int>}` 字面 byte-identical (反 hardcode JSON 字段名漂移) | unit | 战马C / 烈马 | `TestAP22_AuditPayloadShape` (RunOnce 后 metadata JSON 解析回 map 三 key 字面正确) |
| 2.4 不另起 expires_audit 表 (反向 grep migrations 0 hit) | reverse grep | 烈马 | `TestAP22_ReverseGrep_NoSeparateAuditTable` (filepath.Walk count==0) |

### AP-2.3 server full-flow integration + closure

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 3.1 server-side full-flow — insert grant with `expires_at < now` → RunOnce → `revoked_at` 落库 + `admin_actions` 行写入 + 后续 `ListUserPermissions` 排除 revoked 行 + `HasCapability` 后续返 false (跟 AP-1 SSOT 同精神, 改 = 改 abac.go ListUserPermissions WHERE 一处) | http unit | 战马C / 烈马 | `internal/auth/expires_sweeper_test.go::TestAP23_FullFlow_GrantExpired_ThenRevokedThenHasCapabilityFalse` (insert / RunOnce / Get → revoked / HasCapability false) |
| 3.2 反向 grep CI lint 等价单测 (5 grep pattern: DELETE / expires_audit / cron 框架 / admin god-mode / hardcode reason) | unit | 烈马 | `expires_sweeper_test.go::TestAP23_ReverseGrep_5Patterns_AllZeroHit` (filepath.Walk 5 pattern count==0) |
| 3.3 closure: registry §3 REG-AP2-001..N + acceptance + PROGRESS [x] AP-2 + docs/current sync (server/auth.md §expires_sweeper + blueprint auth-permissions.md §5 字面对齐 — 解锁 "暂不业务化" 留账) | docs | 战马C / 烈马 | registry + PROGRESS + 4 件套全闭 |

## 不在本轮范围 (spec §4)

- v2 admin/owner 主动 revoke UI (留 ADM-3+, server-side sweep + 错码已就位)
- ABAC condition (time/ip) (留 v2+)
- granular un-revoke v3+ (forward-only, 跟 AL-1 state_log 同精神)
- multi-org user expires (留 v3+)
- expires sweeper UI / 历史看 (走 ADM-2 既有 admin_actions 路径)

## 退出条件

- AP-2.1 1.1-1.6 (schema ALTER + admin_actions CHECK 扩 + sweeper struct + RunOnce + forward-only SQL + idempotent) ✅
- AP-2.2 2.1-2.4 (audit complaint + reason / actor const + JSON shape + 不另起表) ✅
- AP-2.3 3.1-3.3 (full-flow + 反向 grep + closure) ✅
- 现网回归不破: AP-1 / AP-3 路径零变 (revoked_at NULL = 永久, 跟 expires_at NULL 同精神; ListUserPermissions WHERE revoked_at IS NULL 排除新行)
- REG-AP2-001..N 落 registry + 5 反约束 grep 全 count==0
- 4 件套全闭 (spec ✅ + stance ✅ + acceptance ✅ + content-lock 不需要 server-only)

## 更新日志

- 2026-04-29 — 战马C v0 acceptance template (4 件套第二件): 3 段实施 (1.1-1.6 / 2.1-2.4 / 3.1-3.3) + 5 不在范围 + 6 项退出条件. 联签 AP-2.1/.2/.3 三段同 branch 同 PR (一 milestone 一 PR 协议默认 1 PR, 跟 AP-3 #521 / CV-2 v2 #517 同模式).
