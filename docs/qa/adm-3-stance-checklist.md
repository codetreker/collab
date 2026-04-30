# ADM-3 stance checklist — admin_actions → audit_events RENAME + alias view

> 3 立场 byte-identical 跟 spec §0 (≤80 行).

## 1. 表名改 audit_events (audit-forward-only 单表跨所有 actor type)

- [x] `ALTER TABLE admin_actions RENAME TO audit_events` 元数据 0 数据迁移 (SQLite RENAME 不拷贝行)
- [x] 索引 + sparse idx_archived_at (AL-7.1) + CHECK enum 全自动跟随 (SQLite RENAME 透明)
- [x] 新表名语义统一 — admin actor + plugin_system actor (BPP-8) + system actor (sweeper) 全装单表
- [x] 立场承袭 ADM-2.1 #484 + AP-2 + BPP-4 + BPP-7 + BPP-8 + HB-3 v2 + AL-7 + AL-8 + HB-5 + CHN-5 audit forward-only 单表跨十一 milestone

## 2. alias view admin_actions 保 backward compat

- [x] `CREATE VIEW admin_actions AS SELECT * FROM audit_events` (read-transparent)
- [x] 既有 gorm `(AdminAction).TableName() == "admin_actions"` SELECT 不破
- [x] INSTEAD OF INSERT trigger 路由 view → table (SQLite views 不可直接写)
- [x] INSTEAD OF UPDATE trigger 路由 sweeper archive → table
- [x] 战马原代码 0 改 — 既有 ADM-2 + BPP-8 + AL-7 unit tests 全 PASS (TestADM31_ViewSelectRoundtrip + TestADM31_ViewInsertRoutedToTable 双向锁)
- [x] view 留 deprecated 至 Phase 5+ (本 PR 不删)

## 3. ADM-0 §1.3 红线扩展

- [x] 红线原: "admin god-mode 不入业务路径"
- [x] 扩展: "audit-forward-only 单表 = 全 actor type, forward-only 不可 DELETE/UPDATE, admin 仍走 /admin-api/* 单独路径"
- [x] 实施 PR 顺手改蓝图 `docs/blueprint/admin-model.md` §1.3 (本 PR 同步, ≤5 行)

## 反约束

- ❌ DELETE/UPDATE on audit_events (forward-only, sweeper 走 archived_at = now)
- ❌ audit_events 直接挂 admin god-mode endpoint (反向 grep 0 hit)
- ❌ INSERT INTO admin_actions (view) 留作 backward compat trigger 路由, 但 production 路径渐进迁到 audit_events 直接调用
- ❌ 字段重设计 (留 v3+)
- ❌ 函数名 RENAME `InsertAdminAction` → `InsertAuditEvent` (留 Phase 5+)
- ❌ view `admin_actions` 删除 (留 Phase 5+ deprecation announcement)

## 跨 milestone byte-identical 锁链

- ADM-2.1 #484 admin_actions schema 起源 (v=22) — RENAME 后单表语义统一
- BPP-8 #532 5 plugin lifecycle 事件 → admin_actions (现 audit_events) — 名实不符今 ADM-3 修
- AL-7.1 #533 archived_at 列 — 跟随 RENAME 自动到 audit_events
- AL-7.2 sweeper UPDATE archived_at — 走 audit_events 直接 (反 view trigger)
- ADM-0 §1.3 红线 — 扩展 audit-forward-only 全 actor type
- audit-forward-only 锁链跨 ADM-2.1 + AP-2 + BPP-4 + BPP-7 + BPP-8 + HB-3 v2 + AL-7 + AL-8 + HB-5 + CHN-5 + ADM-3 = 第 11 处
