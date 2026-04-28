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

### INFRA-2 (PR 即将到, ⚪ pending)

| Reg ID | Source | Test path / grep | Owner | Trigger PR | Status |
|---|---|---|---|---|---|
| REG-INF2-001 | infra-2.md config | `find packages/client -name 'playwright.config.*'` count≥1 | 战马 | (TBD) | ⚪ pending |
| REG-INF2-002 | infra-2.md config | `grep '@playwright/test' packages/client/package.json` count==1 + lockfile 同步 | 战马 | (TBD) | ⚪ pending |
| REG-INF2-003 | infra-2.md smoke | `playwright test` run exit==0 + ≥1 spec.ts pass (登录页 DOM) | 战马 | (TBD) | ⚪ pending |
| REG-INF2-004 | infra-2.md command | `grep '"test:e2e"' packages/client/package.json \|\| grep 'test-e2e' Makefile` count≥1 | 战马 | (TBD) | ⚪ pending |
| REG-INF2-005 | infra-2.md CI | `.github/workflows/*.yml` 含 `playwright install` step + cache hit | 飞马 | (TBD) | ⚪ pending |
| REG-INF2-006 | infra-2.md CI | PR check 列表含 e2e job (与 go-test/lint 并列) | 飞马 | (TBD) | ⚪ pending |
| REG-INF2-007 | infra-2.md fixture | per-test fresh sqlite (testutil.OpenSeeded 跨 Playwright 调用) | 战马 | (TBD) | ⚪ pending |

### ADM-0 (派活, ⚪ pending)

> 拆 3 段 PR (ADM-0.1 / ADM-0.2 / ADM-0.3), 每行标 trigger PR sub-id 落地后回填。

| Reg ID | Source | Test path / grep | Owner | Trigger PR | Status |
|---|---|---|---|---|---|
| REG-ADM0-001 | adm-0.md 4.1.a | `internal/server/auth_isolation_test.go::TestAuthIsolation_2A_AdminSessionRejectedByUserRail` (admin cookie → /api/v1/users/me + /api/v1/channels 双 401) | 烈马 | ADM-0.2 (#201) | 🟢 active |
| REG-ADM0-002 | adm-0.md 4.1.b | `internal/server/auth_isolation_test.go::TestAuthIsolation_2B_UserTokenRejectedByAdminRail` (member + users.role=admin 双 borgee_token → /admin-api/v1/users 401 + legacy /api/v1/admin/* 不再 200) | 烈马 | ADM-0.2 (#201) | 🟢 active |
| REG-ADM0-003 | adm-0.md 4.1.c | `internal/admin/handlers_field_whitelist_test.go::TestAdminFieldWhitelist_GodModeEndpointsAreMetadataOnly` god-mode 4 endpoints fail-closed reflect scan, 禁字 body/content/text/artifact | 烈马 | ADM-0.2 (#201) | 🟢 active |
| REG-ADM0-004 | adm-0.md 4.1.d | `internal/migrations/*_test.go` post-migration `users WHERE role='admin'` count==0 | 战马 | ADM-0.3 | ⚪ pending |
| REG-ADM0-005 | adm-0.md 4.1.e (#189 加补) | 旧 admin 拿 ADM-0.3 之前的 user cookie → 401 (session revoke 反向断言) | 烈马 | ADM-0.3 | ⚪ pending |
| REG-ADM0-006 | adm-0.md schema | `admins` 表 schema fields (id/login/password_hash/created_at/created_by/last_login_at) | 飞马 | ADM-0.1 | ⚪ pending |
| REG-ADM0-007 | adm-0.md schema | DB CHECK `users.role IN ('member','agent')` | 飞马 | ADM-0.3 | ⚪ pending |
| REG-ADM0-008 | adm-0.md §1.2 | `grep -rE '/admin-api/.*/promote' internal/` count==0 (B env bootstrap, 无 promote) | 飞马 | ADM-0.1 | ⚪ pending |
| REG-ADM0-009 | adm-0.md fixture | `testutil/server.go` 删 `role=admin` user fixture, 改 `SeedAdmin` | 飞马 | ADM-0.1 | ⚪ pending |
| REG-ADM0-010 | adm-0.md regression | 已 merged admin SPA 测试 (≥ 8 个) 跟改 fixture 后 CI 全绿 | 烈马 | ADM-0.3 | ⚪ pending |

### AP-0-bis (PR #206 merged, 6 🟢)

| Reg ID | Source | Test path / grep | Owner | Trigger PR | Status |
|---|---|---|---|---|---|
| REG-AP0B-001 | ap-0-bis.md 数据契约 | `internal/store/store_coverage_test.go::TestDefaultPermissionsAgent` 断言 agent 默认 `[message.send, message.read]` 2 行 | 战马 | #206 | 🟢 active |
| REG-AP0B-002 | ap-0-bis.md backfill | `internal/migrations/ap_0_bis_message_read_test.go::TestAP0Bis_BackfillsMessageReadForLegacyAgents` (用 SeedLegacyAgent + post-Up assert `(agent_id, 'message.read', '*')` 行存在) | 战马 | #206 | 🟢 active |
| REG-AP0B-003 | ap-0-bis.md backfill | `internal/migrations/ap_0_bis_message_read_test.go::TestAP0Bis_Idempotent` (re-run v=8 不重复插入 — v0 forward-only 契约下替代 Down 回滚断言) | 战马 | #206 | 🟢 active |
| REG-AP0B-004 | ap-0-bis.md gate | `internal/api/messages_perm_test.go::TestGetMessages_LegacyAgentNoReadPerm_403` (反向 + 配套正向 `TestGetMessages_AgentWithReadPerm_200`) | 战马 | #206 | 🟢 active |
| REG-AP0B-005 | ap-0-bis.md helper | `internal/testutil/server.go::SeedLegacyAgent` 存在 + godoc (helper 同文件 SeedAgent/SeedAdmin 一致, 未独立 seed_legacy_agent.go) | 飞马 | #206 | 🟢 active |
| REG-AP0B-006 | ap-0-bis.md cap list | `grep -n '"message.read"' packages/server-go/internal/store/queries.go` count==1 (canonical list at `GrantDefaultPermissions` line 375 — 项目无 `auth/capabilities.go`, 默认权限 source-of-truth 在 store) | 飞马 | #206 | 🟢 active |

### RT-0 (派活, 依赖 INFRA-2, ⚪ pending)

| Reg ID | Source | Test path / grep | Owner | Trigger PR | Status |
|---|---|---|---|---|---|
| REG-RT0-001 | rt-0.md schema | `internal/ws/event_schemas.go` 存在 + `agent_invitation_pending` 字段顺序 (invitation_id/requester_user_id/agent_id/channel_id/created_at/expires_at) | 飞马 | RT-0 | ⚪ pending |
| REG-RT0-002 | rt-0.md schema | `agent_invitation_decided` 字段 (invitation_id/state/decided_at) | 飞马 | RT-0 | ⚪ pending |
| REG-RT0-003 | rt-0.md schema | `grep "BPP-1.*byte-identical" internal/ws/event_schemas.go` count≥1 (注释锁) | 飞马 | RT-0 | ⚪ pending |
| REG-RT0-004 | rt-0.md hub | `internal/api/agent_invitations_test.go::TestPOST_Triggers_SendToUser` (mock hub call==1) | 战马 | RT-0 | ⚪ pending |
| REG-RT0-005 | rt-0.md hub | `TestPATCH_Triggers_Broadcast_Decided` | 战马 | RT-0 | ⚪ pending |
| REG-RT0-006 | rt-0.md client | `packages/client/src/__tests__/ws-invitation.test.ts` ws frame → InvitationsInbox state 更新 | 战马 | RT-0 | ⚪ pending |
| REG-RT0-007 | rt-0.md fallback | E2E: ws disconnect 60s → polling 兜底 (#189 加补) | 烈马 | RT-0 | ⚪ pending |
| REG-RT0-008 | rt-0.md latency | E2E Playwright stopwatch: 邀请 → owner 通知 ≤ 3s | 烈马 | RT-0 | ⚪ pending |

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
| REG-INV-003 | bug-030 (CM-onboarding 后置) | `internal/store/welcome_test.go::TestListChannelsWithUnread_IncludesSystemWelcome` 双断言 (本人看见 type='system' #welcome + 别人看不见 — membership LEFT JOIN gate); `grep -n "c.type IN" internal/store/queries.go` count≥1 含 'system' (ListChannelsWithUnread + ListAllChannelsForAdmin WHERE 子句 must include system + membership 守门) | 烈马 | #203 + bug-030 fix 22ed221 | 🟢 active |

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
| INFRA-2 | 7 | 0 | 7 |
| ADM-0 | 10 | 3 | 7 |
| AP-0-bis | 6 | 6 | 0 |
| RT-0 | 8 | 0 | 8 |
| CM-onboarding | 13 | 5 | 8 |
| 跨 milestone 不变量 | 3 | 3 | 0 |
| CM-3 + G1.4 | 4 | 4 | 0 |
| **总计** | **59** | **29** | **30** |

Phase 2 全部 milestone 落地后, 预计 active 55 行 — G2.audit 时全员检视一遍 + 翻态 + sign off。

## 6. 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-28 | 烈马 | v1 初版, 收纳 #186/#185/#183 (active) + R3 5 milestone (pending) |
| 2026-04-28 | 烈马 | flip AP-0-bis 6 行 ⚪ → 🟢 (PR #206 merged) + 加 REG-INV-003 bug-030 守门 (ListChannelsWithUnread system membership) |
| 2026-04-28 | 烈马 | 加 CM-3 + G1.4 4 行 🟢 (PR #208 merged + audit 集成); Phase 1 引用区改 G1.4 ⏸️ → ✅; 总计 55 → 59, active 25 → 29 |
