# AP-2 立场反查清单 (战马C v0)

> 战马C · 2026-04-29 · 立场 review checklist (跟 AP-1 #493 / AP-3 #521 / ADM-2 #484 同模式)
> **目的**: AP-2 三段实施 (2.1 sweeper + revoked_at 列 + admin_actions CHECK 扩 / 2.2 audit 复用 admin_actions / 2.3 e2e + closure) PR review 时, 飞马 / 烈马按此清单逐立场 sign-off, 反向断言代码层守住每条立场.
> **关联**: spec `docs/implementation/modules/ap-2-spec.md` (战马C v0, cfa3869) + acceptance `docs/qa/acceptance-templates/ap-2.md`. 复用 AP-1.1 #493 user_permissions.expires_at 列 + AP-3 #521 user_permissions.org_id 列 + ADM-2.1 #484 admin_actions audit table + AL-1 #492 forward-only state_log + BPP-4 watchdog actor='system' 字面 + ADM-0 §1.3 admin god-mode 红线.

## §0 立场总表 (3 立场 + 5 边界)

| # | 立场 | 蓝图字面 | 反约束 (代码层守门) |
|---|---|---|---|
| ① | expires_at sweeper 周期扫 + soft-delete (forward-only) | auth-permissions.md §5 + AL-1 #492 forward-only state_log + ADM-2.1 #484 forward-only audit | sweeper goroutine 1h interval (跟 AL-1b agent_status sweeper 同模式 nil-safe ctx-aware shutdown); 扫 `WHERE expires_at IS NOT NULL AND expires_at < now AND revoked_at IS NULL` → `UPDATE user_permissions SET revoked_at = expires_at` (NOT real DELETE); 反向 grep `DELETE FROM user_permissions\|s\.db.*Delete.*&UserPermission` 在 internal/auth/+internal/api/ 除 sweeper 路径 count==0 |
| ② | audit log 复用 admin_actions 跨 milestone | ADM-2.1 #484 admin_actions audit + 跟 AL-1 state_log 五 milestone 跨 schema 共享精神 | sweeper revoke 时调既有 `Store.InsertAdminAction(actor='system', action='permission_expired', target=<grantee>, metadata=JSON{permission, scope, original_expires_at})`; 不另起 expires_audit 表 (反向 grep `CREATE TABLE.*expires_audit\|permission_revocations` count==0); admin_actions CHECK enum 12-step 扩 1 项 (5→6) — `'permission_expired'` byte-identical |
| ③ | 反向 grep DELETE FROM user_permissions 0 hit (forward-only) | 跟 AL-1 #492 + ADM-2.1 forward-only audit 同模式 | 反向 grep 5 pattern 在 internal/auth/+internal/api/ 全 count==0 (DELETE FROM user_permissions / s.db.Delete UserPermission / 不另起 expires_audit 表 / 不引入 cron 框架 / admin god-mode 不入 sweeper) |
| ④ (边界) | reason / actor 字面单源 (跟 AP-1 / AP-3 const 同模式) | AP-1 #493 立场 ② SSOT helper + AP-3 #521 ErrCodeCrossOrgDenied 同模式 | `auth.ReasonPermissionExpired = "permission_expired"` const (audit action enum 字面, byte-identical 跟 admin_actions CHECK 同源, 改 = 改两处); `auth.SystemActorID = "system"` const (跟 BPP-4 watchdog actor='system' 字面同源, 跨五 milestone 锁); 反向 grep handler 内 hardcode `"permission_expired"` count==0 |
| ⑤ (边界) | admin god-mode 不入 sweeper path | admin-model.md §1.3 + AP-1 立场 ⑤ + AP-3 立场 ⑤ | sweeper actor='system' 是字面常量, 不接 admin SPA 触发; 反向 grep `admin.*ExpiresSweeper\|ExpiresSweeper.*admin_` count==0 (sweeper 是 system 周期, admin 主动 revoke 走 ADM-3+ 单独 path) |
| ⑥ (边界) | revoked_at 行被 ListUserPermissions 排除 | AP-1 #493 HasCapability SSOT 同精神 | `Store.ListUserPermissions` SQL WHERE 加 `revoked_at IS NULL` (改 = 改一处, AP-1 SSOT 单源同精神, HasCapability 路径自动返 false 对 revoked 行); 反向 grep handler 单独 filter revoked_at count==0 (不裂二次 filter) |
| ⑦ (边界) | sweeper 不开 cron 框架 | AL-1b agent_status sweeper time.Ticker + AP-1 立场 同精神 | 复用 `time.Ticker` + `context.Done()` shutdown; 反向 grep `github\.com/.*cron\|robfig/cron\|gocron` 在 packages/server-go/ count==0 |
| ⑧ (边界) | sweeper RunOnce 同步入口 testable | 跟 AL-1b sweeper RunOnce 同模式 | `ExpiresSweeper.RunOnce(ctx) (count int, err error)` 单次扫描 helper — 测试用同步入口; `Start(ctx)` goroutine 走 RunOnce + ticker 循环; 反向 grep `time\.Sleep` 在 expires_sweeper.go count==0 (用 ticker 不 sleep) |

## §1 立场 ① sweeper 周期扫 + soft-delete (AP-2.1 守)

**蓝图字面源**: `auth-permissions.md` §5 + AL-1 #492 forward-only state_log + ADM-2.1 #484 admin_actions forward-only audit

**反约束清单**:

- [ ] `internal/auth/expires_sweeper.go::ExpiresSweeper{Store, Logger, Interval, Now}` struct + `Start(ctx)` 启动 1h ticker 循环 (跟 AL-1b agent_status sweeper 同模式 nil-safe ctx-aware shutdown)
- [ ] `RunOnce(ctx) (count int, err error)` 同步入口 — 单次扫描 + revoke + audit 的 testable 入口 (TestAP21_RunOnceFindsExpired 走此)
- [ ] sweeper SQL: `UPDATE user_permissions SET revoked_at = expires_at WHERE expires_at IS NOT NULL AND expires_at < ? AND revoked_at IS NULL` (forward-only, 不真删 row)
- [ ] 反向 grep `DELETE FROM user_permissions\|s\.db.*Delete.*&UserPermission` 在 internal/auth/+internal/api/ count==0 (TestAP23_ReverseGrep_NoDeleteFromUserPermissions 守)
- [ ] 反向 grep `time\.Sleep` 在 expires_sweeper.go count==0 (用 ticker 不 sleep, 立场 ⑧)

## §2 立场 ② audit log 复用 admin_actions (AP-2.2 守)

**蓝图字面源**: ADM-2.1 #484 admin_actions audit + AL-1 #492 五 milestone 跨 schema 共享精神

**反约束清单**:

- [ ] sweeper revoke 时调既有 `Store.InsertAdminAction(actor='system', action='permission_expired', target=<grantee_user_id>, metadata=JSON{permission, scope, original_expires_at})` — 复用 ADM-2.1 既有 path
- [ ] admin_actions CHECK enum 12-step 扩: `('delete_channel','suspend_user','change_role','reset_password','start_impersonation','permission_expired')` (跟 CV-3.1 / CV-2 v2 12-step table-recreate 同模式; AP-2.1 migration 内做)
- [ ] `auth.ReasonPermissionExpired = "permission_expired"` const + `auth.SystemActorID = "system"` const 字面单源
- [ ] 反向 grep `CREATE TABLE.*expires_audit\|CREATE TABLE.*permission_revocations` 在 internal/migrations/ count==0
- [ ] 反向 grep handler 内 hardcode `"permission_expired"` 字面字符串 in non-const path count==0 (TestAP22_ReasonConstByteIdentical)

## §3 立场 ③ 反向 grep + 跨 milestone 锁 (AP-2.3 守)

**蓝图字面源**: 跟 AL-1 #492 + ADM-2.1 + AP-1 / AP-3 反约束 grep 同模式守 future drift

**反约束清单**:

- [ ] 5 grep pattern 全 count==0: DELETE FROM user_permissions / 不另起 expires_audit 表 / 不引入 cron 框架 / admin god-mode 不入 sweeper / hardcode reason 字面
- [ ] full-flow integration: insert grant w/expired → RunOnce → revoked_at 落库 + admin_actions 行写入 + ListUserPermissions 排除 revoked_at 行 + HasCapability 后续返 false
- [ ] registry §3 REG-AP2-001..N + acceptance + PROGRESS [x] AP-2 + docs/current sync (server/auth.md §expires_sweeper)

## §4 联签清单 (实施 PR 时填)

- [ ] 飞马 (spec ↔ 立场对齐): _(签)_
- [ ] 烈马 (反向 grep + 单测覆盖率 ≥84% + 5 反约束全 count==0): _(签)_
- [ ] 战马C (实施代码 ↔ 立场反查 8 项全过): _(签)_
