# Implementation · Plugin Protocol (BPP)

> 蓝图: [`../../blueprint/plugin-protocol.md`](../../blueprint/plugin-protocol.md)
> 现状: 当前有 OpenClaw plugin 私有协议, 没有"BPP 中立协议"概念
> 阶段: ⚡ v0 (允许直接换协议, plugin 同步发版)
> 所属 Phase: Phase 4

## 1. 现状 → 目标 概览

**现状**: server ↔ OpenClaw plugin 之间是私有协议, 紧耦合; plugin 实例 = runtime 实例的边界没明确; 配置不是 SSOT。
**目标**: blueprint 六条立场 — BPP 中立协议 (OpenClaw 是 reference impl), plugin 调 server 走抽象语义层, 配置 SSOT, 热更新, 失联状态可解释。
**主要差距**: 协议抽象重写, 全部接口重新定义。

## 2. Milestones

### BPP-1: 协议骨架 (frame + 控制/数据双面 + 直连 flag)

- **目标**: blueprint §1.1 + §1.2 + agent-lifecycle §2.2 — plugin 实例 = runtime 实例, BPP 中立; 同时承载"默认 remote-agent, 可选直连" (transport flag)。
- **Owner**: 飞马 (主, 协议设计) / 战马 (实现) / 野马 / 烈马
- **范围**: WS 长连接; frame 格式 (type, request_id, payload); 控制面 + 数据面 各 ≤ 5 个核心 verb; **transport flag** (`relay-via-helper` 默认 / `direct` 可选)
- **不在范围**: protocol_version 协商 ❌ (v0 直换); 灰度发版 ❌ (v1+)
- **预估**: ⚡ v0 2 周 (战马实测; frame+WS+10 verb+plugin 改造)
- **Acceptance**:
  - 数据契约: frame schema 文件存在
  - E2E: OpenClaw plugin 用新协议连上 server (relay 模式) + 1 个 plugin 用 direct 模式连上
  - 行为不变量 4.1 (验证 §7 "Borgee 不带 runtime"): `grep -rE "openai|anthropic|hermes|os/exec|spawn|fork" apps/server/internal/` 命中 = 0; CI lint 强制
  - 行为不变量 4.1 (验证 §11): plugin 发 typing/thinking frame 时 subject 字段为空 → server 拒绝并日志 (单测覆盖)

### BPP-2: 抽象语义层 (plugin → server)

- **目标**: blueprint §1.3 — plugin 调 server 不直对 REST, 走抽象语义层。
- **Owner**: 飞马 / 战马 / 野马 / 烈马
- **范围**: `SendMessage / GetChannel / RequestPermission / ReportStatus` 等语义动作, 不暴露 HTTP path
- **依赖**: BPP-1
- **预估**: ⚡ v0 1 周
- **Acceptance**: 蓝图行为对照 §1.3 (grep plugin 代码无 HTTP path)

### BPP-3: 配置 SSOT + 热更新 (与 AL-2b 同合)

- **目标**: blueprint §1.4 + §1.5 — Borgee 是 agent 配置 SSOT, 热更新按字段分类生效。
- **Owner**: 飞马 / 战马 / 野马 / 烈马
- **范围**: 字段分类 (即时生效 / 重连生效 / 手动触发); BPP `ConfigUpdated` frame schema (与 AL-2b 联合定义, **同一 PR 合并**)
- **依赖**: BPP-1, **AL-2a** (config 表已就位); 与 **AL-2b** (BPP frame) 同一 PR
- **预估**: ⚡ v0 1 周
- **Acceptance**: 行为不变量 4.1 (即时类字段 1s 内生效, fake clock 单测) + 数据契约 (字段分类表)

### BPP-4: 失联与故障状态

- **目标**: blueprint §1.6 — 失联状态可解释, 跟 agent 状态联动。
- **Owner**: 飞马 / 战马 / 野马 / 烈马
- **范围**: heartbeat (BPP frame); 失联触发 agent 状态 → error; 重连恢复
- **依赖**: BPP-1, AL-1
- **预估**: ⚡ v0 4-5 天
- **Acceptance**: E2E (kill plugin → 30s 内 agent 显示 error)

## 3. 不在 BPP 范围

- runtime 本身 → plugin 实现 (OpenClaw / Hermes)
- BPP 灰度发版机制 → v1 阶段 v0→v1 切换 checklist

## 4. Blueprint 反查表

| Milestone | §X.Y | 立场一句话 |
|-----------|------|-----------|
| BPP-1 | plugin-protocol §1.1 + §1.2 + agent-lifecycle §2.2 + 核心 §7 + §11 | BPP 中立 + 直连 flag + server 不带 runtime + thinking 必带 subject |
| BPP-2 | plugin-protocol §1.3 | plugin 调 server 走语义层不直对 REST |
| BPP-3 | plugin-protocol §1.4 + §1.5 | 配置 SSOT, 热更新分类生效 |
| BPP-4 | plugin-protocol §1.6 | 失联可解释, 联动状态 |
