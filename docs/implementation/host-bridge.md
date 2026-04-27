# Implementation · Host Bridge (Borgee Helper)

> 蓝图: [`../blueprint/host-bridge.md`](../blueprint/host-bridge.md)
> 现状: 当前有 remote-agent (Tauri shell), 但只是窗口壳, 没有"信任五支柱", 没有 install-butler / host-bridge daemon 概念
> 阶段: ⚡ v0
> 所属 Phase: Phase 4

## 1. 现状 → 目标 概览

**现状**: remote-agent 是 Tauri 窗口壳, 没真正的 daemon; 安装 plugin / 调用 host 命令的能力都没有。
**目标**: blueprint 五条立场 — Borgee Helper = Tauri shell + install-butler daemon + host-bridge daemon (内部双 daemon UI 合一); 安全四件套 + 信任五支柱; 情境化授权 4 类; v1 不在 Borgee 跑命令, v2 推完整 host 桥。
**主要差距**: 几乎全新, 唯一已有的是 Tauri shell。

## 2. Milestones

### HB-1: install-butler daemon (plugin 安装管家)

- **目标**: blueprint §1.1 — 内部双 daemon, install-butler 负责 plugin 下载/校验/安装。
- **Owner**: 飞马 (review 安全模型) / 战马 / 野马 / 烈马
- **范围**: daemon 启动 + IPC 接口; 从 server 拉 plugin manifest; 签名校验; 安装到本地路径
- **不在范围**: plugin 自动更新 (v1+); 多源 registry ❌
- **预估**: ⚡ v0 1-2 周
- **Acceptance**: E2E (用户点装 plugin → daemon 下载装好可启动)

### HB-2: host-bridge daemon (host 命令通道, 仅查询)

- **目标**: blueprint §1.4 — v1 不在 Borgee 跑命令, 但要有桥接接口供未来 v2 推。
- **Owner**: 飞马 / 战马 / 野马 / 烈马
- **范围**: daemon 接 plugin 的"读类"请求 (列文件 / 读 env), 不做写; 所有读都走情境化授权
- **不在范围**: 写命令 / shell exec ❌ (v2)
- **依赖**: HB-1
- **预估**: ⚡ v0 1 周
- **Acceptance**: 行为不变量 (任何写类调用拒绝, 单测) + 数据契约 (IPC schema)

### HB-3: 情境化授权 4 类

- **目标**: blueprint §1.3 — 4 类授权分时机问 (一次 / 会话 / 30 天 / 永久)。
- **Owner**: 飞马 / 战马 / 野马 (UX 立场) / 烈马
- **范围**: 授权弹窗 + 持久化 (`host_grants(scope, ttl, granted_at)`); 不同 scope 不同 TTL
- **依赖**: HB-2
- **预估**: ⚡ v0 1 周
- **Acceptance**: E2E + 行为不变量 (TTL 过期回到询问)

### HB-4: 信任五支柱可见 ⭐

- **目标**: blueprint §2 — 五支柱 (开源 / 签名 / 可审计日志 / 可吊销 / 限定能力) 在 UI 可被用户读到。
- **Owner**: 野马 (主, demo 签字) / 战马 / 飞马 / 烈马
- **范围**: Helper 设置页可看每条支柱状态; 审计日志可导出
- **预估**: ⚡ v0 4-5 天
- **Acceptance**: 用户感知签字 4.2 (野马: "我作为用户敢装这个 daemon")

## 3. 不在 host-bridge 范围

- 写命令 / 完整 host 桥 → v2
- BPP 协议本身 → BPP 模块

## 4. Blueprint 反查表

| Milestone | §X.Y | 立场一句话 |
|-----------|------|-----------|
| HB-1 | host-bridge §1.1 | install-butler 负责 plugin 安装 |
| HB-2 | host-bridge §1.4 | v1 仅读, 不跑命令, 留接口 |
| HB-3 | host-bridge §1.3 | 4 类授权分时机问 |
| HB-4 | host-bridge §2 | 五支柱可见, 用户敢装 |
