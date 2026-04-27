# How to Write a Milestone

> 写 implementation 模块文档的规范。每个 implementation/&lt;module&gt;.md 都遵循这个模板。

## Milestone 文档结构

```markdown
# Implementation · <Module Name>

> 蓝图: [`../blueprint/<module>.md`](../blueprint/<module>.md)
> 现状: [`../current/<module>/`](../current/<module>/) 或 inline 简述
> 阶段: ⚡ v0 / 🛡️ v1 (见 README §阶段策略)

## 1. 现状 → 目标 概览

一段话讲清: 当前代码长什么样, 蓝图长什么样, 距离主要在哪几个点。

## 2. Milestones

### M-1 短标题 (例: organizations 表落地)

- **目标**: 一句话(blueprint 的某个具体立场,带 §X.Y 锚点)
- **范围**: bullets, 5 条以内
- **不在范围**: 明确划掉, 防止 scope creep
- **依赖**: 前置 milestone IDs
- **预估**: ⚡ v0 / 🛡️ v1 阶段各几天/周
- **PR 拆分**: 列出可独立合并的 PR 标题
- **Acceptance spec** (三选一,每 PR ≥1 个):
  - **E2E 断言**: 用户可见的行为, e.g. "新注册 user 自动有一个 org, GET /me 返回 org_id 字段"
  - **蓝图行为对照**: blueprint §X.Y 的某条规则, e.g. "符合 §1.1 — agent 默认只有 message.send"
  - **数据契约**: schema/API/protocol 的具体字段, e.g. "users 表有 org_id 列, NOT NULL, 索引存在"

### M-2 ...
```

## Acceptance Spec 三选一详解

每个 PR 必须挂 **至少一种** 验收方式。三种粒度递减,选最轻能证明的那一种。

### 1. E2E 断言

最强,但最贵。

格式:
> 用户/agent 在 X 场景下, 触发 Y, 期望看到 Z。

例:
> 用户 A 在 channel C 中 @ agent B (B 离线), 期望 B 的 owner 在 5 秒内收到 system message "B 离线, channel C 中有人 @ 它"。

适用: 用户感知层的功能、跨多模块协同的功能。

### 2. 蓝图行为对照

中等强度。

格式:
> 实现满足 [`../blueprint/<module>.md`](../blueprint/<module>.md) §X.Y 的规则: "<引用原文一段>"。

例:
> 实现满足 blueprint/concept-model §1.2 的规则: "Agent 默认权限最小化(`message.send`),由 owner 显式 grant 进一步能力"。

适用: 修 bug、refactor、不改用户行为的小改动。

### 3. 数据契约

最轻,纯结构。

格式:
> Schema/API/protocol 的某个具体字段达到 X 状态。

例:
> `users` 表存在 `org_id TEXT NOT NULL` 列, `idx_users_org_id` 索引存在。

适用: 纯 schema 变化、新增字段、加索引。

---

## 阶段差异

| 阶段 | Acceptance 严格度 |
|------|------------------|
| ⚡ v0 | 三选一即可,数据契约最常用 (因为破坏式升级,e2e 改动多) |
| 🛡️ v1 | 推荐 E2E 断言 + 数据契约组合 (双保险) |

---

## PR 描述模板

```markdown
## What
<一段话讲做了什么>

## Blueprint: <module> §X.Y
<引用相关蓝图段落, 让 reviewer 知道这条改动锚定的产品立场>

## Acceptance
<三选一其中一种>

## Stage: ⚡ v0 / 🛡️ v1
<标记当前阶段,提示 reviewer 用对应严格度审>
```

## 例: CM-1 PR 1 的 acceptance spec

```markdown
## Acceptance (数据契约)

- 启动后 SQLite 中存在表 `organizations(id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL)`
- `users` 表存在 `org_id TEXT NOT NULL` 列
- 索引 `idx_users_org_id` 存在
- 启动时所有非 agent user 都有 `users.org_id != ''`
- 启动时所有 agent user 的 `org_id` 等于其 `owner_id` 对应 user 的 `org_id`
```

只看这个 spec, 任何人都能复现验证 (跑迁移 + 查表)。
