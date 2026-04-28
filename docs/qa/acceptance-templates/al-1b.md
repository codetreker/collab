# Acceptance Template — AL-1b busy/idle (BPP 同期)

> 蓝图: `docs/blueprint/agent-lifecycle.md` §2.3 (5-state) · Implementation: `docs/implementation/modules/agent-lifecycle.md` AL-1b
> 前置: AL-1a (#249) ✅ + BPP-1 frame schema 落 · Owner: 战马A (Phase 4 接 BPP-1 后) / 验收 烈马 / 文案 野马

## 验收清单

### 数据契约 (BPP frame, byte-identical 锁)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| BPP frame `task_started` 字段固化 (agent_id / task_id / started_at) | unit + CI grep | 战马A / 烈马 | _(待填)_ |
| BPP frame `task_finished` 字段固化 (agent_id / task_id / finished_at) | unit + CI grep | 战马A / 烈马 | _(待填)_ |
| `bpp/frame_schemas.go ↔ ws/event_schemas.go` byte-identical CI lint 启用 (G2.6 留账闭) | CI grep | 战马A | _(待填)_ |

### 状态机不变量 (5-state)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| Tracker 扩 busy/idle 字段, 优先级 error > busy > idle > online > offline (AL-1a 兼容) | unit | 战马A / 烈马 | _(待填)_ |
| `task_started` → busy (AL-1a `Resolve` 加 task in-flight 检测) | unit | 战马A | _(待填)_ |
| `task_finished` → idle (有连接 + 无 task in-flight) | unit | 战马A | _(待填)_ |
| busy → idle 自动: 5min 无 frame → idle (单一 const `IdleThreshold = 5*time.Minute`) | unit | 战马A | _(待填)_ |
| idle → online: 重连 / 显式心跳 (idle = "连着但闲" 非 "断了") | unit | 战马A | _(待填)_ |

### 文案锁 (野马 #190 §11 + 烈马判定)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| `describeAgentState(busy)` → "在工作" tone='ok'; 反 "活跃" / "running" 模糊 | vitest (agent-state.test.ts 扩 it) | 野马 / 烈马 | _(待填)_ |
| `describeAgentState(idle)` → "空闲" tone='muted'; 反 "等待中" / "Standing by" | vitest | 野马 / 烈马 | _(待填)_ |
| AL-1a 三态文案不变 ("在线" / "已离线" / "故障 (xxx)"): REG-AL1A-005 不破 | vitest 回归 | 烈马 | _(待填)_ |
| `grep -nE "活跃\|standing by\|running" packages/client/src/lib/agent-state.ts` count==0 | CI grep | 烈马 | _(待填)_ |

### e2e (Playwright)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 发任务 → "在工作" ≤ 1s; 结束 → "空闲" ≤ 1s + 5min → "在线" | E2E stopwatch + faked clock | 烈马 / 野马 | _(待填)_ |

## 退出条件

- 14 项全绿 + AL-1a REG-AL1A-001..005 回归不破 + BPP-1 frame schema CI lint 通过 (G2.6 闭)
- 野马 G2.4 文案签字 + e2e 截屏入 `docs/evidence/al-1b/` + REG-AL1B-001..006 落 6 行 ⚪→🟢 + AUD-G2-AL1A 翻 ✅ stable

## 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-28 | 烈马 | v0 — Phase 4 AL-1b 14 验收项 (rt-0.md 同模板) |
