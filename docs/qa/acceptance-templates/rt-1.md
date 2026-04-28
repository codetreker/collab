# Acceptance Template — RT-1: realtime cursor + backfill + BPP session.resume

> 蓝图: `realtime.md` §1.3 (人/agent 拆 replay) + §1.4 (cursor 去重) + §2.3 (`/ws` ↔ BPP envelope 等同) + §2.1 BPP `artifact.commit/progress` frame
> Implementation: `docs/implementation/modules/rt-1-spec.md` (#269)
> 拆 PR: **RT-1.1** server cursor (#290 merged d1538f5) + **RT-1.2** client backfill (待实施) + **RT-1.3** agent BPP session.resume (待实施)
> 飞马硬约束 (#267 readiness §5): 人/agent 两路 replay 拆死 — 人 full replay + 端虚拟列表; agent BPP `session.resume` 三 hint 由 runtime 自决。反约束: ❌ 一套 replay; ❌ agent default full
> Owner: 战马A 实施 / 烈马 验收

## 验收清单

### §1 server cursor 单调 + dedup (RT-1.1, 已实施)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 1.a 100 并发 commit cursor 严格递增无重复 (race detector) | unit (`-race`) | 战马A / 烈马 | `internal/ws/cursor_test.go::TestCursorMonotonicUnderConcurrency` (#290) — 100 goroutine 全唯一 + max==N 严格 |
| 1.b 重复 (artifact_id, version) → 同 cursor + fresh=false (32 racer 折叠) | unit | 战马A / 烈马 | `cursor_test.go::TestCursorIdempotentSameArtifactVersion` (#290) — racing AllocateForArtifact collapse to one cursor (results 全等) |
| 1.c restart 不回退 (pre-seed 3 events → fresh allocator PeekCursor==MAX + Next>MAX) | unit (fixture) | 战马A / 烈马 | `cursor_test.go::TestCursorNoRollbackAfterRestart` (#290) |
| 1.d ArtifactUpdatedFrame 字段顺序 byte-identical 于 #237 envelope (`type/cursor/artifact_id/version/channel_id/updated_at/kind`) | unit (golden JSON) | 飞马 / 烈马 | `cursor_test.go::TestArtifactUpdatedFrameFieldOrder` (#290) json.Marshal byte-equality vs literal want |

### §2 client backfill on reconnect (RT-1.2, 待实施)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 2.a 新 commit ≤ 3s 看到 (latency 截屏, G2.4 模板, stopwatch fixture) | e2e (Playwright) | 战马A / 烈马 | _(待 RT-1.2 PR)_ |
| 2.b 离线 30s × 5 commit → reconnect backfill 齐序 (cursor 单调 + 无丢) | e2e | 战马A / 烈马 | _(待 RT-1.2 PR)_ |
| 2.c 多端 (2 tab) 各看一份不重复 (cursor set dedup, ArtifactList 不双写) | e2e | 战马A / 烈马 | _(待 RT-1.2 PR)_ |
| 2.d `last_seen_cursor` localStorage 持久化 + WS open 带 `?since=N` (反向断言: 不 default 拉全 history) | unit + grep | 战马A / 烈马 | _(待 RT-1.2 PR)_; `grep -nE 'since=0\\b\|fullReplay\\s*=\\s*true' packages/client/src/realtime/` count==0 |

### §3 agent BPP session.resume 三 hint (RT-1.3, 待实施)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 3.a 三 hint table-driven 单测: `full` 推全 / `summary` 推 `{missed_count}` / `latest_n` 推最近 N | unit | 战马A / 烈马 | _(待 RT-1.3 PR)_ |
| 3.b 反向 grep `replay_mode.*=.*"full".*default\|defaultReplayMode` count==0 (server 不 default full) | CI grep | 飞马 / 烈马 | _(待 RT-1.3 PR)_ |
| 3.c BPP frame envelope 与 RT-1.1 `/ws` event byte-identical (§2.3 等同, golden JSON) | unit (golden) | 飞马 / 烈马 | _(待 RT-1.3 PR)_ |

### 蓝图行为对照 (反查锚, 每 PR 必带)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 4.a `grep -rEn 'artifact_updated.*timestamp\|"timestamp".*artifact_updated' packages/server-go/ packages/client/` count==0 (字段名锁 `updated_at`, 不混 `timestamp`) | CI grep | 飞马 / 烈马 | RT-1.1 #290 实测干净 (cursor.go 仅注释引述, 不算字段) |
| 4.b 人/agent 拆 replay: agent 路径不复用 client backfill (`grep -rE 'wsClient\.backfill\|client.*last_seen_cursor' internal/bpp/` count==0) | CI grep | 飞马 / 烈马 | _(待 RT-1.3 PR)_ |

## 退出条件

- §1 server (1.a-d) **全绿** ← #290 merged ✅
- §2 client (2.a-d) RT-1.2 PR merge 后翻 🟢
- §3 agent BPP (3.a-c) RT-1.3 PR merge 后翻 🟢
- 反查锚 (4.a-b) 每 PR 必跑 0 命中
- 登记 `regression-registry.md` REG-RT1-001..010 (RT-1.1 5 行 🟢 + RT-1.2 4 行 ⚪ + RT-1.3 1 行 ⚪)
- Phase 2 留账: G2.6 BPP CI lint (#274 BPP-1) + G2.5 presence (AL-3) — 不挡 RT-1
