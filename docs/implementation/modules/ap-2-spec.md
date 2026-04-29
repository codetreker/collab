# AP-2 spec brief — expires_at sweeper 业务化 (Phase 5+ 续作)

> 战马C · 2026-04-29 · ≤80 行 spec lock (4 件套之一; AP-1 #493 留账之二 wrapper milestone)
> **蓝图锚**: [`auth-permissions.md`](../../blueprint/auth-permissions.md) §1.2 (Scope 层级 v1 三层 + expires_at "schema 保留, UI 不做") + §5 与现状的差距 ("expires_at 列 — 加列 schema 不破, 暂不业务化") + [`admin-model.md`](../../blueprint/admin-model.md) §1.4 (admin_actions audit forward-only)
> **关联**: AP-1.1 #493 user_permissions.expires_at 列 ✅ (NULL = 永久) + AP-3 #521 cross-org owner-only ✅ (AP-1 留账之一闭) + ADM-2.1 admin_actions audit table ✅ + ADM-0 §1.3 admin god-mode 红线 + AL-1 #492 ValidateTransition forward-only audit 同精神
> **命名**: AP-1 已落 (单组织 ABAC + capability 白名单 + 严格 403); AP-3 #521 已落 (cross-org owner-only); AP-2 接 AP-1 留账之二 — expires_at runtime 业务化 sweeper, 命名跟 AP-1.bis spec stance 同精神 (AP-1 schema 列已就位, AP-2 仅补 runtime sweep)

> ⚠️ AP-2 是 **wrapper milestone** (跟 AL-5 / CV-2 v2 #517 / AP-3 #521 wrapper 同模式) — 复用既有 AP-1.1 expires_at 列 + ADM-2.1 admin_actions audit + AL-1 #492 forward-only audit 精神, 仅补 runtime sweeper goroutine, **不裂新组件**, 不另起 cron 框架.

## 0. 关键约束 (3 条立场, 蓝图字面承袭)

1. **expires_at sweeper 周期扫 + soft-delete (forward-only audit)** (蓝图 `auth-permissions.md` §5 + AL-1 #492 forward-only 同精神 + ADM-2.1 admin_actions audit forward-only): sweeper goroutine 1h interval (跟 AL-1b agent_status 周期 stale-detect 同精神 / DL-4 web-push 周期 GC 同模式), 扫 `user_permissions WHERE expires_at IS NOT NULL AND expires_at < now AND revoked_at IS NULL` → soft-delete: 写 `revoked_at = expires_at` (NOT real DELETE — audit 留账); 反约束: 不真删 row (跟 ADM-2.1 admin_actions forward-only 同精神, audit 不可改写); 反向 grep `DELETE FROM user_permissions` 在 internal/auth/ + internal/api/ count==0 (跟 AP-1 立场 ② SSOT 同精神, 删 = 走 sweeper 单源)
2. **audit log entry 复用 admin_actions 跨 milestone** (ADM-2.1 #484 admin_actions 表既有, 跟 BPP-4 watchdog audit / AL-1 state_log 五 milestone 跨 schema 共享精神): sweeper revoke 时写 `admin_actions(actor_id='system', action_type='ap2.permission_expired', target_user_id=<grantee>, payload={permission, scope, original_expires_at})`; 反约束: 不另起 expires_audit 表 (跟 ADM-2.1 既有 path 复用, 跟 AL-1 state_log forward-only 同模式); reason 字面 `'ap2.permission_expired'` const 单源 (跟 AP-1/AP-3 const 同模式, 改 = 改 const 一处)
3. **反向 grep DELETE FROM user_permissions 0 hit (forward-only)** (跟 AL-1 #492 + ADM-2.1 forward-only audit 同模式守 future drift): 反向 grep `DELETE FROM user_permissions\|s\.db.*Delete.*&UserPermission` 在 internal/auth/ + internal/api/ 除 sweeper 文件 count==0; sweeper 路径用 `UPDATE user_permissions SET revoked_at = ?` (forward-only)

## 1. 拆段实施 (AP-2.1 / 2.2 / 2.3, ≤3 PR 同 branch 叠 commit, 一 milestone 一 PR 默认 1 PR)

| 段 | 范围 | 闭锁 | owner |
|---|---|---|---|
| **AP-2.1** sweeper goroutine + revoked_at 列 | `internal/migrations/ap_2_1_user_permissions_revoked.go` v=N (`ALTER TABLE user_permissions ADD COLUMN revoked_at INTEGER NULL` + `idx_user_permissions_revoked WHERE revoked_at IS NOT NULL` sparse index, 跟 AP-1.1 expires_at 同模式); `internal/auth/expires_sweeper.go` 新 `ExpiresSweeper{Store, Logger, Interval, Now}` struct + `Start(ctx)` goroutine 启动 (1h tick, ctx-aware shutdown — 跟 AL-1b agent_status sweeper 同精神 nil-safe); `RunOnce(ctx) (count int, err error)` 单次扫描 helper (testable 同步入口); 反约束: 不开 cron 框架 (复用 time.Ticker, 跟 AL-1b 同模式); 6 unit (TestAP21_AddsRevokedAtColumn + sparse idx + RunOnceFindsExpired + RunOnceSoftDeletesNotRealDelete + RunOnceIdempotentSecondTick + RegistryHasVN) | 待 PR (战马C) | 战马C |
| **AP-2.2** audit log entry + reason const 复用 admin_actions | `internal/auth/expires_sweeper.go` revoke 时写 `admin_actions` (复用 store.CreateAdminAction 既有 path, ADM-2.1 #484 同精神); `auth.ReasonPermissionExpired = "ap2.permission_expired"` const 字面单源 (跟 AP-1 capability const + AP-3 ErrCodeCrossOrgDenied 同模式); 反约束: 不另起 expires_audit 表 (跟 ADM-2.1 既有 path 复用); 不裂 system actor — actor_id='system' string literal byte-identical 跟 BPP-4 watchdog actor 同模式 (跨 milestone 锁); 5 unit (TestAP22_RevokeWritesAuditEntry + ReasonConstByteIdentical + SystemActorByteIdentical + AuditPayloadShape + 反向 grep no_separate_audit_table) | 待 PR (战马C) | 战马C |
| **AP-2.3** server full-flow integration + closure | server-side full-flow: insert grant with expires_at < now → sweeper RunOnce → revoked_at 落库 + admin_actions 行写入 + HasCapability 后续返 false (revoked_at 行被 AP-1 ListUserPermissions 排除, 跟 expires_at runtime gate 同精神); 反约束 grep 5 (DELETE FROM user_permissions 0 / 不另起 expires_audit 表 / 不开 cron 框架 / actor_id='system' 单源 / reason const 单源); registry §3 REG-AP2-001..N + acceptance + PROGRESS [x] AP-2 + docs/current sync (server/auth.md §expires_sweeper + blueprint auth-permissions.md §5 expires_at 业务化字面承袭) | 待 PR (战马C) | 战马C / 烈马 |

## 2. 留账边界 (不接 v2+)

- v2 cross-org admin revoke (留 ADM-3+) — AP-2 仅 expires_at 自动 sweep, 主动 revoke (admin / owner 触发) 走 ADM-3+ 既有 admin god-mode path
- ABAC condition (time-of-day / ip-range) v2+ — 蓝图 §5 留账, AP-2 仅 expires_at 一种触发条件
- granular 权限恢复 (revoked_at 行 un-revoke) v3+ — v1 forward-only audit, 不接 un-revoke (跟 AL-1 #492 state_log forward-only 同精神)
- multi-org user expires sweep v3+ — v1 假设 user.org_id 单值 (跟 AP-3 立场 ②同源)
- expires_at sweeper UI / 历史看 (走 ADM-2 既有 admin_actions audit UI, 不另起)

## 3. 反查 grep 锚 (5 反约束, count==0)

```bash
# 1) DELETE FROM user_permissions — 反向 forward-only 守 (sweeper 走 UPDATE)
git grep -nE 'DELETE FROM user_permissions|s\.db.*Delete.*&UserPermission' \
  packages/server-go/internal/auth/ packages/server-go/internal/api/  # 0 hit (除 sweeper revoke path UPDATE)
# 2) 不另起 expires_audit 表 (复用 admin_actions ADM-2.1 #484 既有)
git grep -nE 'CREATE TABLE.*expires_audit|CREATE TABLE.*permission_revocations' \
  packages/server-go/internal/migrations/  # 0 hit
# 3) 不开 cron 框架 (time.Ticker 单源, 跟 AL-1b agent_status sweeper 同模式)
git grep -nE 'github\.com/.*cron|robfig/cron|gocron' \
  packages/server-go/  # 0 hit
# 4) reason 字面 + actor_id 字面单源 (反 hardcode 错码 / actor 字符串)
git grep -nE '"ap2\.permission_expired"' packages/server-go/internal/  # ≥1 hit (auth/expires_sweeper.go const) + 0 hit hardcode in handler
# 5) admin god-mode 不入此 sweeper path (ADM-0 §1.3 红线)
git grep -nE 'admin.*ExpiresSweeper|ExpiresSweeper.*admin_' \
  packages/server-go/internal/  # 0 hit (sweeper 是 system actor, admin 走 /admin-api 单独 mw)
```

## 4. 不在范围

- v2 admin/owner 主动 revoke UI (ADM-3+)
- ABAC condition (time/ip) (留 v2+)
- granular un-revoke v3+
- multi-org user expires v3+
- audit UI 看 (走 ADM-2 既有 admin_actions UI, 不另起)

## 5. 跨 milestone byte-identical 锁

- 跟 AP-1 #493 HasCapability SSOT + capabilities.go const 同源 (sweeper revoke 后 HasCapability 自动返 false, ListUserPermissions 排除 revoked_at IS NOT NULL 行 — 改 = 改 abac.go ListUserPermissions WHERE 一处)
- 跟 AP-1.1 #493 user_permissions.expires_at NULL = 永久 同精神 (sweeper 仅扫 NOT NULL 行)
- 跟 AP-3 #521 user_permissions.org_id NULL = legacy 同精神 (sweeper 路径不动 org gate)
- 跟 ADM-2.1 #484 admin_actions audit forward-only 同模式 (sweeper revoke 写 audit, 跟 admin god-mode 写 audit 同 path)
- 跟 AL-1 #492 ValidateTransition forward-only state_log 同精神 (forward-only audit, revoked_at 是 soft-delete 不真删)
- 跟 BPP-4 watchdog actor_id='system' 同模式 (system actor 字面 byte-identical 跨五 milestone 锁)

## 6. 更新日志

| 日期 | 作者 | 变化 |
|------|------|------|
| 2026-04-29 | 战马C | v0 spec brief — Phase 5+ wrapper milestone (跟 AL-5 / CV-2 v2 #517 / AP-3 #521 同期, AP-1 #493 留账之二 expires_at 业务化 sweeper). 3 立场 (sweeper 周期扫 + soft-delete forward-only / audit log 复用 admin_actions / 反向 grep DELETE 0 hit) + 5 反约束 grep + 3 段拆 (sweeper goroutine + revoked_at 列 / audit + reason const 复用 / e2e+closure) + 4 件套 spec 第一件 (acceptance + stance + content-lock 后续). 命名 AP-2 — AP-1 留账之二 expires_at runtime 业务化, 跟 AP-3 #521 (留账之一 cross-org) 顺位. 一 milestone 一 PR 协议默认 1 PR (跟 AP-3 #521 / CV-2 v2 #517 同模式). |
