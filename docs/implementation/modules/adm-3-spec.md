# ADM-3 admin_actions → audit_events 重命名 — spec brief (飞马 v0)

> 飞马 · 2026-04-30 · ≤80 行 · BPP-8 #532 名实不符 follow-up
> 关联: ADM-2 #484 admin_actions 表 / BPP-8 #532 5 plugin lifecycle 事件 → admin_actions / Phase 4 batch1 audit (`docs/qa/phase-4-review-batch1.md` §2.2) / ADM-0 §1.3 红线
> Owner: 战马待派 (主战) + 飞马 spec 协作

---

## 0. 立场 (3 项)

### 立场 ① — 表名改 `audit_events` (audit-forward-only 单表跨所有 actor type)
- 现状: `admin_actions` 既装 admin events (actor=human admin) 又装 plugin lifecycle events (actor=`LifecycleSystemActor` 常量, BPP-8). 名实不符.
- 目标: RENAME TABLE → `audit_events`, 语义统一为 "全 audit-forward-only 单表, 任意 actor type".
- **数据迁移 0 行** — SQLite RENAME 是元数据操作, 0 拷贝.

### 立场 ② — alias view `admin_actions` 保 backward compat
- `CREATE VIEW admin_actions AS SELECT * FROM audit_events WHERE actor_kind = 'admin'` (或不带 WHERE 全直通, 看 ADM-2 既有读路径)
- 战马原代码 0 改 (InsertAdminAction / GetAdminActionsByTarget 等查 view 跟查 table 一样)
- 后续 milestone 渐进迁移到 `audit_events` 直接调用, view 留 deprecated 至 Phase 5+

### 立场 ③ — ADM-0 §1.3 红线字面扩展
- 红线原: "admin god-mode 不入业务路径"
- 扩展: "audit-forward-only 单表 = 全 actor type (admin / system / plugin lifecycle / 未来类型), forward-only 不可 DELETE/UPDATE, admin 仍走 /admin-api/* 单独路径"
- 立场写进 ADM-0 §1.3 (本 spec 不改蓝图, 实施 PR 顺手改)

---

## 1. 文件清单 (≤6 文件, 拆 3 段)

| 段 | 文件 | 范围 |
|---|---|---|
| 1 schema migration | `internal/migrations/00XX_adm_3_audit_events_rename.go` (v=43) | `ALTER TABLE admin_actions RENAME TO audit_events` + `CREATE VIEW admin_actions AS SELECT * FROM audit_events` |
| 1 schema test | `..._test.go` | RENAME 后 view 可读 + audit_events 可写 + idempotent migration |
| 2 store query 改名 | `internal/store/admin_actions.go` | 函数名留 `InsertAdminAction` / `GetAdminActionsByTarget` (backward compat) 但 SQL 改查 `audit_events` 直接 |
| 2 store BPP-8 query | `internal/store/bpp_lifecycle_audit.go` (#532 既有) | 同上, 改查 `audit_events` 直接 |
| 3 docs/current sync | `docs/current/server/data-model.md` + `migrations.md §8.X v=43` | 表名 `audit_events` + view `admin_actions` (deprecated) |
| 3 acceptance template | `docs/qa/acceptance-templates/adm-3.md` (烈马) | 5 反约束 grep + REG-ADM3-001..005 占号 |

---

## 2. 反约束 (5 grep, count==0)

```bash
# 1) production 路径继续用 admin_actions 函数名 (alias compat)
git grep -nE 'InsertAdminAction|GetAdminActionsByTarget' packages/server-go/internal/   # ≥1 hit (compat 期不删函数名)

# 2) DELETE/UPDATE on audit_events (forward-only 锁)
git grep -nE 'DELETE FROM audit_events|UPDATE audit_events' packages/server-go/internal/   # 0 hit

# 3) audit_events 不直接挂 admin god-mode endpoint
git grep -nE '/admin-api.*audit_events|admin.*god.*audit_events' packages/server-go/internal/api/   # 0 hit

# 4) view admin_actions 不写 (read-only alias)
git grep -nE 'INSERT INTO admin_actions' packages/server-go/internal/   # 0 hit (RENAME 后写都走 audit_events table)

# 5) actor_kind 字段值字面散落 (走 const)
git grep -nE '"admin"|"plugin_system"|"system"' packages/server-go/internal/store/audit_events.go   # 0 hit (走 const)
```

---

## 3. 不在范围 (留账)

- `audit_events` 字段重设计 (e.g., 加 `severity` / `event_version` / 拆 metadata JSON) — v3+
- 旧 `InsertAdminAction` / `GetAdminActionsByTarget` 函数名重命名为 `InsertAuditEvent` 等 — Phase 5+ 渐进迁移 (本 PR 仅 SQL 切表名)
- view `admin_actions` 删除时机 — 留 Phase 5+ deprecation announcement
- BPP-8 5 plugin lifecycle 事件继续用既有路径不动

---

## 4. 跨 milestone byte-identical 锁

- 复用 audit-forward-only 链 (ADM-2.1 #484 + AP-2 + BPP-4 #499 + BPP-7 + BPP-8 #532 + HB-3 v2 + AL-7 + AL-8 + HB-5 + CHN-5) — 全部 audit 表共享 forward-only 立场
- `LifecycleSystemActor` const (BPP-8 #532 引入) 跟 `AdminActor` const (ADM-2 #484) 同精神, 都进 `audit_events.actor_kind`
- ADM-0 §1.3 红线扩展: admin path 不变 (/admin-api/*), 业务 audit query 走 audit_events table 直接

---

## 5. 验收挂钩

- REG-ADM3-001..005 (5 反约束 grep + view backward compat 单测)
- 既有 ADM-2 / BPP-8 unit tests 全 PASS (alias view 不破现有 read 路径)
- Phase 4 batch1 audit §2.2 drift 闭

---

## 6. 更新日志

| 日期 | 作者 | 变化 |
|------|------|------|
| 2026-04-30 | 飞马 | v0 spec brief — admin_actions → audit_events RENAME (元数据 0 数据迁移) + alias view backward compat. 3 立场 + 5 反约束 grep + ≤6 文件 (拆 schema/store/docs 3 段). v=43 sequencing (紧 BPP-8 #532 v=42 后). 跟 Phase 4 batch1 audit §2.2 drift 闭. zhanma 待派主战, 飞马 spec 协作. |
