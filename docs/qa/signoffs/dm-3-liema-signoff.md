# DM-3 agent-DM 多端 cursor sync (复用 RT-1.3 + RT-3) — 烈马 (QA acceptance) signoff

> **状态**: ✅ **SIGNED** (烈马 acceptance 代签, 2026-04-30, post-#508 merged)
> **范围**: DM-3 — DM cursor 复用 RT-1.3 既有 mechanism + 多端走 RT-3 fan-out + thinking subject 5-pattern 反约束延伸; **0 行 server 新增**
> **关联**: REG-DM3-001..005 5🟢; 跟 RT-1 #290 + RT-3 #488 + AL-2b #481 + CV-* + BPP-3.1 #494 共一根 cursor sequence

## 1. 验收清单 (5 项)

| # | 验收项 | 结果 | 实施证据 |
|---|---|---|---|
| ① | DM cursor 复用 RT-1.3 既有 mechanism, 不开 `/api/v1/dm/sync` 旁路 endpoint; DM messages 走 channel events 同 path (反 grep 4 forbidden path: `/api/v1/dm/sync\|cursor` + `/dm/sync\|cursor` 在 internal/api+server count==0) + backfill includes DM channel | ✅ | REG-DM3-001 (TestDM31_NoBypassEndpoint 反 grep 4 path + BackfillIncludesDMChannel GET /api/v1/channels/{dmID}/messages?since=N 200 + ≥1 backfill) |
| ② | 多端走 RT-3 fan-out, 不开 dm-only frame (反 envelope whitelist 加 `dm_session_changed/dm_synced/dm_multi_device_sync/dm_cursor_advanced` count==0; BPP-1 #304 reflect 自动覆盖) | ✅ | REG-DM3-002 (TestDM31_NoBypassFrame 反 grep 4 frame literal in internal/{bpp,ws,api} count==0) |
| ③ | thinking subject 5-pattern (`processing/responding/thinking/analyzing/planning`) 反约束延伸 (RT-3 #488 byte-identical 承袭, 改 = 改 5+ 处) | ✅ | REG-DM3-003 (e2e dm-3-multi-device-sync.spec.ts §3.2 全 channel messages body 反 5-pattern count==0 + REST-driven 验证) |
| ④ | client `useDMSync(dmChannelID)` hook 复用 useArtifactUpdated/lastSeenCursor 模式 — sessionStorage `borgee.dm3.cursor:<id>` round-trip + monotonic-only persistence; 反约束: 不订阅 `borgee:dm-sync` dm-only frame | ✅ | REG-DM3-004 (useDMSync.test.ts 5/5 vitest PASS — cold-start / monotonic / page-reload / corrupt-clamp / multi-device 独立 storage key) |
| ⑤ | server 0 行新增 (DM-3.1 复用 RT-1.3 events backfill, git diff `internal/api/` 仅含新 _test.go 反约束 grep test); cursor 跟 RT-1 #290 + AL-2b #481 + CV-* + BPP-3.1 #494 共一根 sequence | ✅ | REG-DM3-005 (dm_3_1_no_sync_endpoint_test.go 全 3 case + git diff 验证 production code 0 行新增 + e2e §3.1 REST-driven cursor reuse) |

## 2. 反向断言

- 0 server 实施代码新增立场守 (跟 CM-5 #476 立场关键 0 行 server 同精神)
- 不开 dm-only sync endpoint / dm-only frame (反向 grep 4+4 forbidden path/frame literal 0 hit)
- 不写独立 dm cursor 字典 — 复用 RT-1.3 既有 mechanism (sessionStorage `borgee.dm3.cursor:<id>` 复用 lastSeenCursor 模式)
- thinking 5-pattern 反约束延伸 RT-3 第 1 处 → DM-3 第 2 处 (锁链)

## 3. 留账

⏸️ DM-3 cross-device deviation handling (v2); ⏸️ G4.audit 飞马软 gate

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-30 | 烈马 | v0 — DM-3 acceptance ✅ SIGNED post-#508 merged. 5/5 验收 covers REG-DM3-001..005. 跨 milestone byte-identical: RT-1 #290 cursor sequence + RT-3 #488 fan-out + AL-2b #481 + CV-* + BPP-3.1 #494 共一根 sequence + thinking 5-pattern 反约束 RT-3 第 1 处 + DM-3 第 2 处 + 0 server 新增立场跟 CM-5 #476 同精神. |
