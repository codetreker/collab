# Phase 2 Regression Registry — must-stay-green 行清单

> 作者: 烈马 (QA) · 2026-04-28 · team-lead R3 派活
> 用途: Phase 2 任何后续 PR break 任一行 → CI block。
> 范围: Phase 2 工作 (#186 起) + R3 4 个新 milestone (ADM-0 / AP-0-bis / RT-0 / CM-onboarding) + INFRA-2。
> **不在范围**: Phase 1 (CM-1 / AP-0 / G1.audit) — 已在 G1 audit 闭合, 见
> [`docs/implementation/00-foundation/g1-audit.md`](../implementation/00-foundation/g1-audit.md), 引用即可不重抄。

---

## 1. 派生规则

1. **登记触发**: 每次 milestone PR merge 后, owner 在 24h 内把对应 `⚪ pending` 行翻成 `🟢 active`, 填 `Test path / grep` 实测路径。
2. **超时审计**: 漏 24h 未翻态, 烈马补 `🔶 audit-warning` 行, G2.audit 时一并审。
3. **回归 break**: CI run 中任意 `🟢 active` 行红 → PR block, owner 修不修都不能 merge。
4. **机器化要求**: 每行 **必须** 是 `Test path` (xxx_test.go::TestY) 或 `CI grep` (`grep -r '...' path/` count==N)。**人眼项不进 registry**, 留 G2.4 demo 签字单独走。
5. **维护责任**: registry 单 owner = 烈马; PR review 时 owner 补行, merge 后 24h 内翻态。

## 2. 状态图例

| Symbol | 含义 |
|---|---|
| 🟢 active | PR 已 merged + 测试已绿 + CI 持续跑 (这是回归红线) |
| ⚪ pending | acceptance template 已锁, 实测未落 (PR merge 前状态) |
| 🔶 audit-warning | merge 后 24h 未翻态, G2.audit 必查 |
| ⛔ broken | CI 当前红, 必须修复才能继续 |
| ⏸️ deferred | 延后 (附原因 + 哪个 milestone 接) |

---

## 3. Registry

### CM-4.x (已 merged)

| Reg ID | Source | Test path / grep | Owner | Trigger PR | Status |
|---|---|---|---|---|---|
| REG-CM4-001 | CM-4.0 #183 | `internal/store/agent_invitation_test.go` (13 illegal-transition cases) | 烈马 | #183 | 🟢 active |
| REG-CM4-002 | CM-4.0 #183 | `internal/migrations` schema_migrations v3 + agent_invitations CHECK 约束 | 烈马 | #183 | 🟢 active |
| REG-CM4-003 | CM-4.1 #185 | `internal/api/agent_invitations_test.go::TestAgentInvitations_E2E_Approve` (channel_members +1 断言) | 烈马 | #185 | 🟢 active |
| REG-CM4-004 | CM-4.1 #185 | `grep -r 'c.JSON.*AgentInvitation' internal/api/` count==0 (sanitizer fail-closed) | 烈马 | #185 | 🟢 active |
| REG-CM4-005 | CM-4.1 #185 | `internal/api/agent_invitations_test.go` 三层 authz (requester/owner/3rd-party 各路径) | 烈马 | #185 | 🟢 active |
| REG-CM4-006 | CM-4.2 #186 | `packages/client/src/__tests__/agent-invitations.test.ts` (9 cases vitest) | 烈马 | #186 | 🟢 active |
| REG-CM4-007 | CM-4.2 #186 | 同上 — 409 → ApiError catch + setErrorMsg 不调 load() | 烈马 | #186 | 🟢 active |
| REG-CM4-008 | CM-4.2 #186 | `tsc --noEmit` clean (packages/client) | 飞马 | #186 | 🟢 active |

### INFRA-2 (PR #195 merged, 7 🟢)

> 实测 audit 2026-04-28: scaffold 落 `packages/e2e/` (不是 packages/client/, 单独 workspace), CI `e2e` job 已并入 `.github/workflows/ci.yml`。

| Reg ID | Source | Test path / grep | Owner | Trigger PR | Status |
|---|---|---|---|---|---|
| REG-INF2-001 | infra-2.md config | `find packages/e2e -name 'playwright.config.*'` count==1 (`packages/e2e/playwright.config.ts`) | 战马 | #195 | 🟢 active |
| REG-INF2-002 | infra-2.md config | `grep '@playwright/test' packages/e2e/package.json` count==1 (^1.50.0) + pnpm-lock 同步 | 战马 | #195 | 🟢 active |
| REG-INF2-003 | infra-2.md smoke | `pnpm --filter @borgee/e2e test` exit==0 + `packages/e2e/tests/smoke.spec.ts` 登录页 DOM ≥1 assert (附 cm-onboarding.spec.ts 含 stopwatch fixture) | 战马 | #195 | 🟢 active |
| REG-INF2-004 | infra-2.md command | `grep '"test"' packages/e2e/package.json` count==1 ("playwright test") + workspace command `pnpm --filter @borgee/e2e test` | 战马 | #195 | 🟢 active |
| REG-INF2-005 | infra-2.md CI | `.github/workflows/ci.yml::e2e` job 含 `playwright install --with-deps chromium` step + chromium binary cache | 飞马 | #195 | 🟢 active |
| REG-INF2-006 | infra-2.md CI | `.github/workflows/ci.yml::e2e` job + `playwright-report/` artifact 上传 (与 go-test/lint 并列 PR check) | 飞马 | #195 | 🟢 active |
| REG-INF2-007 | infra-2.md fixture | `packages/e2e/fixtures/` 含 stopwatch + per-test fresh sqlite (testutil.OpenSeeded webServer fixture) | 战马 | #195 | 🟢 active |

### ADM-0 (PR #197 / #201 / #223 merged, 7 🟢 / 3 ⚪ 飞马 schema 待补)

> 拆 3 段 PR (ADM-0.1 / ADM-0.2 / ADM-0.3), 每行标 trigger PR sub-id 落地后回填。

| Reg ID | Source | Test path / grep | Owner | Trigger PR | Status |
|---|---|---|---|---|---|
| REG-ADM0-001 | adm-0.md 4.1.a | `internal/server/auth_isolation_test.go::TestAuthIsolation_2A_AdminSessionRejectedByUserRail` (admin cookie → /api/v1/users/me + /api/v1/channels 双 401) | 烈马 | ADM-0.2 (#201) | 🟢 active |
| REG-ADM0-002 | adm-0.md 4.1.b | `internal/server/auth_isolation_test.go::TestAuthIsolation_2B_UserTokenRejectedByAdminRail` (member + users.role=admin 双 borgee_token → /admin-api/v1/users 401 + legacy /api/v1/admin/* 不再 200) | 烈马 | ADM-0.2 (#201) | 🟢 active |
| REG-ADM0-003 | adm-0.md 4.1.c | `internal/admin/handlers_field_whitelist_test.go::TestAdminFieldWhitelist_GodModeEndpointsAreMetadataOnly` god-mode 4 endpoints fail-closed reflect scan, 禁字 body/content/text/artifact | 烈马 | ADM-0.2 (#201) | 🟢 active |
| REG-ADM0-004 | adm-0.md 4.1.d | `internal/migrations/adm_0_3_users_role_collapse_test.go::TestADM03_BackfillAndCollapse` post-migration `users WHERE role='admin'` count==0 (3.A 反向断言) + `TestADM03_TolerantToTrimmedSchema` + `TestADM03_NoUsersTable` 容错 | 战马 | ADM-0.3 (#223) | 🟢 active |
| REG-ADM0-005 | adm-0.md 4.1.e (#189 加补) | `internal/migrations/adm_0_3_users_role_collapse_test.go::TestADM03_BackfillAndCollapse` step-2 sessions DELETE gate (v0 无 sessions 表故 vacuous, hasTable gate 容错) + step-3 user_permissions 孤儿清扫 (3.C 反向断言); session-revoke E2E 反向断言后置至 BPP 引入 sessions 表后再补 | 烈马 | ADM-0.3 (#223) | 🟢 active |
| REG-ADM0-006 | adm-0.md schema | `admins` 表 schema fields (id/login/password_hash/created_at/created_by/last_login_at) | 飞马 | ADM-0.1 | ⚪ pending |
| REG-ADM0-007 | adm-0.md schema | 数据不变量等价 CHECK: `internal/migrations/adm_0_3_users_role_collapse_test.go::TestADM03_BackfillAndCollapse` post-collapse `users.role ∈ {'member','agent'}` (SQLite 不支持 ADD CONSTRAINT CHECK post-create, v1 hard-flip via CREATE TABLE _new + RENAME 后置, audit row 登记 G2-ADM03-b) | 飞马 | ADM-0.3 (#223) | 🟢 active |
| REG-ADM0-008 | adm-0.md §1.2 | `grep -rE '/admin-api/.*/promote' internal/` count==0 (B env bootstrap, 无 promote) | 飞马 | ADM-0.1 | ⚪ pending |
| REG-ADM0-009 | adm-0.md fixture | `testutil/server.go` 删 `role=admin` user fixture, 改 `SeedAdmin` | 飞马 | ADM-0.1 | ⚪ pending |
| REG-ADM0-010 | adm-0.md regression | 已 merged admin SPA 测试 (≥ 8 个) 改 fixture 后 CI 全绿: `go test ./... -p 1 -count=1 -timeout 5m` 16 packages green (PR #223 实跑); testutil/server.go owner+admin fixture 翻 `Role:"member"` + `(*, *)` wildcard 通过 `GrantDefaultPermissions("member")` 注入 | 烈马 | ADM-0.3 (#223) | 🟢 active |

### AP-0-bis (PR #206 merged, 6 🟢)

| Reg ID | Source | Test path / grep | Owner | Trigger PR | Status |
|---|---|---|---|---|---|
| REG-AP0B-001 | ap-0-bis.md 数据契约 | `internal/store/store_coverage_test.go::TestDefaultPermissionsAgent` 断言 agent 默认 `[message.send, message.read]` 2 行 | 战马 | #206 | 🟢 active |
| REG-AP0B-002 | ap-0-bis.md backfill | `internal/migrations/ap_0_bis_message_read_test.go::TestAP0Bis_BackfillsMessageReadForLegacyAgents` (用 SeedLegacyAgent + post-Up assert `(agent_id, 'message.read', '*')` 行存在) | 战马 | #206 | 🟢 active |
| REG-AP0B-003 | ap-0-bis.md backfill | `internal/migrations/ap_0_bis_message_read_test.go::TestAP0Bis_Idempotent` (re-run v=8 不重复插入 — v0 forward-only 契约下替代 Down 回滚断言) | 战马 | #206 | 🟢 active |
| REG-AP0B-004 | ap-0-bis.md gate | `internal/api/messages_perm_test.go::TestGetMessages_LegacyAgentNoReadPerm_403` (反向 + 配套正向 `TestGetMessages_AgentWithReadPerm_200`) | 战马 | #206 | 🟢 active |
| REG-AP0B-005 | ap-0-bis.md helper | `internal/testutil/server.go::SeedLegacyAgent` 存在 + godoc (helper 同文件 SeedAgent/SeedAdmin 一致, 未独立 seed_legacy_agent.go) | 飞马 | #206 | 🟢 active |
| REG-AP0B-006 | ap-0-bis.md cap list | `grep -n '"message.read"' packages/server-go/internal/store/queries.go` count==1 (canonical list at `GrantDefaultPermissions` line 375 — 项目无 `auth/capabilities.go`, 默认权限 source-of-truth 在 store) | 飞马 | #206 | 🟢 active |

### RT-0 (6 🟢 / 2 ⚪)

| Reg ID | Source | Test path / grep | Owner | Trigger PR | Status |
|---|---|---|---|---|---|
| REG-RT0-001 | rt-0.md schema | `packages/server-go/internal/ws/event_schemas.go::AgentInvitationPendingFrame` 7 字段顺序 (type/invitation_id/requester_user_id/agent_id/channel_id/created_at/expires_at) JSON tag 与 PR #218 client TS interface byte-identical; lock by `internal/ws/push_agent_invitation_test.go::TestAgentInvitationPendingFrame_WireSchema` | 飞马 / 烈马 | #237 | 🟢 active |
| REG-RT0-002 | rt-0.md schema | `AgentInvitationDecidedFrame` 4 字段 (type/invitation_id/state/decided_at) — `TestAgentInvitationDecidedFrame_WireSchema` + `TestAgentInvitationPendingFrame_ZeroExpiresIsSentinel` (expires_at 0 sentinel 跟 client `required: number` 对齐) | 飞马 / 烈马 | #237 | 🟢 active |
| REG-RT0-003 | rt-0.md schema | `grep -n "byte-identical" packages/server-go/internal/ws/event_schemas.go` count≥1 (Phase 4 BPP cutover 注释锁, "client handler 0 改" 承诺) | 飞马 | #237 | 🟢 active |
| REG-RT0-004 | rt-0.md hub | `packages/server-go/internal/api/agent_invitations_push_test.go::TestPushOnCreate_PendingFrameToAgentOwner` (POST 触发 hub.PushAgentInvitationPending(agent.OwnerID, frame) call==1, fakeInvitationPusher 锁 frame 字段) | 战马 / 烈马 | #237 | 🟢 active |
| REG-RT0-005 | rt-0.md hub | `TestPushOnPatch_DecidedFrameToBothParties` (PATCH 触发双推: requester + agent.owner 各 1 次, 跨设备同步 §1.4) + `TestPushNilHub_NoPanic` (handler 在 nil-Hub 下 silent no-op) | 战马 / 烈马 | #237 | 🟢 active |
| REG-RT0-006 | rt-0.md client | `packages/client/src/__tests__/ws-invitation.test.ts` 6/6 PASS (jsdom env, 599ms): dispatchInvitationPending/Decided 各 2 case + 3 terminal state round-trip + event-name lock `borgee:invitation-pending` / `borgee:invitation-decided` | 战马 / 烈马 | #218+#235 | 🟢 active |
| REG-RT0-007 | rt-0.md fallback | E2E: ws disconnect 60s → polling 兜底 (#189 加补) | 烈马 | RT-0 | ⚪ pending |
| REG-RT0-008 | rt-0.md latency | E2E Playwright stopwatch: 邀请 → owner 通知 ≤ 3s — `packages/e2e/tests/cm-4-realtime.spec.ts` flip `.skip` + 真 fixture (owner 注册+建 agent / requester 注册+建 channel / POST /api/v1/agent_invitations) + 截屏 `docs/qa/screenshots/g2.4-realtime-latency.png` 钉; local pass 910ms ≤ 3000ms hardline | 烈马 | #239 | 🟢 active |
| REG-RT0-009 | #239 加补 rate-limit bypass 双 gate | `internal/server/server_test.go::TestRateLimitBypass_RequiresBothHeaderAndDevMode` 5-row matrix 钉 {dev+header→bypass, dev-only/header-only/neither/header≠"1"→enforce}; 反向: 单 gate 禁止 (prod header DoS bypass + dev silent client bug 双防线) | 烈马 | #239 | 🟢 active |

### CM-onboarding (派活, 4 🟢 / 9 ⚪)

| Reg ID | Source | Test path / grep | Owner | Trigger PR | Status |
|---|---|---|---|---|---|
| REG-CMO-001 | cm-onboarding.md tx | `internal/api/auth_test.go::TestRegister_CreatesWelcomeChannel_SameTx` (org+user+#welcome+member+system msg 同事务) | 战马 | CM-onboarding | ⚪ pending |
| REG-CMO-002 | cm-onboarding.md tx | host-bridge/push 故障注入不影响注册成功 | 战马 | CM-onboarding | ⚪ pending |
| REG-CMO-003 | cm-onboarding.md kind | `internal/store/welcome_test.go::TestCreateWelcomeChannelForUser_Success` (quick_action 列写入 + JSON 形态) + `packages/client/src/components/MessageItem.tsx` 解析 `{kind,label,action}` + e2e `button.message-system-quick-action` 可见 | 战马 | #203 | 🟢 active |
| REG-CMO-004 | cm-onboarding.md E2E | `packages/e2e/tests/cm-onboarding.spec.ts` (auto-select welcome — `.message-system-content` 渲染即等价 selectedChannelId==welcome) | 战马 | #203 | 🟢 active |
| REG-CMO-005 | cm-onboarding.md E2E | `packages/e2e/tests/cm-onboarding.spec.ts` toContainText("欢迎来到 Borgee") + button toHaveText("创建 agent") | 战马 | #203 | 🟢 active |
| REG-CMO-006 | cm-onboarding.md E2E | Playwright 步骤 3-4: AgentManager 3 步 + toast "🎉 {name} 已加入你的团队" | 烈马 | CM-onboarding | ⚪ pending |
| REG-CMO-007 | cm-onboarding.md E2E | Playwright 步骤 5: 左栏 agent 行 + subject "正在熟悉环境…" | 烈马 | CM-onboarding | ⚪ pending |
| REG-CMO-008 | cm-onboarding.md error | E2E: register 500 → DOM "正在准备你的工作区, 稍候刷新…" + [重试] | 烈马 | CM-onboarding | ⚪ pending |
| REG-CMO-009 | cm-onboarding.md error | E2E: 名字重复 inline error | 烈马 | CM-onboarding | ⚪ pending |
| REG-CMO-010 | cm-onboarding.md error | E2E: runtime 503 → 创建按钮仍可点 + agent 行 "故障 (runtime_unreachable)" | 烈马 | CM-onboarding | ⚪ pending |
| REG-CMO-011 | cm-onboarding.md §11 grep | `grep -r "👈 选择频道\|👈 选择一个频道" packages/client/src/` count==0 (App.tsx 替成 "正在准备你的工作区, 稍候刷新…") | 战马 | #203 | 🟢 active |
| REG-CMO-012 | cm-onboarding.md §11 forbidden | `docs/qa/forbidden-strings.txt` 存在 + CI lint 引用 | 飞马 | CM-onboarding | ⚪ pending |
| REG-CMO-013 | cm-onboarding.md CODEOWNERS | `.github/CODEOWNERS` 含 `onboarding-journey.md @yema` (PR #192) | 烈马 | #192 | 🟢 active |

### Sanitizer / 不变量 (跨 milestone)

| Reg ID | Source | Test path / grep | Owner | Trigger PR | Status |
|---|---|---|---|---|---|
| REG-INV-001 | CM-4.1 + Phase 1 | `grep -rE 'c.JSON.*\b(User\|AgentInvitation)\b' internal/api/` count==0 | 飞马 | (持续) | 🟢 active |
| REG-INV-002 | ADM-0 4.1.c | `internal/admin/handlers_field_whitelist_test.go` god-mode response 反射扫描 fail-closed (含未来新增 endpoint 自动覆盖, forbidden={body,content,text,artifact}) | 烈马 | ADM-0.2 (#201) | 🟢 active |
| REG-INV-003 | bug-030 (CM-onboarding 后置) | unit: `internal/store/welcome_test.go::TestListChannelsWithUnread_IncludesSystemWelcome` 双断言 (本人看见 type='system' #welcome + 别人看不见 — membership LEFT JOIN gate); `grep -n "c.type IN" internal/store/queries.go` count≥1 含 'system'. e2e: `packages/e2e/tests/cm-onboarding-bug-030-regression.spec.ts` (#226) 三断言 (A/B 各 1 行 system + IDs 不同 + 双向无跨泄漏 + ≤5s 预算) | 烈马 | #203 + bug-030 fix 22ed221 + #226 | 🟢 active |

### AL-1a (PR #249, 5 🟢)

| Reg ID | Source | Test path / grep | Owner | Trigger PR | Status |
|---|---|---|---|---|---|
| REG-AL1A-001 | agent-lifecycle.md §2.3 三态 + 优先级 | `internal/agent/state_test.go::TestTracker_DefaultOffline` + `TestTracker_OnlineWhenPluginPresent` + `TestTracker_ErrorOverridesPresence` (error > online > offline 锁); `grep -nE "StateOnline\|StateOffline\|StateError" internal/agent/state.go` 字面常量 3 行 | 烈马 | #249 | 🟢 active |
| REG-AL1A-002 | agent-lifecycle.md §2.3 6 reason codes | `internal/agent/state_test.go::TestClassifyProxyError` 12 case 矩阵 (401/429/5xx/timeout/api key/connection refused/unknown 路径); `grep -nE "Reason(APIKeyInvalid\|QuotaExceeded\|NetworkUnreachable\|RuntimeCrashed\|RuntimeTimeout\|Unknown)" internal/agent/state.go` count==6 | 烈马 | #249 | 🟢 active |
| REG-AL1A-003 | agent-lifecycle.md §2.4 disabled / fold state into JSON | `internal/api/agents_state_test.go::TestWithState_OnlineFromProvider` + `TestWithState_ErrorWithReason` + `TestWithState_DisabledAlwaysOffline` + `TestWithState_NilProviderFallsBackToOffline` (handler 4 角覆盖 + nil-provider fallback offline 不 panic) | 烈马 | #249 | 🟢 active |
| REG-AL1A-004 | agent-lifecycle.md §2.3 故障旁路 | `internal/api/agents_state_test.go::TestAgentStateClassify_Wiring` + `agents.go:430` `agent_state_classify` + `AgentRuntimeSetter` cast best-effort; `grep -n "agent_state_classify(status" internal/api/agents.go` count≥1 (ProxyPluginRequest 出错路径触发) | 烈马 | #249 | 🟢 active |
| REG-AL1A-005 | 野马 #190 §11 文案锁 | `packages/client/src/__tests__/agent-state.test.ts` 8 it (online→在线 / offline→已离线 / undefined→已离线 不糊弄 / error+reason→故障(中文 label) / error 无 reason→故障(未知错误) 不准空括号 / REASON_LABELS 6 keys 排序锁); 字面绑定 `lib/agent-state.ts::REASON_LABELS` ↔ server `state.go::Reason*` 常量 | 烈马 | #249 | 🟢 active |

### CHN-1 channel schema + API + client (PR #276 + #286 + #288 merged, 9 🟢 + 1 ⏸️)

| Reg ID | Source | Test path / grep | Owner | Trigger PR | Status |
|---|---|---|---|---|---|
| REG-CHN1-001 | channel-model.md §1.4 + §2 schema drift (CHN-1.1) | `internal/migrations/chn_1_1_channels_org_scoped_test.go` 6 test 全 PASS (`TestCHN11_AddsArchivedAtAndSilentColumns` / `TestCHN11_DropsGlobalNameUniqueAndAddsPerOrgIndex` / `TestCHN11_HardFailsOnHistoricDuplicateNoAutoRename` / `TestCHN11_BackfillsAgentSilentAndOrgIDAtJoin` / `TestCHN11_IsIdempotentOnRerun` / `TestCHN11_ToleratesTrimmedSchema`); `grep -n "idx_channels_org_id_name" packages/server-go/internal/migrations/` count≥1 | 战马A / 烈马 | #276 (b6e95ce) | 🟢 active |
| REG-CHN1-002 | channel-model.md §1.1 creator-only default | `internal/api/chn_1_2_test.go::TestCHN12_CreatorOnlyDefaultMember` (POST /channels 后 channel_members count==1) | 战马A / 烈马 | #286 (f7ac4ed) | 🟢 active |
| REG-CHN1-003 | channel-model.md §1.4 per-org name uniqueness | `chn_1_2_test.go::TestCHN12_CrossOrgSameNameOK` (orgA + orgB 同名共存) | 战马A / 烈马 | #286 | 🟢 active |
| REG-CHN1-004 | channel-model.md §1.4 跨 org 隔离双轴 | `chn_1_2_test.go::TestCHN12_CrossOrgPublicGETIsolation` (GET 单 channel ≠ 200 + LIST 不含他 org, `SeedForeignOrgUser`) | 烈马 | #286 | 🟢 active |
| REG-CHN1-005 | channel-model.md §2 archive fanout 文案锁 | `chn_1_2_test.go::TestCHN12_ArchiveFanoutSystemDM` 字面 prefix `channel #{name} 已被 ` + infix ` 关闭于 `; `grep -n "已被.*关闭于" packages/server-go/internal/api/channels.go` count≥1 (line 1073) | 战马A / 烈马 | #286 | 🟢 active |
| REG-CHN1-006 | channel-model.md §2 agent silent join (立场 ⑥) | `chn_1_2_test.go::TestCHN12_AgentJoinSystemMessage` (system DM `{agent_name} joined` + sender_id='system' + ChannelMember.Silent==true); `grep -n "joined" packages/server-go/internal/api/channels.go` 含 line 1029 字面 `agentName + " joined"` | 战马A / 烈马 | #286 | 🟢 active |
| REG-CHN1-007 | AP-1 严格 403 回填 (留账) | `chn_1_2_test.go::TestCHN12_NonOwnerPATCH403` 当前仅 guard 5xx + 注释明示 AP-0 grants member (\*,\*); AP-1 落时 flip 改断 `status==403` (Phase 4) | 烈马 | AP-1 (待) | ⏸️ deferred |
| REG-CHN1-008 | channel-model.md §1.1 client SPA 创建频道 dialog default-public + creator-only | `packages/e2e/tests/chn-1-3-channel-list.spec.ts::立场 ① create channel via dialog → default public + creator-only` (radio `input[value="public"]` checked + GET /channels/:id/members length==1) | 战马A / 烈马 | #288 (adaf521) | 🟢 active |
| REG-CHN1-009 | 立场 ⑥ client UI silent agent badge + system message | `chn-1-3-channel-list.spec.ts::立场 ② agent silent badge + "joined" system message` 字面 `{agent_name} joined` + members.silent==true; `grep -n "🔕 silent" packages/client/src/components/ChannelMembersModal.tsx` count≥1 (line 195 `<span class="user-badge user-badge-silent">🔕 silent</span>`) | 战马A / 烈马 | #288 | 🟢 active |
| REG-CHN1-010 | channel-model.md §2 client UI archive 状态 + system DM | `chn-1-3-channel-list.spec.ts::立场 ③ archive PATCH → row rendered as archived + system DM` (`.channel-item[data-archived="true"]` + `.archived-badge` 文本 `已归档` + page text 含 `channel #{name} 已被 ` 前缀); `grep -n "已归档" packages/client/src/components/SortableChannelItem.tsx` count≥2 (line 59 + 85) + `grep -n "channel-item-archived" packages/client/src/index.css` count≥1 | 战马A / 烈马 | #288 | 🟢 active |

### RT-1 realtime cursor + backfill + BPP resume (PR #290 merged RT-1.1, 5 🟢 + 5 ⚪)

| Reg ID | Source | Test path / grep | Owner | Trigger PR | Status |
|---|---|---|---|---|---|
| REG-RT1-001 | rt-1.md §1.a 100 并发 cursor 严格递增 | `internal/ws/cursor_test.go::TestCursorMonotonicUnderConcurrency` (`-race` + 100 goroutine + set 去重 + max==N) | 战马A / 烈马 | #290 (d1538f5) | 🟢 active |
| REG-RT1-002 | rt-1.md §1.b 重复 (artifact_id, version) 同 cursor + 32 racer 折叠 | `cursor_test.go::TestCursorIdempotentSameArtifactVersion` (results 全等 results[0] + fresh=false 二次 + 不同 version 严格递增) | 战马A / 烈马 | #290 | 🟢 active |
| REG-RT1-003 | rt-1.md §1.c restart 不回退 (fixture) | `cursor_test.go::TestCursorNoRollbackAfterRestart` (pre-seed 3 → fresh allocator PeekCursor==3 + Next>MAX) | 战马A / 烈马 | #290 | 🟢 active |
| REG-RT1-004 | rt-1.md §1.d ArtifactUpdated frame byte-identical 于 #237 envelope | `cursor_test.go::TestArtifactUpdatedFrameFieldOrder` json.Marshal byte-equality vs literal want (字段顺序 type/cursor/artifact_id/version/channel_id/updated_at/kind 锁) | 飞马 / 烈马 | #290 | 🟢 active |
| REG-RT1-005 | rt-1.md §4.a 字段名锁 `updated_at` 不混 `timestamp` | `grep -rEn 'artifact_updated.*timestamp\|"timestamp".*artifact_updated' packages/server-go/ packages/client/` count==0 (RT-1.1 实测干净, cursor.go 仅注释引述) | 飞马 / 烈马 | #290 | 🟢 active |
| REG-RT1-006 | rt-1.md §2.a client backfill latency ≤3s | `packages/e2e/tests/rt-1-2-backfill-on-reconnect.spec.ts::立场 ① offline 5s → reconnect → backfill within 3s` (`expect.poll(timeout:3_000)` + latency<3000ms 字面断言 + URL 含 since=N) | 战马A / 烈马 | #292 | 🟢 active |
| REG-RT1-007 | rt-1.md §2.b 离线后 reconnect backfill 齐序 | `rt-1-2-backfill-on-reconnect.spec.ts::立场 ①` (`setOffline(true)` 5s + reconnect + 验 response body 逐 ev `cursor>since` 反约束); 完整 ArtifactUpdated 链路 (`30s × 5 commit`) 待 CV-1 artifact 表 (Phase 3+) | 战马A / 烈马 | #292 | 🟢 active |
| REG-RT1-008 | rt-1.md §2.c sessionStorage 持久化 + monotonic + cold start 反约束 | `packages/client/src/__tests__/last-seen-cursor.test.ts` 5 vitest (round-trip / 拒小+等于 / page reload 存活 / NaN+Infinity+负数+0 拒 / 损坏 storage clamp 0) + `rt-1-2-backfill-on-reconnect.spec.ts::立场 ② cold start does NOT auto-pull` (`page.on('request')` 1500ms idle `toHaveLength(0)` 反约束) + server `events_backfill_test.go::missing_since_400 + invalid_since_400 + unauth_401` 防御三 case | 战马A / 烈马 | #292 | 🟢 active |
| REG-RT1-009 | rt-1.md §3.a-c agent BPP session.resume 三 hint + 反向 grep + envelope byte-identical | `internal/bpp/session_resume_test.go::TestResolveResumeIncremental + None + Full + UnknownModeFallsBackIncremental` 三 hint + `TestParseResumeModeNeverDefaultsFull` (11 种坏输入字面 parse 锁 NEVER full) + `TestResolverNeverDefaultsToFullBranch` (7 种行为分支锁 ack.Count 反向断言) + `TestSessionResumeFrameFieldOrder` golden JSON 字面 byte-equality (`{"type":"session.resume","mode":"incremental","since":42}` + ack `{"type":"session.resume_ack","count":3,"cursor":99}`) | 战马A / 飞马 / 烈马 | #296 | 🟢 active |
| REG-RT1-010 | rt-1.md §4.b 人/agent 拆 replay 反向断言 | `grep -rEn 'replay_mode.*="full"\|defaultReplayMode\|default.*ResumeModeFull' packages/server-go/internal/bpp/ --exclude='*_test.go'` 仅命中 `session_resume.go:10` 文件头注释自身 (战马A 主动写入当 grep 锚, 非 leak); resolver 走 `EventLister.GetEventsSince` 接口直查 store, 不复用 client REST `wsClient.backfill` | 飞马 / 烈马 | #296 | 🟢 active |

### AL-3 presence (PR #310 merged AL-3.1, 5 🟢 + 5 ⚪ AL-3.2/3.3 待实施)

| Reg ID | Source | Test path / grep | Owner | Trigger PR | Status |
|---|---|---|---|---|---|
| REG-AL3-001 | al-3.md §1.1 schema 三轴 (PK / NOT NULL / 多列) | `internal/migrations/al_3_1_presence_sessions_test.go::TestAL31_CreatesPresenceSessionsTable` (PK `id` AUTOINCREMENT + `session_id`/`user_id`/`connected_at`/`last_heartbeat_at` NOT NULL + `agent_id` nullable + 表存在断言) | 战马A / 烈马 | #310 (685dc15) | 🟢 active |
| REG-AL3-002 | al-3.md §1.1 UNIQUE(session_id) | `al_3_1_presence_sessions_test.go::TestAL31_RejectsDuplicateSessionID` (重复 session_id INSERT → reject) | 战马A / 烈马 | #310 | 🟢 active |
| REG-AL3-003 | al-3.md §1.1 multi-session 合法 (web+mobile+plugin, 立场 ⑥ 隐藏多端) | `al_3_1_presence_sessions_test.go::TestAL31_AllowsMultiSessionPerUser` (同 user_id 多 session_id 共存, 上层 IsOnline 仍单 bool) | 战马A / 烈马 | #310 | 🟢 active |
| REG-AL3-004 | al-3.md §1.1 INDEX 双轴 (full user_id + partial agent_id) | `al_3_1_presence_sessions_test.go::TestAL31_HasUserIDIndex` (`idx_presence_sessions_user_id` full + `idx_presence_sessions_agent_id` partial WHERE agent_id IS NOT NULL — DM-2 mention 路径热查) | 战马A / 烈马 | #310 | 🟢 active |
| REG-AL3-005 | al-3.md §1.2 contract 接口签名编译期锁 | `internal/presence/tracker.go:111` 编译期 `var _ PresenceTracker = (*SessionsTracker)(nil)` (read 端 `IsOnline` + `Sessions` 字面 byte-identical 于 #277 contract.go); `al_3_1_presence_sessions_test.go::TestAL31_Idempotent` (migration rerun no-op) | 战马A / 烈马 | #310 | 🟢 active |
| REG-AL3-006 | al-3.md §2.1 WS hub onConnect/onDisconnect 写端 (panic defer + agent_id partial + TrackOnline 失败仅 log 不阻断) | `internal/ws/hub_presence_test.go::TestPresenceLifecycle_HumanRegisterTrackOnline` + `TestPresenceLifecycle_AgentRoleSetsAgentID` + `TestPresenceLifecycle_DeferUntrackOnPanic` + `TestPresenceLifecycle_TrackOnlineFailureDoesNotAbort` + `TestPresenceLifecycle_NilWriterIsNoop` | 战马A / 烈马 | #317 | 🟢 active |
| REG-AL3-007 | al-3.md §2.2 multi-session last-wins (web+mobile+plugin 任一存活即 IsOnline=true; 单 session close 不误判 offline) | `internal/ws/hub_presence_test.go::TestPresenceLifecycle_MultiSessionLastWins` + `internal/presence/tracker_test.go::TestTrackOffline_MultiSessionLastWins` + `TestTrackOffline_UnknownSessionIsSoftNoop` + `TestTrackOnline_DuplicateSessionIDIsUnique` + `TestTrackOnline_RejectsEmptyArgs` | 战马A / 烈马 | #317 | 🟢 active |
| REG-AL3-008 | al-3.md §2.4 5s 节流 + 60s 心跳超时 (clock fixture) + §2.5 `presence.changed` frame 字段白名单 (无 last_heartbeat_at / connection_count / endpoints[]) — 留 AL-3.x server push frame | TBD AL-3.x server push frame | 战马A / 烈马 | TBD | ⚪ pending |
| REG-AL3-009 | al-3.md §2.3 单一 IsOnline 真源 (AST 反向 grep `internal/ws/` 非测试 .go 不出现 `presence_sessions` 字面量, 强制走 `PresenceWriter` 接口) | `internal/ws/hub_presence_grep_test.go::TestPresenceLifecycle_NoDirectTableRead` (go/parser scan) + `internal/presence/writer.go` PresenceWriter interface + 编译期 `var _ PresenceWriter = (*SessionsTracker)(nil)` | 飞马 / 烈马 | #317 | 🟢 active |
| REG-AL3-010 | al-3.md §3.1 client UI dot DOM lock (offline default) + §5.4 sibling-text 守 | `packages/client/src/__tests__/PresenceDot.test.tsx` (DOM 字面 `data-presence={online,offline,error}` + 6 reason codes byte-identical w/ #305) + `packages/e2e/tests/al-3-3-presence-dot.spec.ts::§3.1 default offline + §3.2 only-agent reverse` (admin 派 invite → owner 注册+建 agent → SPA AgentManager `[data-presence="offline"]` 直查 + `.presence-dot.presence-offline` class 字面锁 + 文本 "已离线" + reverse `[data-role="user"][data-presence]` count==0) + `presence-reverse-grep.test.ts::§5.4 .presence-dot 必带 sibling text` | 战马A / 烈马 | #324 | 🟢 active |
| REG-AL3-010b | al-3.md §3.1 online/error e2e + §3.4 cross-org | 等 §2.5 server `presence.changed` push frame 落地 (REG-AL3-008) 后补 e2e online + 6 error reason 三 case + cross-org orgA-channel-邀-orgB-agent | 战马A / 烈马 | TBD AL-3.x | ⚪ pending |
| REG-AL3-010c | al-3.md §2.4 client 5s 节流 + cache always fresh | `packages/client/src/__tests__/presence.test.ts` 7 it (cache fresh / 同状态 dedup / 跨窗口立即通知 / 窗口内 burst → trailing flush 折叠到最新值 / 多 agent anchor 独立 / 空 agentID 防御 / `PRESENCE_THROTTLE_MS===5000` 字面锁); fake clock fixture (G2.3 节流模式同) | 战马A / 烈马 | #324 | 🟢 active |
| REG-AL3-010d | al-3.md §5.1 反向 grep busy/idle (client) + §3.2 import-site 白名单 | `packages/client/src/__tests__/presence-reverse-grep.test.ts` 4 it: §5.1 PRESENCE_FILES (PresenceDot.tsx/usePresence.ts/agent-state.ts) 不出 `busy/idle/StateBusy/StateIdle/忙/空闲` + §3.2 PresenceDot import 仅在 PresenceDot/Sidebar/ChannelMembersModal/AgentManager + usePresence/markPresence import 仅 5 处白名单 + §5.4 PresenceDot.tsx 含 presence-text/sr-only 双 sibling | 飞马 / 烈马 | #324 | 🟢 active |
| REG-AL3-010e | al-3.md §3.1 接入点 (Sidebar DM agent / ChannelMembersModal agent / AgentManager badge) | `grep -n "PresenceDot" packages/client/src/components/{Sidebar,ChannelMembersModal,AgentManager}.tsx` 3 处命中 (仅 `peer.role==='agent'` / `m.role==='agent'` 路径条件渲染); `data-role={...==='agent'?'agent':'user'}` 字面锁让 §3.2 反查可断言 | 战马A / 烈马 | #324 | 🟢 active |
| REG-AL3-011 | al-3.md §4.1 admin god-mode 元数据白名单 + §4.2 跨 org 默认 false | TBD ADM-2 实施 | 战马A / 烈马 | TBD | ⚪ pending |

### AL-4 (acceptance template + stance + 文案锁 已锁, 实施待 AL-3.3 后接力, 0 🟢 / 10 ⚪)

> Acceptance: `acceptance-templates/al-4.md` (#318 skeleton + #320-after 此 PR §2.7 / §3 patch). Stance: `al-4-stance-checklist.md` (#319 v0). 文案锁: `al-4-content-lock.md` (#321 G2.7 demo 预备). Spec brief: `implementation/modules/al-4-spec.md` (#313). 实施 AL-4.1/4.2/4.3 等 AL-3.3 落地后战马A 接力.

| Reg ID | Source | Test path / grep | Owner | Trigger PR | Status |
|---|---|---|---|---|---|
| REG-AL4-001 | al-4.md §1.1 schema 9 列三轴 (PK / agent_id UNIQUE FK / endpoint_url / process_kind / status / last_error_reason / last_heartbeat_at / created_at / updated_at) + pragma 字面 9 列断言 | `internal/migrations/al_4_1_agent_runtimes_test.go::TestAL41_CreatesAgentRuntimesTable` | 战马 / 烈马 | TBD AL-4.1 | ⚪ pending |
| REG-AL4-002 | al-4.md §1.2 CHECK 双 (`process_kind` ∈ {openclaw,hermes} v1 仅 openclaw 字面 / `status` ∈ {registered,running,stopped,error}) + 反向 INSERT 异值 reject | `al_4_1_agent_runtimes_test.go::TestAL41_RejectsInvalidProcessKind` + `TestAL41_RejectsInvalidStatus` | 战马 / 烈马 | TBD AL-4.1 | ⚪ pending |
| REG-AL4-003 | al-4.md §1.3 UNIQUE(agent_id) 单 runtime per agent (#319 立场 ⑥ multi-runtime 不在 v0/v1) + INDEX `idx_agent_runtimes_agent_id` | `al_4_1_agent_runtimes_test.go::TestAL41_RejectsDuplicateRuntimePerAgent` + `TestAL41_HasAgentIDIndex` | 战马 / 烈马 | TBD AL-4.1 | ⚪ pending |
| REG-AL4-004 | al-4.md §1.4 migration v=14→v=15 + idempotent + DM-2.1 forward-only | `al_4_1_agent_runtimes_test.go::TestAL41_Idempotent` + `grep -n 'v=15\|15:' packages/server-go/internal/migrations/registry.go` count==1 | 战马 / 烈马 | TBD AL-4.1 | ⚪ pending |
| REG-AL4-005 | al-4.md §1.5 + §4.1/4.2 反约束 — 表无 LLM 列 (#319 立场 ① Borgee 不带 runtime) + 表无 `is_online` 列 (立场 ③ 跟 AL-3 拆死) | `al_4_1_agent_runtimes_test.go::TestAL41_NoLLMOrPresenceColumns` (反向 column list) + `grep -nE 'llm_provider\|model_name\|api_key\|prompt_template\|agent_runtimes.*is_online' packages/server-go/internal/store/agent_runtimes*` count==0 | 飞马 / 烈马 | TBD AL-4.1 | ⚪ pending |
| REG-AL4-006 | al-4.md §2.1/2.2 owner-only start/stop (RequirePermission `agent.runtime.control`) + admin token 401 (#319 立场 ② ADM-0 ⑦ 红线) + stop idempotent | `internal/api/runtimes_test.go::TestRuntimeStart_OwnerOnly_403_ForOthers` + `TestRuntimeStart_AdminTokenRejected_401` + `TestRuntimeStop_OwnerOnly_Idempotent` | 战马 / 烈马 | TBD AL-4.2 | ⚪ pending |
| REG-AL4-007 | al-4.md §2.3 start 走 BPP-1 #304 envelope `agent_register` 既有 frame, 反向: 不裂 `runtime.start`/`runtime.stop` namespace | `internal/bpp/runtime_register_test.go::TestRuntimeRegisterUsesExistingFrame` + `grep -rEn "type:.*'runtime\\." packages/server-go/internal/ws/` count==0 | 飞马 / 烈马 | TBD AL-4.2 | ⚪ pending |
| REG-AL4-008 | al-4.md §2.4 heartbeat 双表双路径拆死 (#319 立场 ③) — plugin → server 更 `agent_runtimes.last_heartbeat_at` (process), **不写** `presence_sessions.last_heartbeat_at` (AL-3 hub WS 路径); clock fixture | `internal/api/runtimes_heartbeat_test.go::TestHeartbeatUpdatesRuntimeLastHeartbeatNotPresence` (反向断言两表两路径) | 战马 / 烈马 | TBD AL-4.2 | ⚪ pending |
| REG-AL4-009 | al-4.md §2.5 last_error_reason 6 reason byte-identical 三处对账 (#319 立场 ④) — `agent_runtimes` CHECK = `agent/state.go` Reason* = `lib/agent-state.ts` REASON_LABELS = AL-3 #305 ③; 改 = 改三处 | `runtimes_test.go::TestRuntimeErrorReasonsMatchAL1aEnum` + `grep -nE "(api_key_invalid\|quota_exceeded\|network_unreachable\|runtime_crashed\|runtime_timeout\|unknown)" packages/server-go/internal/migrations/al_4_1_agent_runtimes.go` count==6 | 战马 / 烈马 | TBD AL-4.2 | ⚪ pending |
| REG-AL4-010 | al-4.md §2.6 admin god-mode 元数据白名单 + §2.7 status 变化触发 system DM 3 态文案锁 (#321 byte-identical) — start `"已启动"` / stop `"已停止"` / error `"出错: {reason}"`; recipient = owner_id only + 反向 channel fanout count==0 + 反向 toast count==0; §3 client UI `data-runtime-status` 3 态严闭 + owner-only DOM omit + G2.7 demo 截屏 3 张 | `internal/api/admin_runtimes_test.go::TestAdminGodModeOmitsErrorReason` + `runtimes_test.go::TestRuntimeStatusChangeTriggersSystemDM_OwnerOnly` + `grep -nE '已启动\|已停止\|出错:' packages/server-go/internal/api/runtimes.go` count≥3 + `al-4-3-runtime-card.spec.ts::立场 ①②③④` + 反向 grep `data-runtime-status=["\\\(starting\|stopping\|restarting\)"]\|toast.*runtime` count==0 + screenshots `docs/qa/screenshots/g2.7-runtime-{start,stop,error}.png` | 战马 / 飞马 / 烈马 | TBD AL-4.2 + AL-4.3 | ⚪ pending |

### BPP-1 envelope CI lint 真落 (PR #304 merged 4724efa, G2.6 ✅ DONE, 8 🟢)

| Reg ID | Source | Test path / grep | Owner | Trigger PR | Status |
|---|---|---|---|---|---|
| REG-BPP1-001 | al-2a.md §蓝图行为对照 + plugin-protocol.md §1.5 frame whitelist | `internal/bpp/frame_schemas_test.go::TestBPPEnvelopeFrameWhitelist` — 注册 frame type 集合闭包锁 (新增 frame 不入 whitelist 即红, fail-closed) | 飞马 / 烈马 | #304 (4724efa) | 🟢 active |
| REG-BPP1-002 | plugin-protocol.md §1.5 control/data 方向锁 | `frame_schemas_test.go::TestBPPEnvelopeDirectionLock` — control=6 / data=3 字面 count 锁, 任一 frame 错向即红 | 飞马 / 烈马 | #304 | 🟢 active |
| REG-BPP1-003 | rt-1.md §1.d / §3.c byte-identical envelope 字段顺序 | `frame_schemas_test.go::TestBPPEnvelopeFieldOrder` — 反射扫所有 envelope struct, field 0 必须 `Type string \`json:"type"\`` (跟 RT-0 #237 / RT-1.1 #290 / RT-1.3 #296 envelope 同模式锁) | 飞马 / 烈马 | #304 | 🟢 active |
| REG-BPP1-004 | RT-0 #237 godoc 锚 + REG-RT0-003 延伸 | `frame_schemas_test.go::TestBPPEnvelopeGodocAnchor` — 字面 regex `BPP-1.*byte-identical.*RT-0` 在 `frame_schemas.go` godoc 命中 ≥1 (注释锁防漂) | 飞马 / 烈马 | #304 | 🟢 active |
| REG-BPP1-005 | rt-1.md §3.b 反向断言 NEVER default full + comment-stripped grep | `frame_schemas_test.go::TestBPPEnvelopeReverseGrepNoFullDefault` — 3 forbidden pattern (`defaultReplayMode` / `ResumeModeFull.*default` / `replay_mode.*=.*"full".*default`) 用 `go/scanner` 剥注释扫 `internal/bpp/` 非 `_test.go` 源 count==0 | 飞马 / 烈马 | #304 | 🟢 active |
| REG-BPP1-006 | al-2a.md §蓝图行为对照 AST 反向覆盖 | `frame_schemas_test.go::TestBPPEnvelopeAllExportedStructsCovered` — AST 扫 `internal/bpp/` 所有 exported struct, 必须出现在 whitelist (反向覆盖, 漏注册即红) | 飞马 / 烈马 | #304 | 🟢 active |
| REG-BPP1-007 | rt-1.md §1.d cross-module dispatcher prefix RT-0 byte-identical | `internal/bpp/schema_equivalence_test.go::TestBPPEnvelopeMatchesRT0Dispatcher` — RT-0 #237 dispatcher prefix (`{"type":...,"cursor":...}`) byte-identical 锁, 跟 ArtifactUpdated frame 同模式 | 飞马 / 烈马 | #304 | 🟢 active |
| REG-BPP1-008 | rt-1.md §3.c cross-module dispatcher prefix RT-1.3 byte-identical | `schema_equivalence_test.go::TestBPPEnvelopeAlsoMatchesRT13Resume` — RT-1.3 #296 session.resume frame prefix byte-identical 锁; CI workflow lint job 在 `.github/workflows/ci.yml` 跑全部 8 子测试 | 飞马 / 烈马 | #304 | 🟢 active |

### CV-1 (PR #334 merged CV-1.1 schema, 4 🟢 + PR #342 merged CV-1.2 server API, 7 🟢 + PR #346 merged CV-1.3 client SPA, 5 🟢 + 1 ⏸️ e2e)

| Reg ID | Source | Test path / grep | Owner | Trigger PR | Status |
|---|---|---|---|---|---|
| REG-CV1-001 | cv-1.md §1.1 artifacts 表三轴 + 立场 ① 反约束 (无 owner_id 主权列) | `internal/migrations/cv_1_1_artifacts_test.go::TestCV11_CreatesArtifactsTable` (PRAGMA table_info 全列断言 + 合并双 negative assert: 列表反向不含 `owner_id` / `cursor`) + `TestCV11_HasIndexes` + `TestCV11_Idempotent` | 战马A / 烈马 | #334 (cd7e12a) | 🟢 active |
| REG-CV1-002 | cv-1.md §1.1 立场 ④ Markdown ONLY (CHECK type='markdown' enum) | `cv_1_1_artifacts_test.go::TestCV11_RejectsNonMarkdownType` (反向 INSERT type='code' → reject) | 战马A / 烈马 | #334 (cd7e12a) | 🟢 active |
| REG-CV1-003 | cv-1.md §1.2 立场 ③ 线性版本 (PK AUTOINCREMENT 单调跨 artifact, 无 fork) | `cv_1_1_artifacts_test.go::TestCV11_CreatesArtifactVersionsTable` + `TestCV11_VersionsTablePKMonotonic` (interleave A1/B1/A2/B2 验 PK 单调跨 artifact) | 战马A / 烈马 | #334 (cd7e12a) | 🟢 active |
| REG-CV1-004 | cv-1.md §1.2 UNIQUE(artifact_id, version) + 立场 ⑥ committer_kind enum | `cv_1_1_artifacts_test.go::TestCV11_RejectsDuplicateArtifactVersion` + `TestCV11_RejectsInvalidCommitterKind` (CHECK in ('agent','human')) | 战马A / 烈马 | #334 (cd7e12a) | 🟢 active |
| REG-CV1-005 | cv-1.md §2.1 立场 ① channel-scoped 创建 + 立场 ④ Markdown ONLY HTTP 400 fail-fast (双层防御 — handler 400 + #334 schema CHECK) | `internal/api/cv_1_2_artifacts_test.go::TestCV12_CreateArtifactInChannel` + `TestCV12_CrossChannel403` (membership-only ACL 反断) + `TestCV12_RejectsNonMarkdownType` (HTTP 400 `type must be 'markdown' (v1)` 字面) | 战马A / 烈马 | #342 (b2ed5c0) | 🟢 active |
| REG-CV1-006 | cv-1.md §2.2 立场 ② 30s lazy-expire 锁 + 立场 ③ 乐观并发线性 bump (transactional `UPDATE WHERE current_version=?`) | `cv_1_2_artifacts_test.go::TestCV12_CommitBumpsVersion` + `TestCV12_CommitVersionMismatch409` (乐观并发反断) + `TestCV12_LockTTL30sBoundary` (T+0/29/31s mock clock, 跟 G2.3 节流模式同) | 战马A / 烈马 | #342 (b2ed5c0) | 🟢 active |
| REG-CV1-007 | cv-1.md §2.3 立场 ⑦ rollback owner-only (admin 401 + 非 owner 403 + 锁持有=别人 409) + 反约束 INSERT 新 row 旧版本不删 + system message 不发 | `cv_1_2_artifacts_test.go::TestCV12_RollbackOwnerOnly` (三反向断言: admin 401 + non-owner 403 + lock-conflict 409) + `TestCV12_RollbackProducesNewVersionNotDelete` (新行 + 旧行 row count 反断 + `rolled_back_from_version=N` 列填) | 战马A / 烈马 | #342 (b2ed5c0) | 🟢 active |
| REG-CV1-008 | cv-1.md §2.4 立场 ⑥ agent commit fanout 文案锁 byte-identical (`{agent_name} 更新 {artifact_name} v{n}`) + 反约束 human commit 静默 | `cv_1_2_artifacts_test.go::TestCV12_AgentCommitSystemMessage` (`fmt.Sprintf("%s 更新 %s v%d")` 字面) + `TestCV12_HumanCommitNoSystemMessage` (静默反断) + `grep -n "更新 .* v" packages/server-go/internal/api/artifacts.go` line 591 count==1 | 战马A / 烈马 | #342 (b2ed5c0) | 🟢 active |
| REG-CV1-009 | cv-1.md §2.5 立场 ⑤ ArtifactUpdated frame 7 字段 byte-identical 跟 RT-1.1 #290 envelope (`{type:"artifact_updated", cursor, artifact_id, version, channel_id, updated_at, kind}`) + kind=commit/rollback 切换 + cursor 单调 | `cv_1_2_artifacts_test.go::TestCV12_PushFrameOnCreateAndCommit` (3 calls: commit/commit/rollback) + `internal/ws/cursor_test.go::TestArtifactUpdatedFrameFieldOrder` (#290 既有 golden JSON byte-equality) + `TestHubPushArtifactUpdatedDedup` + BPP-1 `bpp/frame_schemas_test.go::TestBPPEnvelopeFieldOrder` 自动覆盖 | 飞马 / 烈马 | #342 (b2ed5c0) | 🟢 active |
| REG-CV1-010 | cv-1.md §4.1 反向 grep 立场 ① 无 owner_id 主权 (artifacts.go 仅注释行命中, 0 数据列 leak) | `grep -nE "owner_id" packages/server-go/internal/api/artifacts.go` 仅 line 24 注释行 ("无 owner_id 主权列" 立场锚) + 反向断言 grep `artifacts.*owner_id` packages/server-go/internal/store/ count==0 | 飞马 / 烈马 | #342 (b2ed5c0) | 🟢 active |
| REG-CV1-011 | cv-1.md §2.3 反约束 admin god-mode 不入 artifact 写动作 (ADM-0 §1.3 红线复用) — admin cookie 调 rollback → 401 | `cv_1_2_artifacts_test.go::TestCV12_RollbackOwnerOnly::admin → 401` 子断言 + 反向断言 artifacts.go admin handler 路径 count==0 (admin 走 /admin-api/* 单独入口) | 飞马 / 烈马 | #342 (b2ed5c0) | 🟢 active |
| REG-CV1-012 | cv-1.md §3.3 立场 ⑤ frame 仅信号 dispatcher 字面 + 7-field byte-identical 跟 RT-1.1 #290 cursor.go::ArtifactUpdatedFrame | `packages/client/src/__tests__/ws-artifact-updated.test.ts::dispatchArtifactUpdated fires ARTIFACT_UPDATED_EVENT with frame in detail` + `preserves the 7-field byte-identical key order` (Object.keys==[type,cursor,artifact_id,version,channel_id,updated_at,kind] expect.toEqual) + `event-name lock: ARTIFACT_UPDATED_EVENT === 'borgee:artifact-updated'` | 战马A / 烈马 | #346 (623c1bb) | 🟢 active |
| REG-CV1-013 | cv-1.md §3.3 立场 ⑤ commit/rollback 双 kind round-trip + 反向 frame 不漏 body / committer_* | `ws-artifact-updated.test.ts::both kinds (commit / rollback) round-trip` + `reverse — frame envelope must NOT leak body or committer (立场 ⑤)` (反向断言 keys 不含 body/committer_id/committer_kind + length===7) | 战马A / 烈马 | #346 (623c1bb) | 🟢 active |
| REG-CV1-014 | cv-1.md §3.2 立场 ⑦ rollback owner-only DOM gate (defense-in-depth, server #342 也 enforce) | `grep -n "showRollbackBtn = isOwner" packages/client/src/components/ArtifactPanel.tsx` line 254 字面 `showRollbackBtn = isOwner && !isHead && !editing` 三条件 + line 57 `isOwner = !!currentUser && channel?.created_by === currentUser.id` (channel-model §1.4 owner) | 战马A / 烈马 | #346 (623c1bb) | 🟢 active |
| REG-CV1-015 | cv-1.md §3.3 立场 ② conflict toast 字面锁 + pull-after-signal (立场 ⑤) | `grep -n "内容已更新, 请刷新查看" packages/client/src/components/ArtifactPanel.tsx` line 49 `CONFLICT_TOAST` 字面 count==1; `ArtifactPanel.tsx:106` `useArtifactUpdated → reload(artifact.id)` (frame 收到后 GET /api/v1/artifacts/:id pull body + committer 立场 ⑤) | 战马A / 烈马 | #346 (623c1bb) | 🟢 active |
| REG-CV1-016 | cv-1.md §3.1 立场 ④ Markdown ONLY render 复用既有路径 (no CRDT, no 自造 envelope, 文件头反约束锚) | `grep -n "renderMarkdown\|marked.*DOMPurify" packages/client/src/lib/markdown.ts` 复用既有 + `ArtifactPanel.tsx` 文件头注释锚 7 立场 + 4 反约束 (no CRDT / no 自造 envelope / no client timestamp 排序 / rollback 非 PATCH) | 战马A / 烈马 | #346 (623c1bb) | 🟢 active |
| REG-CV1-017 | cv-1.md §3.1+§3.2+§3.3 e2e WS+UI ≤3s 契约 (战马A 留 follow-up) | `packages/e2e/tests/cv-1-3-canvas.spec.ts` (TBD): 立场 ① workspace tab + markdown only / 立场 ⑦ rollback owner-only DOM 反向 / 立场 ② conflict toast 字面 + 双窗口 commit→reload | 战马A / 烈马 | TBD CV-1.3 e2e | ⏸️ deferred |

### CM-3 资源归属 + G1.4 (PR #208 merged, 4 🟢)

| Reg ID | Source | Test path / grep | Owner | Trigger PR | Status |
|---|---|---|---|---|---|
| REG-CM3-001 | cm-3 §3 反向断言 ① | `internal/api/cross_org_test.go::TestCrossOrgRead403` (PUT/DELETE 跨 org message → 403 不是 200/404/500) | 烈马 | #208 | 🟢 active |
| REG-CM3-002 | cm-3 §3 反向断言 ② | `internal/api/cross_org_test.go::TestCrossOrgChannel403` (GET 跨 org channel → 403 + body 不含 raw `org_id`) | 烈马 | #208 | 🟢 active |
| REG-CM3-003 | cm-3 §3 反向断言 ④ | `internal/api/cross_org_test.go::TestCrossOrgFile403` (GET 跨 org workspace_files → 403) | 烈马 | #208 | 🟢 active |
| REG-CM3-004 (G1.4) | execution-plan G1.4 + cm-3 §2 黑名单 + §3 EXPLAIN | (a) `grep -rEn "JOIN.*(messages\|channels\|workspace_files\|agents\|remote_nodes).*owner_id" packages/server-go/internal/store/ \| grep -v _test.go \| grep -v queries_cm3.go` count==0; (b) `EXPLAIN QUERY PLAN` on 6 主查询全部 `SEARCH ... USING INDEX idx_*_org_id` (audit 2026-04-28, 见 `docs/implementation/00-foundation/g1-audit.md` §2) | 烈马 | #208 | 🟢 active |

---

## 4. Phase 1 引用 (不重抄)

详见 `docs/implementation/00-foundation/g1-audit.md`. 已闭合项:
- CM-1 (organizations + users.org_id) — G1.1 / G1.2 / G1.3 ✅ (PR #184)
- AP-0 (默认权限注册回填) — G1.5 ✅ (PR #184)
- CM-3 (资源归属 + 跨 org 403) — G1.4 ✅ closed by PR #208 + audit 2026-04-28 (REG-CM3-004 in registry)
- G1.audit (Phase 1 闸 audit row) — ✅ 含 CM-1 / AP-0 / CM-4 / CM-3 audit row (g1-audit.md §3)

Phase 1 退出 gate 全签: 见 `docs/qa/signoffs/g1-exit-gate.md` (2026-04-28).

---

## 5. 总计

| 分组 | 行数 | 当前 active | 当前 pending |
|---|---|---|---|
| CM-4.x | 8 | 8 | 0 |
| INFRA-2 | 7 | 7 | 0 |
| ADM-0 | 10 | 7 | 3 |
| AP-0-bis | 6 | 6 | 0 |
| RT-0 | 9 | 8 | 1 |
| CM-onboarding | 13 | 5 | 8 |
| 跨 milestone 不变量 | 3 | 3 | 0 |
| CM-3 + G1.4 | 4 | 4 | 0 |
| AL-1a | 5 | 5 | 0 |
| CHN-1 | 10 | 9 | 1 |
| RT-1 | 10 | 10 | 0 |
| AL-3 | 15 | 12 | 3 |
| AL-4 | 10 | 0 | 10 |
| BPP-1 | 8 | 8 | 0 |
| CV-1 | 17 | 16 | 1 |
| **总计** | **135** | **108** | **27** |

Phase 2 全部 milestone 落地后, 预计 active 55 行 — G2.audit 时全员检视一遍 + 翻态 + sign off。

## 6. 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-28 | 烈马 | v1 初版, 收纳 #186/#185/#183 (active) + R3 5 milestone (pending) |
| 2026-04-28 | 烈马 | flip AP-0-bis 6 行 ⚪ → 🟢 (PR #206 merged) + 加 REG-INV-003 bug-030 守门 (ListChannelsWithUnread system membership) |
| 2026-04-28 | 烈马 | 加 CM-3 + G1.4 4 行 🟢 (PR #208 merged + audit 集成); Phase 1 引用区改 G1.4 ⏸️ → ✅; 总计 55 → 59, active 25 → 29 |
| 2026-04-28 | 烈马 | flip INFRA-2 7 行 ⚪ → 🟢 (PR #195 merged, 实测路径修正 packages/client/ → packages/e2e/); + AP-0-bis G2 audit 集成 (g1-audit.md §3.5, 5 audit row); active 29 → 36 |
| 2026-04-28 | 烈马 | flip ADM-0.3 4 行 ⚪ → 🟢 (PR #223 merged): REG-ADM0-004 (3.A 反向断言) / 005 (step-2/3 sweep) / 007 (CHECK 数据不变量等价) / 010 (16 packages green); active 36 → 40 |
| 2026-04-28 | 烈马 | flip RT-0 6 行 ⚪ → 🟢 (PR #218 client + #235 vitest CI + #237 server merged): REG-RT0-001..005 (schema/decided/byte-identical 注释/PushOnCreate/PushOnPatch+NilHub) + REG-RT0-006 (ws-invitation 6/6 jsdom); REG-INV-003 evidence 加 #226 e2e (cm-onboarding-bug-030-regression.spec.ts); active 40 → 46. RT-0 -007/-008 留 Phase 2 收尾 (60s polling fallback + 战马B latency 截屏). |
| 2026-04-28 | 烈马 | 加 AL-1a 5 行 🟢 (PR #249 stacked, 不等 merge): REG-AL1A-001 三态机/优先级 + 002 6 reason classifier 12 case + 003 handler withState 4 角 + 004 故障旁路 + 005 文案锁 8 it; 总计 59 → 64, active 46 → 51. |
| 2026-04-28 | 烈马 | flip REG-RT0-008 ⚪ → 🟢 + 加 REG-RT0-009 🟢 (PR #239 merged): -008 = `cm-4-realtime.spec.ts` flip `.skip` + 真 fixture, local 910ms ≤ 3s hardline + 截屏 g2.4-realtime-latency.png 钉; -009 = `TestRateLimitBypass_RequiresBothHeaderAndDevMode` 5-row matrix (dev+header bypass / 单 gate enforce). RT-0 8 → 9, active 51 → 53. REG-RT0-007 (60s polling fallback) 仍 ⚪ pending — 不在 #239 范围, 留 Phase 4. |
| 2026-04-28 | 烈马 | 加 CHN-1 7 行 (PR #276 b6e95ce + PR #286 f7ac4ed merged): REG-CHN1-001 schema drift 6 migration test + 002 creator-only + 003 per-org name + 004 cross-org 双轴 + 005 archive fanout 文案锁 + 006 agent silent join 文案锁 + 007 ⏸️ AP-1 严格 403 回填留账; 总计 65 → 72, active 53 → 59. acceptance template `acceptance-templates/chn-1.md` 同步落. |
| 2026-04-28 | 烈马 | 加 CHN-1 客户端 3 行 (PR #288 adaf521 merged): REG-CHN1-008 client default-public + creator-only e2e + 009 silent badge `🔕 silent` 字面 + system message + 010 archive `data-archived="true"` + `已归档` badge + system DM `channel #{name} 已被 ` 前缀; chn-1.md 加用户感知段 (4.1/4.2/4.3); 总计 72 → 75, active 59 → 62. Note: #288 顺手抓到 server bug — `AddUserToPublicChannels` 绕过 `AddChannelMember` 致 agent silent flag 漏盖, 同 PR fix; 客户端 `channel_added` WS payload 改送 full channel + client guard, 防回归 (channels.go + queries.go + useWebSocket.ts). |
| 2026-04-28 | 烈马 | 加 RT-1 10 行 (PR #290 d1538f5 merged RT-1.1, RT-1.2/1.3 ⚪ 待实施): REG-RT1-001..004 server cursor 4 unit (race / 32 racer dedup / restart / golden JSON byte-identical) + 005 反向 grep `artifact_updated.*timestamp` count==0 + 006..008 ⚪ client backfill 3 e2e (latency≤3s / 离线 30s × 5 / 2-tab dedup) + 009 ⚪ agent BPP session.resume 三 hint + 010 ⚪ 人/agent 拆 replay 反向断言; acceptance template `acceptance-templates/rt-1.md` 同步落; 总计 75 → 85, active 62 → 67, pending 13 → 18. |
| 2026-04-28 | 烈马 | flip REG-RT1-006..010 ⚪ → 🟢 (RT-1.2 #292 6a5ac92 + RT-1.3 #296 7c62150 merged): -006 = `rt-1-2-backfill-on-reconnect.spec.ts::立场 ① offline 5s ≤3s` + -007 = 同 spec 立场 ① server contract `cursor>since` 反约束双锁 + -008 = `last-seen-cursor.test.ts` 5 vitest sessionStorage round-trip/monotonic/page-reload/defensive/corrupt-clamp + spec 立场 ② cold start 0-call 反约束 + server `events_backfill_test.go` 401/400 三 case + -009 = `session_resume_test.go` 9/9 race-clean (3 hint + 11 种坏输入字面 parse 锁 + 7 种行为分支锁 + golden JSON byte-equality) + -010 = 反向 grep `defaultReplayMode\|default.*ResumeModeFull` 仅命中文件头注释 grep 锚自身 (战马A 主动留, 非 leak); RT-1 三段全闭 (#290+#292+#296), pending 18 → 13, active 67 → 72. CI 时序备注: RT-1.2 backfill ≤3s 在 CI runner 时序敏感, 2 次 merge agent 用 ruleset 兜底, follow-up PR 调阈值或加 retry. |
| 2026-04-28 | 烈马 | 加 AL-3 10 行 (PR #310 685dc15 merged AL-3.1 schema, AL-3.2/3.3 ⚪ 待实施): REG-AL3-001 schema 三轴 (PK/NOT NULL 全列/agent_id nullable) + 002 UNIQUE(session_id) + 003 multi-session 合法 (web+mobile+plugin) + 004 INDEX 双轴 (full user_id + partial agent_id WHERE NOT NULL — DM-2 mention 路径) + 005 编译期 `var _ PresenceTracker = (*SessionsTracker)(nil)` + idempotent migration; 006-010 ⚪ AL-3.2/3.3 留账 (hub lifecycle / 5s+60s 节流 / presence.changed 字段白名单 / client dot DOM / admin god-mode); acceptance template `acceptance-templates/al-3.md` §1 翻 ✅ #310; 总计 85 → 95, active 67 → 77 (含 RT-1.2/1.3 全 🟢 转移), pending 18 → 18 (RT-1 -5 / AL-3 +5). |
| 2026-04-28 | 烈马 | flip AL-3.2 §2 (al-3.md 2.1/2.2/2.3 → ✅ #317) + REG-AL3-006/007/009 ⚪ → 🟢 (PR #317 11b52dd merged): -006 = hub `Register`/`Unregister` → `TrackOnline`/`TrackOffline` + panic defer + agent_id partial (role='agent' 才填) + TrackOnline 失败仅 log 不阻断 in-memory broadcast (5 hub_presence_test 函数全锁) + -007 = multi-session last-wins (web+mobile+plugin 任一存活即 IsOnline=true, 5 tracker_test 函数 + UnknownSessionIsSoftNoop / DuplicateSessionIDIsUnique / RejectsEmptyArgs 防御三 case) + -009 = `internal/presence/writer.go` PresenceWriter interface + 编译期 `var _ PresenceWriter = (*SessionsTracker)(nil)` + AST 反向 grep `hub_presence_grep_test.go::TestPresenceLifecycle_NoDirectTableRead` (go/parser scan `internal/ws/` 非测试 .go 不出现 `presence_sessions` 字面量); REG-AL3-008 (5s+60s 节流 + presence.changed frame 字段白名单) 合并到 AL-3.3 心跳重试逻辑落; -010 (client dot DOM + admin god-mode) 等 AL-3.3 + ADM-2; pending 18 → 15, active 77 → 80. docs/current/server/agent-lifecycle.md §AL-3 段补 #317 留的 docs/current 留账 (规则 6). |
| 2026-04-28 | 烈马 | 加 AL-4 10 行 ⚪ (#318 acceptance skeleton + #319 stance + #321 文案锁 三表全锁, 实施待 AL-3.3 后战马A 接力): REG-AL4-001..005 AL-4.1 schema (9 列三轴 / CHECK process_kind+status / UNIQUE(agent_id) / migration v=15 idempotent / 反约束无 LLM 列) + 006..009 AL-4.2 server (owner-only start/stop + admin 401 / BPP-1 #304 复用 frame / heartbeat 双表双路径拆死 / 6 reason byte-identical 三处) + 010 AL-4.2+4.3 综合 (admin god-mode + status 变化 system DM 3 态文案锁 #321 + client `data-runtime-status` 3 态严闭 + owner-only DOM omit + G2.7 demo 3 张截屏); al-4.md §2 加 2.7 system DM 触发文案锁 + §3 改 DOM 字面锁 (3.1 data-runtime-status 3 态严闭 + 3.2 DOM omit 不仅 disabled + 3.3 data-error-reason badge + 3.4 owner inbox + G2.7 截屏); 总计 95 → 105, active 80 → 80, pending 15 → 25. |
| 2026-04-28 | 烈马 | 加 BPP-1 8 行 🟢 (PR #304 merged 13:35:02Z, commit 4724efa, G2.6 envelope CI lint **真落** ✅ DONE): REG-BPP1-001 frame whitelist 闭包 + 002 control/data 方向锁 (6/3) + 003 字段顺序 reflection (Type/json:"type"/string) + 004 godoc 锚 `BPP-1.*byte-identical.*RT-0` regex + 005 反向 grep 3 forbidden pattern (`defaultReplayMode`/`ResumeModeFull.*default`/`replay_mode.*=.*"full".*default`) 用 `go/scanner` 剥注释扫 + 006 AST 反向覆盖 exported struct + 007 schema_equivalence RT-0 #237 dispatcher prefix byte-identical + 008 同等 RT-1.3 #296 session.resume frame prefix; al-2a.md §蓝图行为对照加 BPP-1 envelope CI lint 真落 ✅ 行 + phase-2-exit-announcement.md G2.6 留账行 ⏸️ → ✅ DONE 引 #304 + 4724efa; 总计 105 → 113, active 80 → 88, pending 25 → 25 (BPP-1 全 🟢 不增 pending). CV-1 v1 transition 三条件 (RT-1 ✅ + AL-3 ✅ + BPP-1 lint ✅) 全部满足 → 战马A CV-1.1 schema 解封信号. |
| 2026-04-29 | 烈马 | 加 CV-1 4 行 🟢 (PR #334 merged CV-1.1 schema, commit cd7e12a, follow-up 22203ea 加 3 nullable 列 + PKMonotonic test): REG-CV1-001 artifacts 表三轴 + `TestCV11_CreatesArtifactsTable` 合并双 negative assert (列表反向不含 owner_id / cursor) + HasIndexes + Idempotent + 002 立场 ④ Markdown ONLY (`TestCV11_RejectsNonMarkdownType`) + 003 立场 ③ 线性版本 (`TestCV11_VersionsTablePKMonotonic` interleave A1/B1/A2/B2) + 004 UNIQUE(artifact_id, version) + committer_kind enum (`TestCV11_RejectsDuplicateArtifactVersion` + `TestCV11_RejectsInvalidCommitterKind`); cv-1.md §1.1+§1.2 ⚪→✅ 翻 + 拆 PR 行 CV-1.1 ✅ 锚; CV-1.2/1.3 留 ⚪ pending 待战马A 实施; 总计 113 → 117, active 88 → 92, pending 25 → 25 (CV-1 4 🟢 全闭 不增 pending). |
| 2026-04-29 | 烈马 | 加 CV-1 7 行 🟢 (PR #342 merged CV-1.2 server API, commit b2ed5c0, 11 CV12_* test PASS): REG-CV1-005 立场 ①+④ 创建 (CrossChannel403 + RejectsNonMarkdownType HTTP 400 双层防御) + 006 立场 ②+③ 30s lazy-expire 锁 + 乐观并发 (CommitBumpsVersion + CommitVersionMismatch409 + LockTTL30sBoundary T+0/29/31s) + 007 立场 ⑦ rollback owner-only (RollbackOwnerOnly admin 401 + 非 owner 403 + 锁 409 + RollbackProducesNewVersionNotDelete) + 008 立场 ⑥ agent fanout 文案锁 (AgentCommitSystemMessage `%s 更新 %s v%d` + HumanCommitNoSystemMessage 静默反断) + 009 立场 ⑤ 7-field envelope (PushFrameOnCreateAndCommit 3 calls 跟 #290 byte-identical) + 010 反向 grep owner_id 仅注释 0 数据列 leak + 011 admin god-mode 401 反约束 (ADM-0 §1.3 红线复用); cv-1.md §2.1-§2.5 ⚪→✅ 翻 + 拆 PR 行 CV-1.2 ✅ b2ed5c0 锚; CV-1.3 留 ⚪ pending 待战马A 实施; 总计 117 → 124, active 92 → 99, pending 25 → 25 (CV-1.2 7 🟢 全闭 不增 pending). |
| 2026-04-29 | 烈马 | audit patch — §5 总计 AL-3 行数对账修正 (跟 #324 加的 -010b/c/d/e + #310 -011 漏算): AL-3 实际 15 行 (12 🟢 + 3 ⚪), 而非 10/8/2. -010b ⚪ (online/error e2e 等 §2.5 server push) + -010c 🟢 (#324 client throttle 7 it) + -010d 🟢 (#324 反向 grep busy/idle 4 it) + -010e 🟢 (#324 import-site 白名单) + -011 ⚪ (TBD ADM-2). 总计 124 → 129 / active 99 → 103 / pending 25 → 26. 反查锚: 编号连续性 (-010 + -010b/c/d/e 子字母, 跟 #324 原模式) + 数学对账 (跑过 grep `\| 🟢` count vs `\| ⚪` count). 跟 #335/#336/#338 同模式 docs only follow-up; rebase on #344 (admin merge 顺序错位修正). |
| 2026-04-29 | 烈马 | 加 CV-1 5 行 🟢 + 1 ⏸️ (PR #346 merged CV-1.3 client SPA, commit 623c1bb, 5 ws-artifact-updated.test.ts vitest PASS): REG-CV1-012 立场 ⑤ frame dispatcher + 7-field byte-identical (Object.keys==[type,cursor,artifact_id,version,channel_id,updated_at,kind]) + ARTIFACT_UPDATED_EVENT 字面 + 013 commit/rollback 双 kind round-trip + 反向 frame 不漏 body/committer_* (length===7) + 014 立场 ⑦ rollback owner-only DOM gate (`showRollbackBtn = isOwner && !isHead && !editing` line 254 + `isOwner = channel.created_by === currentUser.id` line 57, defense-in-depth) + 015 立场 ② CONFLICT_TOAST 字面 "内容已更新, 请刷新查看" line 49 count==1 + pull-after-signal `useArtifactUpdated → reload` line 106 + 016 立场 ④ Markdown ONLY render 复用 + ArtifactPanel.tsx 文件头 7 立场 + 4 反约束注释锚 (no CRDT / no 自造 envelope / no client timestamp 排序 / rollback 非 PATCH) + 017 ⏸️ e2e `cv-1-3-canvas.spec.ts` 战马A 留 follow-up; cv-1.md §3.1-§3.3 ⚪→✅ 翻 + 拆 PR 行 CV-1.3 ✅ 锚; CV-1 三段 (1.1+1.2+1.3) milestone 完整闭环 — Phase 3 Canvas Vision 主线收尾; 总计 129 → 135, active 103 → 108, pending 26 → 27 (-017 ⏸️ 算 pending 跟 CHN-1 -007 ⏸️ 同模式). |
