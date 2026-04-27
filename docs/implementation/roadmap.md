# Roadmap — 11 模块路径

> 5 秒看完版本: 从 [`../current/`](../current/) 的代码现状到 [`../blueprint/`](../blueprint/) 的目标态。
>
> 阶段: ⚡ v0 (无外部用户, 破坏式升级) → 🛡️ v1 (第一个用户上线, 严格模式)。
> 切换 checklist 见 [`README.md`](README.md)。

## 模块顺序

按依赖排序——前置模块先做:

| # | 模块 | 蓝图 | 实施 | 状态 | Milestones |
|---|------|------|------|------|------------|
| 0 | 基建: schema_migrations 框架 | [data-layer §3.2](../blueprint/data-layer.md) | 先做(这是其它一切的前置) | TODO | INFRA-1 |
| 1 | concept-model | [→](../blueprint/concept-model.md) | [→](concept-model.md) | TODO | CM-1 ~ CM-4 |
| 2 | channel-model | [→](../blueprint/channel-model.md) | TODO | TODO | TBD |
| 3 | canvas-vision | [→](../blueprint/canvas-vision.md) | TODO | TODO | TBD |
| 4 | agent-lifecycle | [→](../blueprint/agent-lifecycle.md) | TODO | TODO | TBD |
| 5 | plugin-protocol (BPP) | [→](../blueprint/plugin-protocol.md) | TODO | TODO | TBD |
| 6 | host-bridge (Borgee Helper) | [→](../blueprint/host-bridge.md) | TODO | TODO | TBD |
| 7 | realtime | [→](../blueprint/realtime.md) | TODO | TODO | TBD |
| 8 | auth-permissions | [→](../blueprint/auth-permissions.md) | TODO | TODO | TBD |
| 9 | admin-model | [→](../blueprint/admin-model.md) | TODO | TODO | TBD |
| 10 | data-layer (剩余) | [→](../blueprint/data-layer.md) | TODO | TODO | TBD |
| 11 | client-shape | [→](../blueprint/client-shape.md) | TODO | TODO | TBD |

> 说明: 上面的 "TODO" 表示对应实施文档/milestone breakdown 还没写。
> 当前已写: 0(本 README) + 1(concept-model.md)。

## 当前进度

```
✅ 蓝图 (blueprint/)         11 篇全部完成
✅ 现状 (current/)           7 篇 audit 完成
🔄 实施 (implementation/)    1/11 模块详细 milestone 已写
⏳ 代码 (PRs)                未开始
```

## 第一波要做的(v0 优先级)

按"基建优先,然后挑标志性产品体验"原则:

1. **INFRA-1**: schema_migrations 框架 (3-5 天) — 一切后续 milestone 的前置
2. **CM-1**: organizations 表 + org_id 列 (2 周, v0 阶段允许 2-3 天搞定:删库重建+新 schema 即可) — 解锁 P4
3. **CM-4**: 跨 org 协作可见 (2 周) — concept-model 的产品标志性落地

> v0 阶段全部都是建军/飞马/野马自己用,**不需要灰度**,可以按"大刀阔斧 → 跑通 → 测一遍"节奏走。

---

## 进度可见性

| 谁 | 看什么 | 频率 |
|----|--------|------|
| 建军 | milestone 燃尽 + 阶段切换 checklist | 周 |
| 飞马 | PR 队列 + acceptance spec | 日 |
| 野马 | milestone 关闭核心 demo | 完成时 |

> v0 阶段不公开 changelog (内部使用); v1 阶段开始把 changelog 公开 — 那时"接下来 X 周做 Y"是产品节奏的体现 (concept-model §1.2 agent 同事感)。
