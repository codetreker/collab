# Acceptance Template — AL-3: presence (online/offline) + WS lifecycle hook + UI dot

> 蓝图: `docs/blueprint/agent-lifecycle.md` §2.3 (Phase 2 在线列表只承诺 online/offline + error 旁路, busy/idle 留 Phase 4 BPP-1 同期) + §11 文案守 (Sidebar 不准 "灰点 + 不说原因")
> Contract 占号: `packages/server-go/internal/presence/contract.go` (#277, G2.5 留账锚) — `PresenceTracker.IsOnline` + `Sessions` 接口签名锁死 (read 端不动, AL-3 仅扩 write)
> Implementation: `docs/implementation/modules/al-3-spec.md` (飞马 #301, 3 立场 + 6 grep 锚 + 5 反约束)
> 立场反查: `docs/qa/al-3-stance-checklist.md` (野马 #303, 7 项立场 — agent-only / 三态 / 单一真源 / 跨 org / 5s+60s / 隐藏多端 / admin 白名单)
> 拆 PR: **AL-3.1** schema (`presence_sessions` 表 + migration v=12) — TBD / **AL-3.2** server hub lifecycle hook + PresenceTracker 写端 — TBD / **AL-3.3** client UI presence dot — TBD
> Owner: 战马A 实施 / 烈马 验收

## 验收清单

### §1 schema (AL-3.1) — presence_sessions 数据契约

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 1.1 `presence_sessions` 表: `user_id NOT NULL` + `session_id UNIQUE NOT NULL` + `connected_at NOT NULL` + `last_heartbeat_at NOT NULL`; INDEX `idx_presence_sessions_user_id` (O(1) IsOnline lookup 必需); migration v=11 → v=12 双向 | migration drift test | 战马A / 烈马 | `internal/migrations/al_3_1_presence_sessions_test.go::TestAL31_CreatesPresenceSessionsTable` + `TestAL31_RejectsDuplicateSessionID` (TBD) |
| 1.2 contract.go read 端接口签名 byte-identical 于 #277 (`IsOnline(userID) bool` + `Sessions(userID) []string`); AL-3 仅扩 write 端 (`TrackOnline` / `TrackOffline`), 不改 read | unit (interface assertion) | 飞马 / 烈马 | `internal/presence/contract_drift_test.go::TestPresenceTrackerInterfaceLocked` — 编译期 `var _ PresenceTracker = (*sessionsImpl)(nil)` (TBD) |

### §2 server hub WS lifecycle hook (AL-3.2)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 2.1 WS `onConnect` → `TrackOnline(userID, sessionID)` 写表; `onDisconnect` → `TrackOffline` 删行; 异常路径 (panic / context cancel) 也走 TrackOffline (defer 反约束) | unit + race | 战马A / 烈马 | `internal/ws/hub_presence_test.go::TestHubTracksOnConnect` + `TestHubUntracksOnAnyDisconnect` (含 panic / ctx 取消两路, race detector) (TBD) |
| 2.2 IsOnline O(1) 多 session 同 user → 仅 last TrackOffline 才转 offline (反约束: 单 session close 不误判 offline; 多端是实施细节, API 仍单 online — 立场 ⑥) | unit | 战马A / 烈马 | `TestPresenceMultiSessionLastWinsOffline` (TBD) |
| 2.3 单一 IsOnline 真源 (立场 ③): mention 路由 + sidebar 渲染 + DM-2 fallback 三处共用; 反向 grep `func.*IsOnline\|func.*IsAgentOnline` 在 `internal/` 下 (排除 `internal/presence/` + `_test.go`) count==0 | CI grep | 飞马 / 烈马 | spec lint job, AL-3.2 PR 必跑 (TBD) |
| 2.4 时序: server 端 presence 变更 5s 节流推送 + 60s 心跳超时 → 标 offline (立场 ⑤; clock fixture 单测, 跟 G2.3 节流模式同) | unit (clock fixture) | 战马A / 烈马 | `internal/presence/throttle_test.go::TestPresenceChange5sCoalesce` + `TestPresenceHeartbeatTimeout60s` (mock clock, 不依赖 wall time) (TBD) |
| 2.5 `presence.changed` frame 独立路径 (不进 RT-1 ArtifactUpdated envelope, 跟 cursor 序列拆死); frame schema 字段白名单 `{agent_id, status, reason?}`, 不带 `last_heartbeat_at` / `connection_count` / `endpoints[]` (立场 ⑥) | unit (golden JSON) | 飞马 / 烈马 | `internal/ws/presence_frame_test.go::TestPresenceChangedFrameFieldOrder` + `TestPresenceFrameOmitsRuntimeInternals` (TBD) |

### §3 client UI presence dot (AL-3.3) — 文案守 §11

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 3.1 sidebar agent 行 DOM 字面锁: online → `data-presence="online"` + 绿点 `<span class="presence-dot presence-online">`; offline → `data-presence="offline"` + 文本 `已离线` (NOT "灰点不说原因", 反约束 §11); error → `data-presence="error"` + reason 文案 (跟 #249 6 reason codes byte-identical) | e2e + grep | 战马A / 烈马 | `packages/e2e/tests/al-3-3-presence-dot.spec.ts::立场 ① online/offline/error DOM lock` + `grep -n "已离线" packages/client/src/components/AgentSidebarRow.tsx` count≥1 (TBD) |
| 3.2 仅 agent 行带 dot, 人 (role='user'/'admin') 行无 presence 槽位 (立场 ① 永久不开人 presence; 反约束 e2e: 人元素 `[data-presence]` count==0) | e2e | 战马A / 烈马 | `al-3-3-presence-dot.spec.ts::立场 ② only-agent` — `expect(page.locator('[data-role="user"][data-presence]')).toHaveCount(0)` (TBD) |
| 3.3 跟 DM-2 mention 离线 fallback 单一真源 (立场 ③): server `presence.IsOnline(agent_id)==false` → owner 收 system DM 文案 `{agent_name} 当前离线，#{channel} 中有人 @ 了它，你可能需要处理` (跨模块 contract pin, byte-identical 于 dm-2.md §2.2) | unit (server DM-2 reroute) | 战马A / 烈马 | `internal/api/mentions_offline_fallback_test.go::TestMentionFallbackUsesPresence` — fake PresenceTracker 注入 false (TBD) |
| 3.4 跨 org 同 channel 成员都看到 agent presence (立场 ④ 跨 org 邀请进来的 agent owner 也看在线) | e2e | 战马A / 烈马 | `al-3-3-presence-dot.spec.ts::立场 ④ cross-org` — orgA channel 邀 orgB agent, orgA owner 视图 dot 渲染同语义 (TBD) |

### §4 admin god-mode 元数据白名单 (立场 ⑦)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 4.1 `/admin-api/agents/:id` 返回 `{status, reason, last_offline_at}` 字段白名单, 不返回 `current_message_in_flight` / `active_channel_ids` / `endpoints[]` (ADM-0 §1.3 红线复用 REG-ADM0); admin 不触发 agent ping/wake (admin 只观测) | unit + grep | 战马A / 烈马 | `internal/api/admin_agents_test.go::TestAdminGodModeOmitsPresenceInternals` + `grep -rnE 'current_message\|active_channel_ids\|in_flight' internal/api/admin*.go --exclude='*_test.go'` count==0 (TBD) |
| 4.2 跨 org 默认隐私反约束 (#301 spec §4): 未邀请进 channel 的 cross-org 调用方 `IsOnline(agent_id)` 返回 false (隐私默认, 不暴露在线性); 仅 §3.4 跨 org 邀请进入同 channel 后才同显 (立场 ④) | unit | 战马A / 烈马 | `internal/presence/cross_org_test.go::TestIsOnlineDefaultsFalseForCrossOrgWithoutChannelMembership` (TBD) |

### §5 蓝图行为对照 (反查锚, 每 PR 必带)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 5.1 反向 grep: `grep -rEn '"busy"\|"idle"\|StateBusy\|StateIdle' packages/server-go/internal/presence/ packages/client/src/components/AgentSidebarRow.tsx` count==0 (立场 ②, busy/idle 跟 BPP-1 #280 同期) | CI grep | 飞马 / 烈马 | spec lint job (TBD) |
| 5.2 反向 grep: `grep -rnE 'last_heartbeat\|connection_count\|endpoints\[\]' packages/server-go/internal/api/ --exclude='*_test.go'` count==0 (立场 ⑥ 不暴露心跳/多端) | CI grep | 飞马 / 烈马 | spec lint job (TBD) |
| 5.3 反向 grep: `grep -rnE 'presence_sessions.*cursor\|cursor.*presence' packages/server-go/` count==0 (跟 RT-1 cursor 序列拆死, 飞马 #301 锚) | CI grep | 飞马 / 烈马 | spec lint job (TBD) |
| 5.4 反向 grep: `grep -rEn 'class=.*presence-dot[^"]*"\s*/?>' packages/client/src/` 每命中必带 sibling text (NOT 裸灰点, §11 文案守) | CI grep | 飞马 / 烈马 | manual review + lint hint, AL-3.3 PR 必跑 (TBD) |

## 退出条件

- §1 schema (1.1-1.2) + §2 server (2.1-2.5) + §3 client (3.1-3.4) + §4 admin (4.1) **全绿** (一票否决)
- 反查锚 (5.1-5.4) 每 PR 必跑 0 命中 (busy/idle leak + 心跳/多端 leak + cursor 混淆 + 裸灰点)
- DM-2 mention offline fallback 跨模块 contract pin (3.3) — 文案 byte-identical 锁
- admin god-mode 元数据白名单 (4.1) — REG-ADM0 复用反向断言
- 登记 `docs/qa/regression-registry.md` REG-AL3-001..010 (待战马A 实施 PR 落后开号回填)
- busy / idle 不在 AL-3 范围 (立场 ②, Phase 4 BPP-1 同期), 不挡 AL-3 闭合
- 飞马 spec #301 + 野马 stance #303 已锚, 烈马复审 patch 回填实施 PR # / 测试路径
