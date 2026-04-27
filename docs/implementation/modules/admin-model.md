# Implementation · Admin Model

> 蓝图: [`../../blueprint/admin-model.md`](../../blueprint/admin-model.md)
> 现状: 当前有 `/admin-api/v1/*` 几个 endpoint, 但没独立 SPA, 没明确隐私契约, 没分层透明
> 阶段: ⚡ v0
> 所属 Phase: Phase 4

## 1. 现状 → 目标 概览

**现状**: admin endpoint 嵌在主 API, 没独立 UI, 隐私边界不清。
**目标**: blueprint 四条立场 — admin 独立 SPA (B), 来源 C 混合 (用户 + key), 硬隔离 (元数据 OK / 内容必须授权), 分层透明 (用户看到自己被影响什么)。

## 2. Milestones

### ADM-1: admin SPA 独立 + 元数据/内容硬隔离 + 用户隐私承诺可见

- **目标**: blueprint §1.1 + §1.3 + 核心 §13 — admin 独立 SPA, 内容必须用户授权; **用户侧能读到 admin 能看 X / 看不到 Y 的承诺**。
- **Owner**: 飞马 (review 边界) / 战马 / 野马 (隐私立场) / 烈马
- **范围**:
  - 独立 admin SPA 路由
  - 中间件强制只允许"元数据"接口 (org / user 列表 / 计数 / 状态)
  - 内容接口 (messages / artifacts) 必须带用户授权 token
  - **用户设置页加"隐私承诺"区**: 显式列 admin 能看到 (org / user list / count / status) vs 看不到 (message body / artifact 内容) — 野马 P2
- **依赖**: CM-1 (org_id 聚合)
- **预估**: ⚡ v0 1-2 周
- **Acceptance**:
  - 行为不变量 4.1 (无授权访问内容 → 拒绝, 单测)
  - 数据契约 (元数据 vs 内容接口枚举表)
  - 用户感知截屏 4.2 (野马: 用户设置页"隐私承诺"区, 截 1 张, 验立场 §13)

### ADM-2: 分层透明 (用户可见性)

> 野马 R2: **取消 ⭐ 标志性** — 分层透明只对 admin 可感, 普通用户零感知, 留 ⭐ 浪费 PM 签字时间。降级为内部 milestone, 不进野马签字流。

- **目标**: blueprint §1.4 — 用户能看到 admin 对自己做了什么 (audit log 用户视角)。
- **Owner**: 野马 (立场主, 但不签字闸 4) / 战马 / 飞马 / 烈马
- **范围**: `admin_actions(actor_id, target_user_id, action, when)` 表; 用户设置页可看自己被 admin 影响的记录
- **依赖**: ADM-1
- **预估**: ⚡ v0 1 周
- **Acceptance**:
  - 行为不变量 4.1: 任何 admin action → 自动写一行 admin_actions (单测覆盖每种 action 类型)
  - E2E: admin 改用户 role → 用户设置页 audit 列表多一行

### ADM-3: admin 来源 C 混合 (用户 + key)

- **目标**: blueprint §1.2 — admin 由用户 (升级权限) + 长期 admin key (initial bootstrap) 组成。
- **Owner**: 飞马 / 战马 / 野马 / 烈马
- **范围**: `is_admin` flag 在 user 表; admin key 单独存 (env / config); key 不能读内容只能管理
- **预估**: ⚡ v0 4-5 天

## 3. 不在 admin-model 范围

- 多 admin 角色 (super-admin / org-admin) ❌ v1+
- 跨 org admin ❌ (蓝图明确禁止)

## 4. Blueprint 反查表

| Milestone | §X.Y | 立场一句话 |
|-----------|------|-----------|
| ADM-1 | admin-model §1.1 + §1.3 + 核心 §13 | 独立 SPA + 元数据/内容硬隔离 + 用户侧隐私承诺可见 |
| ADM-2 | admin-model §1.4 | 分层透明, 用户看到自己被影响什么 |
| ADM-3 | admin-model §1.2 | C 混合: 用户升级 + admin key bootstrap |
