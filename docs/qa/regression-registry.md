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
| REG-RT1-006 | rt-1.md §2.a client backfill latency ≤3s | `packages/e2e/tests/rt-1-backfill.spec.ts::new commit ≤3s` (latency 截屏 G2.4 模板, stopwatch fixture) | 战马A / 烈马 | RT-1.2 (待) | ⚪ pending |
| REG-RT1-007 | rt-1.md §2.b 离线 30s × 5 commit reconnect 齐序 | `rt-1-backfill.spec.ts::offline 30s 5 commit reconnect` (cursor 单调 + 无丢) | 战马A / 烈马 | RT-1.2 (待) | ⚪ pending |
| REG-RT1-008 | rt-1.md §2.c 多端 dedup (2 tab 各看一份不重复) | `rt-1-backfill.spec.ts::two-tab dedup`; `grep -nE 'since=0\\b\|fullReplay\\s*=\\s*true' packages/client/src/realtime/` count==0 | 战马A / 烈马 | RT-1.2 (待) | ⚪ pending |
| REG-RT1-009 | rt-1.md §3.a-c agent BPP session.resume 三 hint table-driven + 反向 grep + envelope byte-identical | `internal/bpp/session_resume_test.go::TestSessionResume_ThreeHints` (table-driven full/summary/latest_n) + `grep -rEn 'replay_mode.*=.*"full".*default\|defaultReplayMode' internal/bpp/` count==0 + golden JSON byte-identical 于 RT-1.1 envelope | 战马A / 飞马 / 烈马 | RT-1.3 (待) | ⚪ pending |
| REG-RT1-010 | rt-1.md §4.b 人/agent 拆 replay 反向断言 | `grep -rE 'wsClient\.backfill\|client.*last_seen_cursor' packages/server-go/internal/bpp/` count==0 (agent 不复用 client backfill 路径) | 飞马 / 烈马 | RT-1.3 (待) | ⚪ pending |

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
| RT-1 | 10 | 5 | 5 |
| **总计** | **85** | **67** | **18** |

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
