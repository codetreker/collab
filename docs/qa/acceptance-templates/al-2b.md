# Acceptance Template — AL-2b: `agent_config_update` BPP frame + ack 路径

> 蓝图: `docs/blueprint/plugin-protocol.md` §1.5 (L93-107, 热更新分级 + 幂等 reload + runtime 不缓存) + §2.1 (L138-141, `agent_config_update` 控制面帧 server→plugin)
> 蓝图: `docs/blueprint/agent-lifecycle.md` §2.1 (用户改完 PATCH → plugin 立即收 → 下条消息渲染就用新值)
> Implementation: `docs/implementation/modules/agent-lifecycle.md` §AL-2 (AL-2b 拆段, 与 BPP-3 同合)
> 配套: AL-2a (#264 落 SSOT 表 + REST update + **轮询 reload 临时**) + BPP-1 envelope CI lint (#274/#280, frame envelope byte-identical 已锁)
> Owner: 战马B (待 spawn) 或战马A 实施 / 烈马 验收

## 拆 PR 顺序 (单 PR, 不串行 — BPP-3 依赖 BPP-1 frame_schemas.go merged)

- **AL-2b**: `agent_config_update` BPP 控制面帧 (server→plugin) + ack 回路 (plugin→server `agent_config_ack`) + plugin 幂等 reload + 退轮询 (AL-2a 临时路径下线)

## 验收清单

### 数据契约 (蓝图 §2.1 + envelope 锁)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| `agent_config_update` frame schema 字段固化 (`agent_id` / `schema_version` / `blob` / `idempotency_key`); envelope 5 字段 (type/op/ts/v/payload) 与 RT-0 #237 + BPP-1 #280 byte-identical | unit (反射对比 + schema_equivalence_test.go) | 飞马 / 烈马 | _(待填)_ |
| `agent_config_ack` frame schema (`agent_id` / `schema_version` / `status: applied|rejected|stale` / `reason`); direction 锁 plugin→server | unit (struct tag + reflect direction) | 飞马 / 烈马 | _(待填)_ |

### 行为不变量 (闸 2 — AL-2b 4.1)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 4.1.a server PATCH `/api/v1/agents/:id/config` 成功后 ≤ 1s 内 plugin 收到 `agent_config_update` frame (delivery latency 硬线, RT-0 #239 stopwatch 同模式) | E2E (ws fixture + clock) | 烈马 | _(待填)_ |
| 4.1.b 同一 `idempotency_key` 重发 N 次 → plugin reload 行为只触发 1 次 (蓝图 §1.5 "幂等 reload"); ack 含相同 schema_version, status=`applied` (首次) / `stale` (重发) | unit (plugin 端 stub + 重发计数) | 战马B / 烈马 | _(待填)_ |
| 4.1.c `schema_version` 落后于 server (plugin 收到的 < server 当前) → ack `status=stale` + plugin 主动拉最新; runtime **不**用旧 blob 跑下次 inference (蓝图 §1.5 "不缓存") | unit + E2E | 战马B / 烈马 | _(待填)_ |
| 4.1.d 跨 owner agent_id 调 frame 入站 → server-side 拒 + 不下发 (反向断言, REG-INV-002 fail-closed 扫描复用) | unit (反向 dispatch) | 烈马 | _(待填)_ |

### 蓝图行为对照 (闸 2)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| §1.5 字段分类生效: `name`/`avatar`/能力开关 立即; `prompt`/`model` 下次 inference; **不打断正在生成回复** (in-flight inference 用旧 blob 跑完) | unit + scenario test | 战马B / 烈马 | _(待填)_ |
| AL-2a 临时轮询路径下线: `grep -rE 'config_poll|pollAgentConfig' internal/ packages/server-go/` count==0 (drift, 防 BPP frame + 轮询双轨并存) | CI grep | 烈马 | _(待填)_ |

### 退出条件

- 上表 8 项**全绿** (一票否决式: 任何 4.1.x 红 → 不签字)
- 飞马引用 review 同意 (envelope 锁 + direction tag) + 烈马 acceptance 跑完
- 登记 `docs/qa/regression-registry.md` REG-AL2B-001..008 (PR merge 后 24h 内翻 ⚪ → 🟢)
- AL-2a 7 项 REG-AL2A-* 中 4.1.d (轮询 reload) 行同步降 ⛔ broken (路径下线, 由 AL-2b frame 替代)
