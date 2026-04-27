# Borgee Implementation — 从 current 到 blueprint

> 这一目录是**实施层** —— 把 [`../current/`](../current/) 的代码现状一步一步推到 [`../blueprint/`](../blueprint/) 的目标态。
> 形式: milestone 列表 + per-milestone PR + acceptance spec。
>
> **路径可见性入口**: [`roadmap.md`](roadmap.md) (5 秒看完)
> **写 milestone 文档的规范**: [`how-to-write-milestone.md`](how-to-write-milestone.md)
> **第一个模块样板**: [`concept-model.md`](concept-model.md)

---

## ⚠️ 阶段策略 (核心约束)

Borgee 当前**无外部用户**。这给了实施巨大的简化空间——但需要明确**何时切换**到严格模式。

### v0 阶段:无外部用户 (现在 → 第一个非内部用户上线)

**核心方针:破坏式升级,删库重建,不做兼容期**

| 维度 | v0 策略 |
|------|---------|
| 数据迁移 | ❌ 不做 backfill 脚本 |
| 协议演进 | ❌ 不做协议版本协商,直接换 |
| 客户端兼容 | ❌ 不做老客户端兼容,直接发新版 |
| Schema 改动 | ✅ 每次改 schema 都允许"删库重建" |
| ULID 改 | ✅ 直接全表 ULID,不留 INT |
| Cursor 形态 | ✅ 直接换 opaque string,不留 INT cursor |
| Events 拆双流 | ✅ 直接改,旧 events 表扔 |
| BPP 协议 | ✅ 直接换协议,plugin 同步发版 |
| 回滚 | ❌ 不写回滚脚本,出问题删库重来 |

**唯一硬规则**: 每个 milestone 之后 main 分支能跑 + 有 acceptance spec 验证。

**为什么允许这么激进**:
- 没用户 = 数据无价值 = 删了无代价
- 不做兼容期 = 开发速度 ×3 = 提早跑通 blueprint
- 把"建一个能用的东西"放在"建一个能演进的东西"前面

### v1 阶段:第一个外部用户上线后

**Trigger**: 第一个非建军/飞马/野马的用户被邀请进入 prod 环境的那一刻。

**切到严格模式** (野马原始版本的增量边界):

| 维度 | v1 策略 |
|------|---------|
| 数据迁移 | ✅ 必须 forward-only + backfill 脚本 |
| 协议演进 | ✅ Cursor: protocol_version header 兼容期 |
| 客户端兼容 | ✅ Public API 永远兼容期;internal (BPP/Helper) 可同步升级 |
| ULID | ⚠️ 永久混用 (旧表 INT, 新表 ULID), 用 `type ID string` 抽象 |
| Events | ✅ 表拆增量 (旧 events 留 view 兼容) |
| BPP | ✅ 内部灰度大改造, 分批 plugin 重连, 禁止全站集体掉线 |
| 回滚 | ✅ 备份 + 不可逆 forward-only, 出问题靠 backup restore |
| 终端用户感知 | ✅ 永远不出现"全站停服公告",零强制升级 |

**底线**: 第一个外部用户上线之后 **永远不删库**, **永远不破坏 public 协议**。

### 切换 checklist (v0 → v1)

第一个外部用户上线**前**必须完成的事:

- [ ] schema_migrations 框架已建立 (forward-only)
- [ ] backup / restore 流程已演练
- [ ] Public API 版本协商机制 (`protocol_version` header) 已就位
- [ ] BPP 灰度发版机制已就位 (plugin 端先发, server 端后)
- [ ] 监控 + 阈值哨已就位 (data-layer §5)

未到 checklist 完成 → 可继续 v0 激进模式;
完成后 → 邀请第一个用户,**同步切换到 v1 模式**,所有人遵守。

---

## 五条实施规则 (v0 / v1 通用)

继承 11 轮讨论时飞马野马提出的 form:

1. **PR ≤ 3 天**, **Milestone ≤ 2 周** —— 控制反馈循环
2. **可验证三选一**: e2e 断言 / 蓝图行为对照 / 数据契约 —— 每 PR 至少一种
3. **5 秒看完路径** —— [`roadmap.md`](roadmap.md) 是单一来源
4. **PR 描述强制**: `Blueprint: <模块> §X.Y` —— 让追溯无歧义
5. **Milestone 末必须可发版** —— 中间态用 feature flag 隐藏

---

## 文档导航

| 文档 | 内容 |
|------|------|
| [`roadmap.md`](roadmap.md) | 全部 milestone 一览 (5 秒看完) |
| [`how-to-write-milestone.md`](how-to-write-milestone.md) | milestone 模板 + acceptance spec 三选一规范 |
| [`concept-model.md`](concept-model.md) | concept-model 模块的实施 (CM-1 ~ CM-4) |
| `<其它模块>.md` | 待建,跟 [`../blueprint/`](../blueprint/) 各模块一一对应 |

## 与 blueprint 的对应

```
blueprint/concept-model.md     ← 目标态: 应该是什么样
   │
   ▼
implementation/concept-model.md ← 实施: 一步一步怎么走到那
   │
   ▼
代码 PRs                         ← 每个 milestone 拆出来的 PR
```

每个 PR 描述里都强制带 `Blueprint: concept-model §X.Y` 锚点,让代码可以反查到产品立场。
