# Acceptance Template — AP-1: ABAC scope 三层 + agent 严格 403 (Phase 4 entry 8/8)

> 蓝图: `docs/blueprint/auth-permissions.md` §1.2 (Scope 层级 v1 三层 — `*` / `channel:<id>` / `artifact:<id>` 全 ✅) + §1.4 (跨 org 只能减权 — owner-only) + §2 不变量 (Agent 默认最小 + Permission denied 走 BPP) + §5 与现状的差距 (artifact:<id> 渲染 + expires_at 列 schema 保留)
> Implementation: `docs/blueprint/auth-permissions.md` §1.2 字面承袭 (一 milestone 一 PR)
> 前置: AP-0 #177 ✅ + AP-0-bis #206 ✅ + ADM-0.2/0.3 cookie 拆 ✅ + Phase 4 ADM-1/2 ✅ · Owner: 战马C 三段全做 / 文案 野马 / 验收 烈马

## 验收清单

### 数据契约 (AP-1.1 schema v=24 — `expires_at` slot)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 1.1 user_permissions 加 `expires_at` 列 nullable (NULL = 永久, 蓝图 §1.2 字面 "schema 保留, UI 不做") | migration test | 战马C / 烈马 | `internal/migrations/ap_1_1_user_permissions_expires_test.go::TestAP11_AddsExpiresAtColumn` |
| 1.2 partial INDEX `idx_user_permissions_expires WHERE expires_at IS NOT NULL` (sweeper 热路径 v2+) | migration test | 战马C / 烈马 | `TestAP11_HasSparseIndex` |
| 1.3 NULL expires_at 合法 + 显式赋值合法 (现网行为零变 + 未来业务 slot 可用) | migration test | 战马C / 烈马 | `TestAP11_NullExpiresIsLegit` + `TestAP11_AcceptsExplicitExpires` |
| 1.4 v=24 sequencing 字面锁: AL-1b.1 v=21 / ADM-2.1 v=22 / ADM-2.2 v=23 / **AP-1.1 v=24** | registry pin | 战马C / 烈马 | `TestAP11_RegistryHasV24` |

### 行为不变量 (AP-1.2 server — 三层 scope + agent strict-403)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 2.1 `auth.ArtifactScope(r)` 解析 `artifact:{artifactId}` (跟 `channelScope` 同模式) | unit | 战马C / 烈马 | `internal/auth/abac_artifact_test.go::TestArtifactScope_ResolvesPathValue` |
| 2.2 agent 显式 (artifact.edit_content, artifact:art-1) 行 → 200 | unit | 战马C / 烈马 | `TestRequireAgentStrict403_AgentWithExplicitArtifactScope_Pass` |
| 2.3 反约束: agent 即使有 (*,*) wildcard 行 → 仍 403 (蓝图 §1.4 立场承袭) | unit | 战马C / 烈马 | `TestRequireAgentStrict403_AgentWithWildcardNoShortcut_403` (含 body.required_capability + body.current_scope BPP 路由字段) |
| 2.4 cross-artifact: agent 持 art-1 行访 art-2 → 403 | unit | 战马C / 烈马 | `TestRequireAgentStrict403_AgentCrossArtifact_403` |
| 2.5 human owner 享 wildcard 短路 (立场 ④ 区分 agent/human) | unit | 战马C / 烈马 | `TestRequireAgentStrict403_HumanWithWildcard_Pass` |
| 2.6 expires_at 已过 → reject (蓝图 §1.2 schema slot 守过期) | unit | 战马C / 烈马 | `TestRequireAgentStrict403_ExpiredPermission_403` + `TestRequireAgentStrict403_ExpiresFuture_Pass` |
| 2.7 `auth.HasAgentScope` BPP 路由 helper: 显式 hit → true / 跨 scope → false / wildcard 不短路 | unit | 战马C / 烈马 | `TestHasAgentScope_ScopeMatch` + `TestHasAgentScope_WildcardIgnored` |
| 2.8 401 unauthenticated guard | unit | 战马C / 烈马 | `TestRequireAgentStrict403_NoUser_401` |

### e2e 路径 (AP-1.2 真路由 wired)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 3.1 POST /api/v1/artifacts/{id}/commits 挂 RequireAgentStrict403("artifact.edit_content", ArtifactScope) | http e2e | 战马C / 烈马 | `internal/api/ap_1_2_artifacts_e2e_test.go::TestAP12_AgentNoGrant_403WithBPPRoutingHints` (403 + body 含 BPP 路由字段) |
| 3.2 agent 持显式 (artifact.edit_content, artifact:<id>) → 200 commit | http e2e | 战马C / 烈马 | `TestAP12_AgentWithExplicitGrant_200` |
| 3.3 cross-artifact: art-other grant 不放过 art-target → 403 | http e2e | 战马C / 烈马 | `TestAP12_AgentCrossArtifactGrant_403` |
| 3.4 human owner 不需显式 grant 仍 200 (wildcard 短路) | http e2e | 战马C / 烈马 | `TestAP12_HumanWildcardStillWorks_200` |

### 立场反查 (字典/反向 grep)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 4.1 agent wildcard 短路源自单点 helper, 不在 RequireAgentStrict403 路径出现 | reverse grep + docstring 锁 | 烈马 | `internal/auth/abac_artifact.go` 包级 docstring 立场反查 §; `TestAbacArtifact_ReverseGrepNoAgentWildcardShortcut` 守 future drift |

## 不在本轮范围 (蓝图 §6 字面承袭)

- **agent 创建/管理 UI** → 第 11 轮 (Client web SPA), 蓝图 §6 字面 "不在本轮范围"
- **bundle UI 形态** (modal / sidebar / inline) → 第 11 轮
- **expires_at 时间窗权限的具体语义** → v2+ (蓝图 §6 + §5 字面 "暂不业务化", 本 PR 仅落 schema slot + server 守过期)
- **permission_denied BPP frame 推送 + owner DM 一键 grant UI** → BPP-3 (Phase 5 frame round; 本 PR 落 server 端 403 body 含 `required_capability` + `current_scope` 字段供 future BPP 路由 consumer 用)
- **cross-org owner-only grant 强制** (AP-3) → 后续 milestone (本 PR 是 AP-1 ABAC 三层 + agent 严格 403, 跨 org grant 路径 admin handleGrantPermission 已锁 admin only)

## 退出条件

- 数据契约 4 项 (AP-1.1 ✅) + 行为不变量 8 项 (AP-1.2 ✅) + e2e 4 项 (AP-1.2 ✅) + 立场反查 1 项 (✅) **全绿** — 一票否决
- 现网回归不破: AP-0 / AP-0-bis / ADM-0.2 / 全部 internal/api 测试套 18s 全 PASS
- REG-AP1-001..011 + REG-AP1-101..104 共 **15** 行落 registry §3 + §5 总计 sync

## 更新日志

- 2026-04-29 — 战马C v0 初版: AP-1.1 schema v=24 (expires_at 列 + sparse index) + AP-1.2 server (ArtifactScope resolver + RequireAgentStrict403 + HasAgentScope BPP 路由 helper) + 4 e2e + 11 unit; 蓝图 §1.2 三层 + §1.4 agent 严格 403 + §2 BPP 路由 不变量字面承袭. Phase 4 entry 8/8.
