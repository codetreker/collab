# Implementation · Canvas Vision

> 蓝图: [`../../blueprint/canvas-vision.md`](../../blueprint/canvas-vision.md)
> 现状: 当前没有 artifact / 画布概念, workspace 表都还没建 (CHN-1 之后才有)
> 阶段: ⚡ v0
> 所属 Phase: Phase 3

## 1. 现状 → 目标 概览

**现状**: 完全无 — workspace 是新概念 (CHN-1 引入), artifact 是更新的概念。
**目标**: blueprint 五条立场 — workspace = artifact 集合, agent 可 iterate, 锚点对话 = 人机界面 (不是 agent 间通信), 画布是轻量画布 (D-lite, 不是 Miro)。
**主要差距**: artifact 表 / 版本机制 / agent 操作能力 / 锚点 (anchor comment) / D-lite 渲染 — 全部从 0 起。

## 2. Milestones

### CV-1: artifact 表 + 版本机制 ⭐ (Phase 3 标志性 milestone)

- **目标**: blueprint §1.4 + §1.5 — workspace = artifact 集合, agent 可创建并 iterate。
- **Owner**: 野马 (主, demo+签字) / 战马 (实现) / 飞马 (review schema 长期演进) / 烈马 (E2E)
- **范围**:
  - `artifacts(id, workspace_id, org_id, kind, current_version_id, created_at)` 表
  - `artifact_versions(id, artifact_id, content_blob, author_id, created_at)` 表 (版本不可变)
  - agent 创建 artifact 的最小 API (kind=note 起步)
  - workspace UI 列出 artifacts
- **不在范围**: D-lite 画布渲染 (CV-3); 锚点 (CV-2); 协同编辑 ❌ (v1+)
- **依赖**: CHN-1 (workspace 表)
- **预估**: ⚡ v0 1 周
- **PR 拆分**:
  - CV-1.1 schema + 创建 API (战马 / 飞马 / 烈马 数据契约)
  - CV-1.2 版本不可变约束 + 列表 API (战马 / 飞马 / 烈马 行为不变量: 旧版本不可改)
  - CV-1.3 workspace UI 列 artifacts (战马 / 飞马 / 野马 立场 / 烈马 E2E)
- **Acceptance**: E2E (agent 创建 note → 用户 workspace 看到) + 行为不变量 (版本不可变) + 用户感知签字 (野马: "感觉 workspace 里有东西在长出来")

### CV-2: 锚点对话 (anchor comments)

- **目标**: blueprint §1.6 — 锚点 = 人机界面, 不是 agent 间通信。
- **Owner**: 飞马 / 战马 / 野马 / 烈马
- **范围**: `anchor_comments(id, artifact_version_id, anchor_path, body, author_id)` 表; 用户可在 artifact 某处加 comment, agent 看到后可在新版本响应
- **不在范围**: agent 之间互发 anchor ❌ (蓝图明确禁止)
- **依赖**: CV-1
- **预估**: ⚡ v0 4-5 天
- **Acceptance**: E2E (用户加锚点 → agent 收到 → 出新版本) + 行为不变量 (agent → agent 锚点拒绝, 单测)

### CV-3: D-lite 画布渲染

- **目标**: blueprint §1.2 — 轻量画布 (不是 Miro), kind=canvas artifact 可视化。
- **Owner**: 飞马 / 战马 / 野马 / 烈马
- **范围**: `kind=canvas` artifact 渲染 (节点 + 简单连线, 不做 free-form drawing); agent 可输出 canvas content_blob
- **不在范围**: 实时多人光标 ❌; 复杂图形 ❌
- **依赖**: CV-1
- **预估**: ⚡ v0 1 周

### CV-4: artifact iterate 完整流

- **目标**: 把 CV-1~3 串成"agent 持续 iterate workspace artifact"的完整体验。
- **Owner**: 野马 (主) / 战马 / 飞马 / 烈马
- **范围**: agent 收 anchor comment → 起草新版本 → 用户对比 v1/v2 → 决定保留
- **依赖**: CV-1, CV-2, CV-3, CM-4 (agent 在线感)
- **预估**: ⚡ v0 1 周
- **Acceptance**: E2E + 用户感知签字 (野马: "agent 像在工作不是在等指令")

## 3. 不在 canvas-vision 范围

- 多人协同光标 → realtime
- 大文件 / 多媒体 artifact → data-layer
- artifact 权限细化 → auth-permissions

## 4. Blueprint 反查表

| Milestone | §X.Y | 立场一句话 |
|-----------|------|-----------|
| CV-1 | canvas-vision §1.4 + §1.5 | workspace = artifact 集合, agent 可 iterate |
| CV-2 | canvas-vision §1.6 | 锚点是人机界面, 不是 agent 间通信 |
| CV-3 | canvas-vision §1.2 | 画布 = D-lite, 不是 Miro |
| CV-4 | canvas-vision §1.1 + §1.5 整合 | "agent 在工作"的完整体验 |
