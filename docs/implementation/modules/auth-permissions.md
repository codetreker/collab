# Implementation · Auth & Permissions

> 蓝图: [`../../blueprint/auth-permissions.md`](../../blueprint/auth-permissions.md)
> 现状: `user_permissions(user_id, permission, resource)` 表已有, 但缺 ABAC scope 层级, 没有 UI bundle, 跨 org 限制不严格
> 阶段: ⚡ v0
> 所属 Phase: AP-0 在 Phase 1 (跟 CM-1 并行); AP-1~4 在 Phase 4

## 1. 现状 → 目标 概览

**现状**: 平面权限表, 全靠 `(user, perm, resource)` 三元组; 没分 scope 层级; 没 UI bundle; 跨 org 限制靠 owner_id 判断 (脆弱)。
**目标**: blueprint 四条立场 — C 混合 (ABAC 存储 + UI bundle), 三层 scope, B+A' 授权 UX (无角色名 bundle), 跨 org owner-only。
**主要差距**: scope 层级, UI bundle, 跨 org 严判, capability 清单。

## 2. Milestones

### AP-0: 默认权限注册回填 (从 CM-2 挪过来, 跟 CM-1 并行做)

- **目标**: blueprint §3 — 人类全权 (`*`), agent 默认最小 (`message.send`)。
- **Owner**: 飞马 / 战马 / 野马 / 烈马
- **范围**:
  - 注册新 human user 时, 写 `(user_id, '*', '*')` 到 `user_permissions`
  - 创建 agent 时, 写 `(agent_id, 'message.send', '*')`
  - 删除注册时不写权限的旧逻辑
- **依赖**: 无 (跟 CM-1 同 PR 或紧跟)
- **预估**: ⚡ v0 1-2 天
- **Acceptance**: 数据契约 (新注册 human → 权限表 `*` 一行; 新 agent → `message.send` 一行)

### AP-1: ABAC scope 层级 (org / channel / artifact)

- **目标**: blueprint §1.2 — v1 三层 scope。
- **Owner**: 飞马 (review 模型) / 战马 / 野马 / 烈马
- **范围**: 权限表加 `scope_type, scope_id` 字段; 检查函数按层级 fallback
- **依赖**: CM-1 (org_id), CHN-1 (workspace), CV-1 (artifact)
- **预估**: ⚡ v0 1 周
- **Acceptance**: 行为不变量 (org 级权限覆盖 channel 级, 单测)

### AP-2: UI bundle (无角色名)

- **目标**: blueprint §1.3 — A' 快速 bundle, 名字按 capability 不按角色 (Messaging / Workspace, 不是 PM / Dev)。
- **Owner**: 野马 (立场关键) / 战马 / 飞马 / 烈马
- **范围**: bundle 配置文件 (Messaging / Workspace / Channel / Org); UI 一键 grant; 底层依然落到 ABAC
- **依赖**: AP-1
- **预估**: ⚡ v0 1 周
- **Acceptance**: E2E + 用户感知签字 (野马: "我不会被引导成预设角色思维")

### AP-3: 跨 org owner-only 强制

- **目标**: blueprint §1.4 — 跨 org 协作时, agent 扩权必须 owner 同意。
- **Owner**: 飞马 / 战马 / 野马 / 烈马
- **范围**: 跨 org 权限请求走审批流, agent 不能自动扩权
- **依赖**: CM-4 (邀请审批已有)
- **预估**: ⚡ v0 4-5 天

### AP-4: capability 清单落地

- **目标**: blueprint §3 — v1 capability 清单 (Messaging / Workspace / Channel / Org), 全部 enum 化, 不允许自由字符串
- **Owner**: 飞马 / 战马 / 野马 / 烈马
- **范围**: capability enum 文件; 所有写入权限的代码用 enum, lint 强制
- **预估**: ⚡ v0 3 天

## 3. 不在 auth-permissions 范围

- 单点登录 (SSO) ❌
- 审计日志 → admin-model
- 跨 org "escape hatch" ❌ v1+

## 4. Blueprint 反查表

| Milestone | §X.Y | 立场一句话 |
|-----------|------|-----------|
| AP-0 | auth-permissions §3 (+ concept §3) | 人全权, agent 最小 |
| AP-1 | auth-permissions §1.2 | 三层 scope |
| AP-2 | auth-permissions §1.3 | bundle 按 capability 不按角色 |
| AP-3 | auth-permissions §1.4 | 跨 org owner-only 扩权 |
| AP-4 | auth-permissions §3 | capability 清单 enum 化 |
