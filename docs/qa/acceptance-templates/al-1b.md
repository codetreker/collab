# Acceptance Template — AL-1b busy/idle (BPP 同期)

> 蓝图: `docs/blueprint/agent-lifecycle.md` §2.3 (5-state) · Implementation: `docs/implementation/modules/al-1b-spec.md` (战马C v0)
> 前置: AL-1a (#249) ✅ + AL-3 (#310/#317/#324) ✅ + AL-4 (#398) ✅ + BPP-2 frame schema 留账 · Owner: 战马C 三段全做 / 验收 烈马 / 文案 野马
> 拆 PR: **AL-1b.1** schema (本 PR v=21) + **AL-1b.2** server endpoint + state machine (待 PR) + **AL-1b.3** client SPA dot UI (待 PR)

## 验收清单

### 数据契约 (AL-1b.1 schema v=21 — 立场 ① 拆三路径)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 1.1 agent_status 表三轴 (agent_id PK / state NOT NULL / last_task_id + last_task_started_at + last_task_finished_at nullable / created_at + updated_at NOT NULL) | migration test | 战马C / 烈马 | `internal/migrations/al_1b_1_agent_status_test.go::TestAL1B1_CreatesAgentStatusTable` |
| 1.2 state CHECK ('busy','idle') 2 态 byte-identical + 反约束枚举外 reject (AL-1a 三态 online/offline/error + AL-4 4 态 + 同义词漂 active/working/idling) | migration test | 战马C / 烈马 | `TestAL1B1_AcceptsBusyIdleEnum` (2 态 PASS + 11 反约束 reject) |
| 1.3 反约束 NoDomainBleed 9 列反向 (is_online / presence / last_error_reason / endpoint_url / process_kind / source / set_by / cursor — 立场 ①② 拆 AL-3/AL-4/反人工伪造) | migration test | 战马C / 烈马 | `TestAL1B1_NoDomainBleed` |
| 1.4 v=21 sequencing + idempotent (CV-2.1 v=14 / DM-2.1 v=15 / AL-4.1 v=16 / CV-3.1 v=17 / CV-4.1 v=18 / CHN-3.1 v=19 / CHN-4.1 v=20 / **AL-1b.1 v=21**) + IF NOT EXISTS 守 | migration test | 战马C / 烈马 | `TestAL1B1_Idempotent` + `registry.go` 字面锁 |
| 1.5 INDEX idx_agent_status_state busy 列表 lookup 热路径 + NoCascadeDelete (蓝图 §2.3 保留状态历史 + 跟 al_3_1 / al_4_1 同逻辑 FK 模式) | migration test | 战马C / 烈马 | `TestAL1B1_HasStateIndex` + `TestAL1B1_NoCascadeDelete` |

### 状态机不变量 (AL-1b.2 server — 5-state 合并 + BPP frame state machine)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 2.1 GET /api/v1/agents/:id/status 5-state 合并优先级 (error > busy > idle > online > offline) | unit | 战马C / 烈马 | _(待填 AL-1b.2)_ |
| 2.2 BPP `task_started` frame → state=busy + last_task_id + last_task_started_at | unit | 战马C / 烈马 | _(待填 AL-1b.2 + BPP-2)_ |
| 2.3 BPP `task_finished` frame → state=idle + last_task_finished_at | unit | 战马C / 烈马 | _(待填 AL-1b.2 + BPP-2)_ |
| 2.4 5min 无 frame → 自动 idle (单 const `IdleThreshold = 5*time.Minute`) | unit | 战马C / 烈马 | _(待填 AL-1b.2)_ |
| 2.5 PATCH /api/v1/agents/:id/status admin god-mode 拒绝 (立场 ② BPP 单源, 反人工伪造) | unit | 战马C / 烈马 | _(待填 AL-1b.2)_ |

### 文案锁 (AL-1b.3 client — 野马 #190 §11 + 烈马判定)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 3.1 `describeAgentState(busy)` → "在工作" tone='ok'; 反 "活跃" / "running" 模糊 | vitest (agent-state.test.ts 扩 it) | 野马 / 烈马 | _(待填 AL-1b.3)_ |
| 3.2 `describeAgentState(idle)` → "空闲" tone='muted'; 反 "等待中" / "Standing by" | vitest | 野马 / 烈马 | _(待填 AL-1b.3)_ |
| 3.3 AL-1a 三态文案不变 ("在线" / "已离线" / "故障 (xxx)"): REG-AL1A-005 不破 | vitest 回归 | 烈马 | _(待填 AL-1b.3)_ |
| 3.4 `grep -nE "活跃\|standing by\|running" packages/client/src/lib/agent-state.ts` count==0 | CI grep | 烈马 | _(待填 AL-1b.3)_ |

### e2e (Playwright)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 4.1 发任务 → "在工作" ≤ 1s; 结束 → "空闲" ≤ 1s + 5min → "在线" | E2E stopwatch + faked clock | 烈马 / 野马 | _(待填 AL-1b.3 + BPP-2)_ |

## 退出条件

- 数据契约 5 项 (AL-1b.1 本 PR ✅) + 行为不变量 5 项 (AL-1b.2 + BPP-2) + 文案 4 项 (AL-1b.3) + e2e 1 项**全绿** (一票否决)
- AL-1a REG-AL1A-001..005 回归不破 + AL-3 REG-AL3-001..010 回归不破 + AL-4 REG-AL4-001..005 回归不破 (立场 ① 拆三路径)
- 野马 G2.4 文案签字 + e2e 截屏入 `docs/qa/screenshots/g3.x-al-1b-*.png` + REG-AL1B-001..006 落 6 行 (本 PR 占号 ⚪..🟢 待 follow-up patch)

## 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-28 | 烈马 | v0 — Phase 4 AL-1b 14 验收项 (rt-0.md 同模板) |
| 2026-04-29 | 战马C | flip §1.1-§1.5 schema 段 5 项 ⚪→✅ (AL-1b.1 v=21 落 — `internal/migrations/al_1b_1_agent_status.go` + 6 TestAL1B1_* 全 PASS); 锚 spec brief `docs/implementation/modules/al-1b-spec.md` (战马C v0 3 立场 + 3 拆段); §2 server / §3 文案 / §4 e2e 留 AL-1b.2 + AL-1b.3 + BPP-2 后填. |
