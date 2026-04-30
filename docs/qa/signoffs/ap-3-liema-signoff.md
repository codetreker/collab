# AP-3 cross-org owner-only 强制 — 烈马 (QA acceptance) signoff

> **状态**: ✅ **SIGNED** (烈马 acceptance 代签, 2026-04-30, post-#521 merged)
> **范围**: AP-3 — abac.HasCapability 加 1 层 cross-org owner-only gate + user_permissions.org_id schema slot; AP-1 #493 留账之一
> **关联**: REG-AP3-001..006 6🟢; 跟 AP-1 SSOT + CV-1 channel.org_id + CM-3 #208 既有不变量 + BPP-1 #304 org sandbox 同源

## 1. 验收清单 (5 项)

| # | 验收项 | 结果 | 实施证据 |
|---|---|---|---|
| ① | schema migration v=29 — `ALTER TABLE user_permissions ADD COLUMN org_id TEXT` (NULL nullable, 跟 AP-1.1 expires_at 同模式) + sparse idx WHERE org_id IS NOT NULL + 反约束: 不挂 NOT NULL / 不挂 default / 不挂 FK organizations(id) | ✅ | REG-AP3-001 (TestAP31_AddsOrgIDColumn + HasOrgIDIndex + LegacyRowsNullPreserved + AcceptsExplicitOrgID + NoFKToOrganizations + RegistryHasV29 + Idempotent) |
| ② | server `abac.HasCapability` 加 cross-org gate — `resolveScopeOrgID` 解析 channel:/artifact: scope; user.OrgID ≠ resourceOrgID 且都非空 → false 直返 (高于 wildcard 短路); NULL 兼容 (任一 NULL 走 AP-1 legacy 路径, 现网行为零变) | ✅ | REG-AP3-002 (CrossOrgUser_Rejected + CrossOrg_WildcardDoesNotShortCircuit + SameOrgUser_PermissionGranted + CrossOrgAgent_Rejected + LegacyNullOrgID_FallsThroughToAP1 + UserNullOrgID + WildcardScope_SkipsOrgGate) |
| ③ | 错码字面单源 — `ErrCodeCrossOrgDenied = "abac.cross_org_denied"` const byte-identical (跟 AP-1 capabilities.go const 路径同模式, 改 = 改 const 一处) | ✅ | REG-AP3-003 (ErrCodeCrossOrgDeniedConst 字面 byte-identical 锁) |
| ④ | admin god-mode 不入此路径 — admin 走 /admin-api/* 单独 mw (ADM-0 §1.3 红线), 反向 grep `admin.*HasCapability.*\.org` 在 internal/api/ count==0 | ✅ | REG-AP3-004 (AdminGodMode_NotInThisPath filepath.Walk 2 pattern 0 hit) |
| ⑤ | 反向 grep cross-org bypass 5 pattern + FK 不挂 + full-flow integration — internal/api/ 5 pattern (`cross.org.*bypass\|skip.*org.*check\|bypass.*org_id\|agent.*cross.*org.*permission\|agent.*org_id.*ignore`) 全 count==0 + migrations FK 反向 + same-org 200 / cross-org 403 + body 不漏 raw org_id | ✅ | REG-AP3-005 + 006 (ReverseGrep_NoCrossOrgBypass + NoFKOrganizations + FullFlow same-org 200 + cross-org 403 + body 不漏 org_id) |

## 2. 反向断言

- agent 不享 wildcard 短路 cross-org (跟 AP-1 立场 ② 同源 — wildcard 不短路 + cross-org gate 高于)
- NULL 兼容 legacy 行为零变 — 任一 NULL 走 AP-1 legacy 路径 (forward-only)
- FK 不挂 organizations(id) (业务校验 server 层, 跟 user.org_id 同精神)
- 改 = 改 abac.go 一处 (AP-1 SSOT 同精神 endpoint 0 行改)

## 3. 留账

⏸️ AP-3 client UI cross-org 防误授权 (蓝图 §1.5 v2+); ⏸️ G4.audit 飞马软 gate

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-30 | 烈马 | v0 — AP-3 acceptance ✅ SIGNED post-#521 merged. 5/5 验收 covers REG-AP3-001..006. 跨 milestone byte-identical: AP-1 SSOT 立场 ② + CV-1 channel.org_id + CM-3 #208 不变量 + BPP-1 #304 org sandbox + ADM-0 §1.3 红线. AP-1 #493 留账之一闭环. |
