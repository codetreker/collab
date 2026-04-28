# Acceptance Template — AL-3: presence (online/offline) + WS lifecycle hook + UI dot

> 蓝图: `docs/blueprint/agent-lifecycle.md` §2.3 (四态 + Phase 2 在线列表只承诺 online/offline + error 旁路) + §11 文案守 (Sidebar 不准 "灰点 + 不说原因")
> Contract 占号: `packages/server-go/internal/presence/contract.go` (#277, G2.5 留账锚) — `PresenceTracker.IsOnline` + `Sessions` 接口签名锁死
> Implementation: `docs/implementation/modules/al-3-spec.md` (待飞马出, 落后回填)
> 立场反查: 野马 AL-3 stance (待出, 落后回填)
> 拆 PR: **AL-3.1** schema (presence_sessions 表) — TBD / **AL-3.2** server hub lifecycle hook — TBD / **AL-3.3** client UI presence dot — TBD
> Owner: 战马A 实施 / 烈马 验收

## 验收清单

### §1 schema (AL-3.1) — presence_sessions 数据契约

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 1.1 `presence_sessions` 表: `(session_id PK, user_id NOT NULL, connected_at NOT NULL, last_seen_at NOT NULL)`; INDEX on `user_id` (O(1) IsOnline lookup 反约束) | migration drift test | 战马A / 烈马 | `internal/migrations/al_3_1_presence_sessions_test.go::TestAL31_CreatesPresenceSessionsTable` (TBD) |
| 1.2 contract.go 接口未变 (PresenceTracker.IsOnline + Sessions 签名 byte-identical 于 #277 占号) | unit (interface assertion) | 飞马 / 烈马 | `internal/presence/contract_drift_test.go::TestPresenceTrackerInterfaceLocked` — 编译期 var _ PresenceTracker = (*sessionsImpl)(nil) (TBD) |

### §2 server hub WS lifecycle hook (AL-3.2)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 2.1 WS `onConnect` → PresenceTracker.Track(userID, sessionID) 写表; `onDisconnect` → Untrack 删行; 异常路径 (panic / context cancel) 也走 Untrack (defer 反约束) | unit + race | 战马A / 烈马 | `internal/ws/hub_presence_test.go::TestHubTracksOnConnect` + `TestHubUntracksOnAnyDisconnect` (含 panic / ctx 取消两路, race detector) (TBD) |
| 2.2 IsOnline O(1) 多 session 同 user → 仅 last Untrack 才转 offline (反约束: 单 session close 不误判 offline) | unit | 战马A / 烈马 | `TestPresenceMultiSessionLastWinsOffline` (TBD) |
| 2.3 反向 grep: `internal/ws/` 不直接读写 presence_sessions 表, 只走 PresenceTracker 接口 (`grep -rE 'presence_sessions|sql.*Exec.*presence' internal/ws/ --exclude='*_test.go'` count==0) | CI grep | 飞马 / 烈马 | spec lint job, AL-3.2 PR 必跑 (TBD) |

### §3 client UI presence dot (AL-3.3) — 文案守 §11

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 3.1 sidebar agent 行 DOM 字面锁: online → `data-presence="online"` + 绿点 `<span class="presence-dot presence-online">`; offline → `data-presence="offline"` + 文本 `已离线` (NOT "灰点不说原因", 反约束 §11) | e2e + grep | 战马A / 烈马 | `packages/e2e/tests/al-3-3-presence-dot.spec.ts::立场 ① online/offline DOM lock` + `grep -n "已离线" packages/client/src/components/AgentSidebarRow.tsx` count≥1 (TBD) |
| 3.2 跟 DM-2 mention 离线 fallback 一致: server `IsOnline(agent)==false` → owner 收 system DM 文案 `{agent_name} 当前离线，#{channel} 中有人 @ 了它，你可能需要处理` (跨模块 contract pin, byte-identical 于 dm-2.md §2.2) | unit (server DM-2 reroute) | 战马A / 烈马 | `internal/api/mentions_offline_fallback_test.go::TestMentionFallbackUsesPresence` — fake PresenceTracker 注入 false (TBD) |

### 蓝图行为对照 (反查锚)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 4.1 反向 grep: `grep -rE '"busy"|"idle"|StateBusy|StateIdle' packages/server-go/internal/presence/ packages/client/src/components/AgentSidebarRow.tsx` count==0 (Phase 2 只承诺 online/offline + error, busy/idle 跟 BPP/AL-1 同期) | CI grep | 飞马 / 烈马 | spec lint job (TBD) |
| 4.2 反向 grep: `grep -rEn 'class=.*presence-dot[^"]*"\s*/?>' packages/client/src/` 每命中必带 sibling text (NOT 裸灰点, §11 文案守) | CI grep | 飞马 / 烈马 | manual review + lint hint, AL-3.3 PR 必跑 (TBD) |

## 退出条件

- §1 schema (1.1-1.2) + §2 server (2.1-2.3) + §3 client (3.1-3.2) **全绿** (一票否决)
- 反查锚 (4.1-4.2) 每 PR 必跑 0 命中 (busy/idle leak + 裸灰点)
- 跟 DM-2 mention offline fallback 跨模块 contract pin (§3.2) — 文案 byte-identical 锁
- 登记 `docs/qa/regression-registry.md` REG-AL3-001..007 (待飞马 spec 落后开号)
- busy / idle 不在 AL-3 范围 (Phase 4 AL-1 BPP 同期), 不挡 AL-3 闭合
- 飞马 spec brief + 野马 stance 落后, 烈马复审 patch 回填实施 PR # / 测试路径
