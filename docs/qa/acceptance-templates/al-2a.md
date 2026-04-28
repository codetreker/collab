# Acceptance Template — AL-2a: agent 配置 SSOT 表 + update API

> 蓝图: `docs/blueprint/agent-lifecycle.md` §2.1 (L28-39, "用户完全自主决定 agent 的 name/prompt/能力/model")
> 蓝图: `docs/blueprint/plugin-protocol.md` §1.4 (L63-91, Borgee=SSOT 字段划界) + §1.5 (L93-107, 热更新分级 — 字段下发, **AL-2a 不含 BPP frame**)
> Implementation: `docs/implementation/modules/agent-lifecycle.md` §AL-2 (L41-52, AL-2a 拆段)
> R3 决议: AL-2 拆 a/b — AL-2a 只落 config 表 + REST update API; agent 端 reload 走轮询; BPP `agent_config_update` frame 留给 AL-2b 与 BPP-3 同合 (战马 D5 锁紧)
> 依赖: 无 (可并行 CM-*)
> Owner: 战马A 实施 / 烈马 验收

## 拆 PR 顺序 (单 PR, 不串行)

- **AL-2a**: `agent_configs(agent_id, schema_version, blob, updated_at)` 表 + `PATCH /api/v1/agents/:id/config` update API + 并发 update idempotent + agent 端轮询 reload (临时, 等 AL-2b 切 BPP frame)

## 验收清单

### 数据契约 (蓝图 §1.4 字段划界)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| `agent_configs` 表 schema 字段固化 (agent_id PK / schema_version int / blob JSON / updated_at), schema_version 单调递增 | unit + migration test | 战马A / 烈马 | _(待填)_ |
| `blob` 仅含蓝图 §1.4 "归 Borgee 管" 字段 (name / avatar / prompt / model / 能力开关 / 启用状态 / memory_ref); CI grep 反向断言 blob schema 不含 `temperature`/`token_limit`/`api_key`/`retry_policy` (runtime-only 字段, fail-closed) | CI grep + JSON schema test | 战马A / 烈马 | _(待填)_ |

### 行为不变量 (闸 2 — AL-2a 4.1)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 4.1.a `PATCH /api/v1/agents/:id/config` 并发 2 写 → 末次胜出 + schema_version 严格递增 + 无丢失 (idempotent: 同 payload 重发不增 version) | unit (并发 goroutine) | 战马A / 烈马 | _(待填)_ |
| 4.1.b 跨 agent owner 调用 `PATCH .../config` → 403 (反向断言, 非本人 agent 不可改) | unit | 烈马 | _(待填)_ |
| 4.1.c response struct 反射扫描白名单: 不返回 `api_key`/`temperature`/`retry_policy` 等 runtime-only 字段 (fail-closed, REG-INV-002 同款扫描器) | unit (reflect scan) | 烈马 | _(待填)_ |
| 4.1.d agent 端轮询 reload: PATCH 后 ≤ 轮询周期内 GET `/api/v1/agents/:id/config` 返回新 blob + schema_version (drift test, 防止 cache 不刷) | unit (httptest + 时钟 mock) | 战马A / 烈马 | _(待填)_ |

### 蓝图行为对照 (闸 2)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| §1.5 BPP frame `agent_config_update` **不在** AL-2a 范围: `grep -rE 'agent_config_update' internal/ws/ internal/bpp/` count==0 (反向, 推到 AL-2b) | CI grep | 飞马 | _(待填)_ |
| §1.4 SSOT 立场: `users` 表 agent 行不再持有 `prompt`/`model` 列 (若存量字段 → backfill 入 agent_configs.blob + drop 列; v0 forward-only) | unit + migration test | 战马A / 烈马 | _(待填)_ |

### 退出条件

- 上表 7 项**全绿** (一票否决式: 任何 4.1.x 红 → 不签字)
- 战马A 引用 review 同意 + 烈马 acceptance 跑完
- 登记 `docs/qa/regression-registry.md` REG-AL2A-001..007 (PR merge 后 24h 内翻 ⚪ → 🟢)
