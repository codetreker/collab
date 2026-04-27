# Execution Plan — 从现状到蓝图的总执行流程

> **这是 implementation 层的源头文件**——回答"先做什么、后做什么、每步怎么验证、最后怎么确认没偏"。
>
> 5 分钟读完目标: 任何人都能说出 (1) 我们现在在哪个 Phase, (2) 下一个 gate 是什么, (3) 通过 gate 需要拿出什么证据。
>
> 具体每个 milestone 的拆分、PR、acceptance 细节 → 见各模块文档 (`concept-model.md`, `channel-model.md`, ...) 。本文件只定**边界**和**gate**, 不下钻细节。

---

## 设计原则

1. **价值闭环驱动**: 每个 Phase 退出后, 都能拿出一段"团队可感知"的东西 (能 demo / 能读到一个产品立场), 不允许出现"做完了 7 张表但什么都看不见"的中间态。
2. **约束在边界, 自由在内部**: Phase 之间是硬 gate (没跑过 gate 不进下一 Phase); Phase 内部 milestone 顺序 / PR 拆分允许调整。
3. **gate = 证据**: 每个 gate 必须挂可重复跑的证据 (E2E 命令 / SQL 查询 / demo 关键截屏 / 反查表), 而不是"觉得做完了"。
4. **不偏离的机制**: 4 道闸门嵌在流程里 (见 §"防偏离闸门"), 不是事后审计。
5. **每步分工明确**: 任何 milestone / PR / gate 都有命名 owner — 飞马 (review) / 战马 (dev) / 野马 (PM) / 烈马 (QA)。详见各 Phase 表格的 Owner 列。

---

## Phase 概览

```
Phase 0  基建闭环           ← 任何后续 milestone 的工程基座
   │
   ▼
Phase 1  身份闭环           ← blueprint §1.1 + §2 在数据层落地
   │
   ▼
Phase 2  协作闭环 ⭐         ← blueprint §1.2 "agent 同事感"首演
   │
   ▼
Phase 3  第二维度产品        ← workspace + canvas 立得起来
   │
   ▼
Phase 4+  剩余模块          ← realtime / auth / admin / data-layer / client
```

每个 Phase 通过 gate 才允许进下一 Phase。Phase 内部 milestone 顺序由模块文档决定。

---

## Phase 0 — 基建闭环

**目标**: 后续任何 milestone 都能落地的最小工程基座。

**包含 milestone**:
- INFRA-1: schema_migrations 框架 (forward-only)
- 测试约定: 至少有 1 条 E2E + 1 条数据契约示例跑通
- Commit / PR 规范: PR 描述模板 + `Blueprint:` 锚点强制

**Phase 0 退出 gate** (必须全过):

| Gate | 证据 | Owner |
|------|------|-------|
| G0.1 schema_migrations 能跑 | 跑一次"假"迁移 (创建一张废弃表), 检查 `schema_migrations` 表有记录 | 战马 (实现) / 烈马 (验证) |
| G0.2 数据契约 acceptance 形态可行 | 用一条样例 (例: `users.org_id 列存在`) 跑通验收脚本 | 烈马 (设计验收脚本) |
| G0.3 PR 模板生效 | 至少 1 个 PR 用模板合进 main, `Blueprint:` 锚点齐全 | 飞马 (review 把关) |

**预估**: 1 周 (v0)

---

## Phase 1 — 身份闭环

**目标**: blueprint §1.1 + §2 — organizations 是数据层一等公民, 资源归属直查 org_id。

**对应蓝图立场**:
- §1.1 — 1 person = 1 org, UI 永远不暴露
- §2 — 数据层 org first-class, 查询不绕 owner_id JOIN

**包含 milestone**:
- CM-1: organizations 表 + users.org_id 列 + 索引 + 注册流程自动建 org
- CM-3: 资源归属 org_id 在写入时填好 + 读路径切 `WHERE org_id = ?`

> 注: CM-2 (默认权限注册回填) **不在本 Phase**, 已挪到 auth-permissions 模块。

**Phase 1 退出 gate** (必须全过):

| Gate | 证据 | Owner |
|------|------|-------|
| G1.1 数据层 org_id 落地 | SQL: `organizations` 表存在, `users.org_id` NOT NULL, 索引存在 | 战马 (迁移) / 烈马 (SQL 验证) |
| G1.2 注册自动建 org (E2E) | 新注册 human → `organizations` 多一行, user.org_id 指向它 | 战马 (实现) / 烈马 (E2E) |
| G1.3 agent 继承 owner org | admin API 创建 agent → agent.org_id = owner.org_id | 战马 / 烈马 |
| G1.4 读路径直查 (蓝图行为对照) | `grep` 代码: 主要业务表的"我的列表"查询走 `WHERE org_id = ?` 而不是 JOIN owner_id | 飞马 (代码 review) |
| G1.5 UI 不泄漏 org_id | 任何 user-facing API 响应里没有 `org_id` 字段 (合约测试) | 烈马 (合约测试) / 野马 (立场把关) |

**预估**: 2-3 周 (v0)

---

## Phase 2 — 协作闭环 ⭐

> **这是 Borgee 的产品标志性 Phase**——前面 Phase 用户都无感, Phase 2 一次把"agent 同事感"演示出来。

**目标**: blueprint §1.2 + §5.1 + §5.2 — agent 是同事不是工具, 跨 org 邀请 + 离线 fallback 跑通。

**对应蓝图立场**:
- §1.2 — agent 是同事
- §5.1 — agent 离线 fallback 给 owner
- §5.2 — 跨 org agent 邀请审批

**包含 milestone**:
- CM-4: agent 同事感首秀 (邀请审批 + 离线 fallback + 节流 + minimal in-process presence)

**Phase 2 退出 gate** (必须全过):

| Gate | 证据 | Owner |
|------|------|-------|
| G2.1 邀请审批 E2E | A 邀请 B 的 agent → B 在 inbox 看到 quick action → 接受后 agent 自动加 channel | 战马 / 烈马 |
| G2.2 离线 fallback E2E | A @ B-bot (B-bot 离线) → B 5 秒内收到 system message | 战马 / 烈马 |
| G2.3 节流不变量 (B.1) | 5 分钟内多次 @ → 系统只发 1 条 system message (单测可断言) | 烈马 (单测) |
| G2.4 用户感知签字 (B.2) | 野马跑一遍 demo, 主观签字"看起来像同事不像 bot", 留 3-5 张关键截屏 | **野马** (闸 4) |
| G2.5 presence 接口契约 | `IsOnline(userID) bool` 接口 + 注册/注销时机已定型, agent-lifecycle 模块进来时不需要重做 | 飞马 (契约设计) / 战马 (实现) |

**预估**: 2-3 周 (v0)

> **Phase 2 退出 = Borgee v0 第一次"产品可见"。** 这是一个分水岭: 此前是基建, 此后任何 milestone 都至少能挂到一个用户感知点。

---

## Phase 3 — 第二维度产品

**目标**: workspace + canvas 立得起来, blueprint §canvas-vision 第一刀。

**包含 milestone**: channel-model M-1 + canvas-vision M-1 (各模块文档详写)

**Phase 3 退出 gate**: 第二段 demo — channel 内开 workspace, agent 产出 artifact, 人类可 anchor comment。野马签字 + 关键截屏。

**预估**: 待 Phase 2 退出后, 各模块文档下钻时再定。

---

## Phase 4+ — 剩余模块

按需排序, 优先级原则:
- 任何"用户已经看到的产品立场"被破坏的风险 → 优先做
- 任何"灰度切 v1 的前置" (backup / 监控 / 协议版本) → 在 v0 收尾时做

具体顺序在 Phase 3 退出后再定, 不在本文件锁死。

---

## v0 → v1 切换 checklist

> v0 阶段允许破坏式升级 (删库重建, 直接换协议)。v1 阶段 (第一个外部用户上线后) 切严格模式。
> 详见 [`README.md`](README.md) §阶段策略。

**v0 → v1 切换前必须完成**:

- [ ] schema_migrations 框架已建立 (Phase 0)
- [ ] backup / restore 流程已演练
- [ ] Public API 版本协商机制 (`protocol_version` header) 已就位
- [ ] BPP 灰度发版机制已就位
- [ ] 监控 + 阈值哨已就位
- [ ] **v0 代码债 audit 表已结清** (见下)

### v0 代码债 audit (每 Phase 退出时更新此表)

> 每个 v0 阶段做的"破坏式选择"都登记在这, v1 切换前逐条结清。

| 改动 | v0 做法 | v1 切回要补的事 | 关联 Phase / Milestone |
|------|---------|----------------|---------------------|
| organizations 表 | 删库重建 | forward-only 迁移脚本 + backfill | Phase 1 / CM-1 |
| events 表 | 直接换 schema | 旧 events 留 view 兼容 | (待 events 模块时填) |
| BPP 协议 | 直接换 | plugin 灰度发版 | (待 BPP 模块时填) |
| ULID | 全表 ULID | 永久混用 + `type ID string` 抽象 | (待 ID 模块时填) |
| ... | ... | ... | ... |

> **每完成一个 v0 milestone, 必须在此表更新一行**, 否则 Phase gate 不算通过。

---

## 防偏离闸门

> 4 道闸门**嵌在流程里**, 不是事后审计。每道闸门都有触发时机和证据。

### 闸 1 — 模板自检

**触发时机**: how-to-write-milestone.md 改动后, 或新模块文档第一次起草时。
**Owner**: 飞马 (执行)
**做法**: 用模板写一个 5 行 skeleton (只填章节标题), 检查章节套不套得上。
**证据**: skeleton 文件本身 + 一行说明"哪一节套不上 / 全套上"。
**作用**: 防止模板与现实脱节。

### 闸 2 — 蓝图锚点 grep

**触发时机**: 每个模块文档的 milestone 章节定稿时。
**Owner**: 飞马 (执行)
**做法**: `grep -n "§" docs/implementation/<module>.md`, 检查每个 milestone 都有 blueprint §X.Y 锚点。
**证据**: grep 输出贴在 PR 描述里。
**作用**: 防止 milestone 立场漂移成"工程顺手活"。

### 闸 3 — Blueprint 反查表

**触发时机**: 每个模块文档末尾必须有此表。
**Owner**: 野马 (写"立场一句话") + 飞马 (review 表完整性)
**做法**: 一张表, 列 `Milestone | Blueprint §X.Y | 立场一句话`。一句话写不出 = 立场漂移, 打回。
**证据**: 表本身。
**作用**: 比 grep 多一层"立场可读性"——不只查锚点存在, 逼你说人话。

### 闸 4 — 标志性 milestone 野马签字 + demo 关键截屏

**触发时机**: roadmap 标记为"标志性" 的 milestone 关闭前 (当前: CM-4 / canvas-vision M-1; 后续每模块各 1 个)。
**Owner**: **野马** (主) + 战马 (准备 demo 环境) + 烈马 (跑 acceptance)
**做法**: 野马本人跑一遍 demo, 签字, 留 3-5 张关键步骤截屏存入 `docs/evidence/<milestone>/`。AI 团队不录视频。
**证据**: 截屏文件 + 签字记录 (commit / issue comment)。
**作用**: 防止做出来不是那回事; 后续若有人改坏立场, 拿截屏对照即知。

---

## 文档间关系

```
execution-plan.md  (本文件: Phase 边界 + gate, 是源头)
   │
   ├── README.md            (阶段策略 v0/v1, 是约束)
   ├── how-to-write-milestone.md  (写法规范, 是工具)
   ├── roadmap.md           (本文件的缩略图, 是索引)
   │
   ▼
<module>.md  (concept-model.md / channel-model.md / ...)
   = Phase 内部 milestone 下钻 (具体 PR / acceptance / 工期)
   = 必须挂 Blueprint 反查表 (闸 3)
```

任何 milestone 改动 (新增 / 删除 / 排序) 必须先反映到本文件的 Phase 结构, 再下钻到模块文档。模块文档不允许出现没挂 Phase 的孤儿 milestone。
