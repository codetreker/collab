# Implementation · Agent Lifecycle

> 蓝图: [`../blueprint/agent-lifecycle.md`](../blueprint/agent-lifecycle.md)
> 现状: agent 创建已存在 (admin API), 但状态只有 enabled/disabled 二态, 没有"故障态", 没有四态 UX, presence 只有 CM-4 引入的 minimal in-process map
> 阶段: ⚡ v0
> 所属 Phase: Phase 4

## 1. 现状 → 目标 概览

**现状**: agent 创建有, 状态二态, 无故障可解释; CM-4 已落 minimal presence (`IsOnline` 接口契约).
**目标**: blueprint 四条立场 — agent 创建完全用户决定 (无模板), 运行时默认 remote-agent 可选直连, 状态四态 + 故障可解释, 退役为禁用 (删除藏高级)。
**主要差距**:
1. 状态从二态扩到四态 (online / busy / error / offline) + 故障原因
2. agent 配置走平台下发 + 热更新 (blueprint §2.1 加条)
3. presence 完整版 (持久化 + 多端 + heartbeat 超时)

## 2. Milestones

### AL-1: 状态四态扩展

- **目标**: blueprint §2.3 — agent 四态 + 故障可解释。
- **Owner**: 飞马 (review 状态机) / 战马 / 野马 (UX 立场) / 烈马
- **范围**: `agent_status(agent_id, state, error_reason, updated_at)` 表; 状态机 `online ⇄ busy / online → error → online (recover) / offline`; UI 区分四态
- **依赖**: CM-4 (presence 接口)
- **预估**: ⚡ v0 1 周
- **Acceptance**: 行为不变量 4.1 (状态机非法转移单测) + 蓝图行为对照 §2.3

### AL-2: agent 配置 SSOT + 热更新

- **目标**: blueprint §2.1 加条 — agent 配置走平台下发, 不在 agent 平台里, 热更新立即生效。
- **Owner**: 飞马 / 战马 / 野马 / 烈马
- **范围**: `agent_configs(agent_id, schema_version, blob, updated_at)` 表; BPP 控制面 `ConfigUpdated` frame; plugin 收到立即 reload
- **依赖**: BPP-1 (协议骨架)
- **预估**: ⚡ v0 1 周
- **Acceptance**: E2E (改 config → plugin 1s 内 reload) + 行为不变量 (并发 update idempotent)

### AL-3: presence 完整版

- **目标**: 把 CM-4 的 minimal presence 扩到 multi-session + heartbeat 超时 + (可选) 跨进程 (留接口)。
- **Owner**: 飞马 (review 接口稳定) / 战马 / 野马 / 烈马
- **范围**: heartbeat (10s 间隔, 30s 超时); 同 agent 多 session; 超时自动清理
- **不在范围**: 跨进程 (Redis backed) ❌ — 留接口, 实现 v1+
- **依赖**: CM-4
- **预估**: ⚡ v0 4-5 天
- **Acceptance**: 行为不变量 (heartbeat 超时 → IsOnline=false, 单测)

### AL-4: 退役 = 禁用 (删除藏高级)

- **目标**: blueprint §2.4 — 退役默认禁用, 删除藏在高级菜单。
- **Owner**: 飞马 / 战马 / 野马 (UX) / 烈马
- **范围**: `disabled_at` 字段; 禁用 agent 不会被 mention; 删除二次确认 + 高级菜单
- **预估**: ⚡ v0 3 天
- **Acceptance**: E2E + 蓝图行为对照 §2.4

## 3. 不在 agent-lifecycle 范围

- agent 运行时本身 → BPP / plugin 模块
- agent 权限 → auth-permissions

## 4. Blueprint 反查表

| Milestone | §X.Y | 立场一句话 |
|-----------|------|-----------|
| AL-1 | agent-lifecycle §2.3 | 四态 + 故障可解释 |
| AL-2 | agent-lifecycle §2.1 加条 | 配置 SSOT 在平台, 热更新 |
| AL-3 | (实施加条) | presence 完整版, 不阻塞产品 |
| AL-4 | agent-lifecycle §2.4 | 退役 = 禁用, 删除高级 |
