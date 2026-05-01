# Acceptance Template — ADM-3-V1-E2E (ADM-3 v1 multi-source #619 follow-up admin Playwright e2e)

> Spec brief `adm-3-v1-e2e-spec.md` (飞马 v0). Owner: 战马C 实施 / 飞马 review / 烈马 验收.
>
> **ADM-3-V1-E2E 范围**: ADM-3 v1 multi-source UNION ALL #619 已 land server unit 11 + vitest 7, 但缺 admin login → /admin/audit-multi-source Playwright e2e (G4.audit closure P0.1 漏件). 立场承袭 ADM-3 v1 + AL-8 reverse-grep 白名单单一例外 + ADM-0 §1.3 admin god-mode 红线. **0 production code 改 (仅 e2e)**.

## 验收清单

### §1 行为不变量 (ADM-3 v1 #619 立场承袭)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 1.1 4 source UNION ALL byte-identical (server / plugin / host_bridge / agent) | E2E | Playwright `_AdminLogin_AllSourcesQuery` PASS, response 4 源 |
| 1.2 admin god-mode 路径独立 — admin login → /admin-api/v1/audit/multi-source 通; user 走 → 403 reject (反 user-rail 漂) | E2E | `_AdminLogin_FullQuery` + `_UserLogin_403Rejected` PASS |
| 1.3 source filter / time range / limit clamp 真测 | E2E | `_SourceFilterQuery` + `_TimeRangeFilter` + `_LimitClamp` PASS |

### §2 E2E (admin Playwright 真测 + 反 cross-user leak)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 2.1 Playwright `adm-3-multi-source.spec.ts` 5 case PASS (admin login + user reject + source filter + time range + limit clamp) | E2E | `packages/e2e/tests/adm-3-multi-source.spec.ts` 5 case PASS |
| 2.2 反 user-rail audit feed 真测 — user 真 cookie 无法访问 /admin-api/v1/audit/multi-source (永不挂, ADM-0 §1.3 红线立场承袭) | E2E | `_NoUserRailAuditFeed` PASS, 403 byte-identical |

### §3 closure (REG + cov gate + 跨 milestone 锁)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 3.1 既有全包 unit + e2e + vitest 全绿不破 + post-#621 haystack gate 三轨过 | full test + CI | go-test-cov SUCCESS |
| 3.2 0 production code 改 (仅 e2e 加) | git diff | `git diff main -- packages/server-go/internal/api/` 0 行 |
| 3.3 立场承袭 4 source enum SSOT byte-identical (跨层锁 server const + client AUDIT_SOURCES + i18n SOURCE_LABEL) | grep | reverse grep test PASS |

## REG-ADM3E2E-* 占号 (initial ⚪)

- REG-ADM3E2E-001 ⚪ admin login → /admin-api/v1/audit/multi-source 全 4 source UNION ALL 真测
- REG-ADM3E2E-002 ⚪ admin god-mode 路径独立 + user 走 /admin-api/* 403 真测 (ADM-0 §1.3)
- REG-ADM3E2E-003 ⚪ source filter / time range / limit clamp 4 case 真测
- REG-ADM3E2E-004 ⚪ 反 user-rail audit feed 真测 (永不挂)
- REG-ADM3E2E-005 ⚪ Playwright `adm-3-multi-source.spec.ts` 5 case PASS + 0 production code 改
- REG-ADM3E2E-006 ⚪ 全包 PASS + haystack gate + 立场承袭 ADM-3 v1 + 跨四 milestone audit 反转锁链

## 退出条件

- §1 (3) + §2 (2) + §3 (3) 全绿 — 一票否决
- 5 case Playwright 真测 PASS
- 反 user-rail audit feed (ADM-0 §1.3 红线立场承袭)
- 0 production code 改 + post-#621 haystack gate 三轨过
- 登记 REG-ADM3E2E-001..006

## 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-05-01 | 烈马 | v0 — acceptance template. 立场承袭 ADM-3 v1 #619 + G4.audit closure P0.1 漏件 + 跨四 milestone audit 反转锁链 + ADM-0 §1.3 红线 + AL-8 reverse-grep 白名单单一例外承袭. |
