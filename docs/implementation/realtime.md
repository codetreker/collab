# Implementation · Realtime

> 蓝图: [`../blueprint/realtime.md`](../blueprint/realtime.md)
> 现状: 当前已有 messages 推送, 但没有"活物感"动效, 没有 artifact 推送, 离线回放有 bug
> 阶段: ⚡ v0
> 所属 Phase: Phase 4

## 1. 现状 → 目标 概览

**现状**: 推送框架有, 但 "agent 在工作" 的活物感缺失; artifact 推送完全没有; 离线回放未拆人/agent。
**目标**: blueprint 四条立场 — 活物感 B+ 轻动效 (artifact 场景 C 强调), artifact 推送 agent 自决, 离线回放人/agent 拆分, 多端 A 全推。
**主要差距**: artifact 推送 / 回放拆分 / 智能推 v1 末优化。

## 2. Milestones

### RT-1: artifact 推送 (BPP frame)

- **目标**: blueprint §1.2 — artifact 推送 agent 自决, 不是 server 强推。
- **Owner**: 飞马 / 战马 / 野马 / 烈马
- **范围**: BPP 数据面 frame `ArtifactUpdated` (agent 主动发); server 转发到对应 workspace 的所有在线 client
- **依赖**: BPP-1, CV-1
- **预估**: ⚡ v0 4-5 天
- **Acceptance**: E2E (agent push artifact → 用户秒看到)

### RT-2: 离线回放 (人/agent 拆分) ⭐

- **目标**: blueprint §1.3 — 人和 agent 离线回放策略不同 (人重时间序, agent 重补漏)。
- **Owner**: 飞马 / 战马 / 野马 (立场关键) / 烈马
- **范围**: 回放 cursor (events 表 + 双流); 人客户端拉时间序; agent 重连拉自上次 ack 后的 missing
- **依赖**: BPP-1, DL-2 (events 表)
- **预估**: ⚡ v0 1 周
- **Acceptance**: 行为不变量 (agent 不漏 frame, 单测) + E2E (用户离线 1 小时, 上线后 inbox 顺序正确)

### RT-3: 多端在线全推 + 活物感动效

- **目标**: blueprint §1.4 + §1.1 — 多端 A 全推, 主界面 B+ 轻动效。
- **Owner**: 飞马 / 战马 / 野马 / 烈马
- **范围**: 多端 socket 全推 (后续 v1 末优化为智能推); thinking indicator / typing dots 等轻动效
- **预估**: ⚡ v0 1 周
- **Acceptance**: 用户感知签字 (野马: "感觉 agent 在动")

## 3. 不在 realtime 范围

- 智能推 (per-device 优化) → v1 末
- BPP 协议本身 → BPP

## 4. Blueprint 反查表

| Milestone | §X.Y | 立场一句话 |
|-----------|------|-----------|
| RT-1 | realtime §1.2 | artifact 推送 agent 自决 |
| RT-2 | realtime §1.3 | 人/agent 回放策略拆 |
| RT-3 | realtime §1.4 + §1.1 | 多端全推 + 轻动效活物感 |
