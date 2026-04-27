# Implementation · Realtime

> 蓝图: [`../../blueprint/realtime.md`](../../blueprint/realtime.md)
> 现状: 当前已有 messages 推送, 但没有"活物感"动效, 没有 artifact 推送, 离线回放未拆人/agent
> 阶段: ⚡ v0
> 所属 Phase: **RT-1 在 Phase 3 (CV-4 demo 必需), RT-2/RT-3 在 Phase 4**

## 1. 现状 → 目标 概览

**现状**: 推送框架有, "agent 在工作"活物感缺失; artifact 推送无; 离线回放未拆人/agent; thinking 无 subject 反约束未实施。
**目标**: blueprint §1.1~§1.4 + 核心 §11 — 活物感 B+ 轻动效, artifact 推送 agent 自决, 离线回放人/agent 拆, 多端 A 全推, **沉默胜于假 loading (thinking 必带 subject, 无 subject 不渲染)**。

## 2. Milestones

### RT-1: artifact 推送 (Phase 3, CV-4 demo 必需)

- **目标**: blueprint §1.2 — artifact 推送 agent 自决, 非 server 强推。
- **Owner**: 飞马 / 战马 / 野马 / 烈马
- **范围**: BPP 数据面 frame `ArtifactUpdated` (agent 主动发); server 转发到 workspace 在线 client
- **依赖**: BPP-1, CV-1
- **预估**: ⚡ v0 4-5 天
- **Acceptance**: E2E (agent push artifact → 用户秒看到, 无需轮询)

### RT-2: 离线回放 (人/agent 拆分)

> 野马 review: 取消 ⭐ 标志性 — 离线回放是健壮性, RT-3 升 ⭐ 替代。

- **目标**: blueprint §1.3 — 人/agent 回放策略不同 (人重时间序, agent 重补漏)。
- **Owner**: 飞马 / 战马 / 野马 (立场关键) / 烈马
- **范围**: 回放 cursor (events 双流); 人拉时间序; agent 重连拉 missing
- **依赖**: BPP-1, DL-2
- **预估**: ⚡ v0 1 周
- **Acceptance**: 行为不变量 4.1 (agent 不漏 frame, 单测) + E2E (用户离线 1h 后 inbox 顺序正确)

### RT-3: 多端全推 + 活物感 + thinking subject 反约束 ⭐

> 野马 review: 升 ⭐ — 活物感比离线回放更产品立场 (核心 §11)。

- **目标**: blueprint §1.4 + §1.1 + 核心 §11 — 多端 A 全推, 主界面 B+ 轻动效, **沉默胜于假 loading**。
- **Owner**: 野马 (主, demo+签字) / 战马 / 飞马 / 烈马
- **范围**:
  - 多端 socket 全推 (v1 末优化智能推)
  - thinking indicator / typing dots
  - **thinking subject 反约束**: agent frame 缺 subject → server reject + UI 不渲染 (核心 §11 立场)
- **预估**: ⚡ v0 1 周
- **Acceptance** (⭐ 标志性, 4.1+4.2 双挂):
  - 行为不变量 4.1: nil subject 的 typing/thinking frame → server reject + UI 不渲染 (单测; BPP-1 已有 grep 校验, 这里加端到端单测)
  - 用户感知签字 4.2 (野马跑 demo 截 3 张):
    - thinking 带 subject (例: "正在搜索 docs...")
    - 多端同步 (两个 client 同时看到)
    - **反约束截屏**: agent 试图发 nil subject → UI 空白, 不出现裸 spinner (验立场底线)

## 3. 不在 realtime 范围

- 智能推 (per-device 优化) → v1 末
- BPP 协议本身 → plugin-protocol

## 4. Blueprint 反查表

| Milestone | §X.Y | 立场一句话 |
|-----------|------|-----------|
| RT-1 | realtime §1.2 | artifact 推送 agent 自决 |
| RT-2 | realtime §1.3 | 人/agent 回放策略拆, 不漏不重 |
| RT-3 | realtime §1.4 + §1.1 + 核心 §11 | 多端全推 + 轻动效活物感 + thinking 必带 subject |
