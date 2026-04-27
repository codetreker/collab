# Implementation · Admin Model

> 蓝图: [`../blueprint/admin-model.md`](../blueprint/admin-model.md)
> 现状: 当前有 `/admin-api/v1/*` 几个 endpoint, 但没独立 SPA, 没明确隐私契约, 没分层透明
> 阶段: ⚡ v0
> 所属 Phase: Phase 4

## 1. 现状 → 目标 概览

**现状**: admin endpoint 嵌在主 API, 没独立 UI, 隐私边界不清。
**目标**: blueprint 四条立场 — admin 独立 SPA (B), 来源 C 混合 (用户 + key), 硬隔离 (元数据 OK / 内容必须授权), 分层透明 (用户看到自己被影响什么)。

## 2. Milestones

### ADM-1: admin SPA 独立 + 元数据/内容硬隔离

- **目标**: blueprint §1.1 + §1.3 — admin 独立 SPA, 内容必须用户授权才能读。
- **Owner**: 飞马 (review 边界) / 战马 / 野马 (隐私立场) / 烈马
- **范围**: 独立 admin SPA 路由; 中间件强制只允许"元数据"接口 (org / user 列表 / 计数 / 状态), 内容接口 (messages / artifacts) 必须带用户授权 token
- **依赖**: CM-1 (org_id 聚合)
- **预估**: ⚡ v0 1-2 周
- **Acceptance**: 行为不变量 4.1 (无授权访问内容 → 拒绝, 单测) + 数据契约 (元数据接口枚举表)

### ADM-2: 分层透明 (用户可见性) ⭐

- **目标**: blueprint §1.4 — 用户能看到 admin 对自己做了什么 (audit log 用户视角)。
- **Owner**: 野马 (立场主) / 战马 / 飞马 / 烈马
- **范围**: `admin_actions(actor_id, target_user_id, action, when)` 表; 用户设置页可看自己被 admin 影响的记录
- **依赖**: ADM-1
- **预估**: ⚡ v0 1 周
- **Acceptance**: E2E + 用户感知签字 (野马: "作为用户我知道 admin 干了什么")

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
| ADM-1 | admin-model §1.1 + §1.3 | 独立 SPA + 元数据/内容硬隔离 |
| ADM-2 | admin-model §1.4 | 分层透明, 用户看到自己被影响什么 |
| ADM-3 | admin-model §1.2 | C 混合: 用户升级 + admin key bootstrap |
