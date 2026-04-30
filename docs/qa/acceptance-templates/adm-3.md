# Acceptance Template — ADM-3: admin_actions → audit_events RENAME + alias view ✅

> 元数据 RENAME (SQLite 0 数据迁移) + view backward compat alias. 既有 ADM-2 / BPP-8 / AL-7 unit tests 全 PASS (alias view 不破现有 read/write 路径). content-lock 不需 (server-only schema).

## 验收清单

### §1 ADM-3.1 — schema migration v=43

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 1.1 audit_events 是 table (非 view) post-RENAME | unit | `TestADM31_AuditEventsTableExists` PASS |
| 1.2 admin_actions 是 view (alias) post-RENAME | unit | `TestADM31_AdminActionsViewExists` PASS |
| 1.3 view SELECT 透明 (round-trip via audit_events INSERT) | unit | `TestADM31_ViewSelectRoundtrip` PASS |
| 1.4 INSTEAD OF INSERT trigger 路由 view → table | unit | `TestADM31_ViewInsertRoutedToTable` PASS |
| 1.5 v=43 sequencing (team-lead 占号) | unit | `TestADM31_VersionIs43` PASS |
| 1.6 idempotent re-run no-op | unit | `TestADM31_Idempotent` PASS |

### §2 ADM-3.2 — 既有 unit tests 全 PASS (backward compat 锁)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 2.1 ADM-2 既有 admin_actions unit tests 全 PASS (TestADM21*+TestADM22*) | go test -tags sqlite_fts5 ./... | 全绿 |
| 2.2 BPP-8 既有 lifecycle audit unit tests 全 PASS | 同上 | 全绿 |
| 2.3 AL-7 既有 retention sweeper unit tests 全 PASS (UPDATE 路径仍走 view → trigger → table) | 同上 | 全绿 |
| 2.4 server-go ./... 全 25 packages 全绿 (+sqlite_fts5 tag) | go test | 全绿 |

### §3 ADM-3.3 — closure + 反向 grep

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 3.1 反向 grep 5 锚 (spec §2): InsertAdminAction ≥1 hit (compat) + DELETE FROM audit_events 0 hit + admin god-mode endpoint 0 hit + INSERT INTO admin_actions 0 hit (production) + actor_kind 字面 0 hit | grep | spec §2 |
| 3.2 REG-ADM3-001..005 5 行 🟢 | regression-registry.md | 5 行 |
| 3.3 PROGRESS [x] 加行 | PROGRESS.md | changelog 加行 |
| 3.4 acceptance template ✅ closed | 本文件 | 关闭区块加日期 |

## 边界

- ADM-2.1 #484 admin_actions 起源 / BPP-8 #532 plugin lifecycle 事件入 admin_actions / AL-7.1 archived_at 列 / sweeper UPDATE archived_at / ADM-0 §1.3 红线扩展 / audit-forward-only 锁链跨 11 处

## 退出条件

- §1+§2+§3 全绿
- v=43 migration + view alias 真挂
- 既有 ADM-2 / BPP-8 / AL-7 unit tests 全 PASS (backward compat)
- REG-ADM3-001..005 5 行

## 关闭

✅ 2026-04-30 战马E — `ALTER TABLE admin_actions RENAME TO audit_events` 元数据 0 数据迁移 + alias view + INSTEAD OF INSERT/UPDATE triggers 锁 backward compat. 6 ADM-3.1 unit tests PASS + server-go ./... 全 25 packages 全绿 (+sqlite_fts5 tag); 既有 ADM-2 / BPP-8 / AL-7 unit tests 全 PASS 验证 alias view 不破; REG-ADM3-001..005 5 🟢 + ADM-0 §1.3 红线扩展 audit-forward-only 锁链第 11 处.
