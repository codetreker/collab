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

**包含 milestone** (拆 1a/1b 锁紧):
- **INFRA-1a** schema_migrations 框架 (forward-only, sqlite)
- **INFRA-1b** 测试 harness — fake clock + sqlite 内存 + fixture seeder + seed 脚本契约 + 回归测试入册机制
- **CI lint**: PR 改 `internal/<module>/` 必须同步改 `docs/current/<module>/`, 否则 fail
- **PR 描述模板**生效, `Blueprint:` / `Touches:` / `Current 同步:` 三区块强制

**Phase 0 退出 gate** (必须全过):

| Gate | 证据 | Owner |
|------|------|-------|
| G0.1 schema_migrations 能跑 | 跑一次"假"迁移 (创建一张废弃表), 检查 `schema_migrations` 表有记录 | 战马 (实现) / 烈马 (验证) |
| G0.2 acceptance 验证脚本 | 跑通 1 条 fail case + 1 条 pass case 两个样例, 证明验收脚本能区分 | 烈马 (设计验收脚本) |
| G0.3 PR 模板生效 | 至少 1 个 PR 用模板合进 main, 三区块齐全 | 飞马 (review 把关) |
| G0.4 (软 gate) 测试 harness 可用 | fake clock + 内存 sqlite + fixture seeder 至少 1 个用例跑通; 软 gate = 不卡 Phase 0 退出, 但 Phase 1 第一个 PR 必须满足 | 战马 / 烈马 |
| G0.5 (软 gate) current sync CI lint 工作 | 提交一个故意不同步的 PR, CI fail; 修好后 pass; 软 gate 同上 | 烈马 |
| **G0.audit** | v0 代码债 audit 表本 Phase 行已登记 | 飞马 |

**预估**: 2 周 (v0; 战马 R2 实测; INFRA-1b 三件 ≈ 1 周 + CI lint + PR 模板 lint ≈ 3 天)

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
| G1.4 读路径直查 (蓝图行为对照) | SQL EXPLAIN 验证主要业务表"我的列表"查询走 `idx_*_org_id`; 黑名单 grep `JOIN.*owner_id` 命中 0 | 飞马 (代码 review) / 烈马 (EXPLAIN 跑) |
| G1.5 UI 不泄漏 org_id | 任何 user-facing API 响应里没有 `org_id` 字段 (合约测试) | 烈马 (合约测试) / 野马 (立场把关) |
| **G1.audit** | v0 代码债 audit 表本 Phase 新增行已登记 (CM-1 删库 / users.org_id 加列等) | 飞马 |

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
| G2.4 用户感知签字 (B.2) | 野马跑 demo 主观签字"看起来像同事不像 bot", 留 3-5 张关键截屏; **截屏清单必含**: 邀请通知 / 接受后成员列表 / 离线通知 / 节流第 6 次无通知 / **左栏团队感知** (打开 app 第一眼看到 "我 + N agent" 列表; 列表中 agent 项必显 subject 文案"在做什么", 验证立场 §1.4 + §11 联动 — 野马 R2 加条); demo 中 **口播一次"agent↔agent 协作 Phase 4 支持"** (§1.3 体感断档兜底) | **野马** (闸 4) |
| G2.5 presence 接口契约 | 接口 `IsOnline + Sessions` 锁死路径 `internal/presence/contract.go` (烈马 snapshot test); **触发点 = BPP frame 建连**, Phase 2 用 stub 桥接 (无 BPP), BPP-1 上线后切真 frame, 不算返工 (飞马 R2 锁定) | 飞马 (契约设计) / 战马 (实现) |
| **G2.audit** | v0 代码债 audit 表本 Phase 新增行已登记 (agent_invitations / presence map / 节流策略) | 飞马 |

**预估**: 2-3 周 (v0)

> **Phase 2 退出 = Borgee v0 第一次"产品可见"。** 这是一个分水岭: 此前是基建, 此后任何 milestone 都至少能挂到一个用户感知点。

---

## Phase 3 — 第二维度产品

**目标**: workspace + canvas 立得起来, blueprint §canvas-vision 第一刀。

**包含 milestone (内部顺序锁死, 不允许并行打乱)**:
1. **CHN-1** workspace 与 channel 关联 (workspaces 表)
2. **CV-1** ⭐ artifact 表 + 版本机制
3. **RT-1** artifact 推送 (从 Phase 4 提前到此, CV-4 demo 必需 — 否则要轮询)
4. **CV-2** 锚点对话 (anchor comments)
5. **CV-3** D-lite 画布渲染
6. **CHN-2** DM 概念独立 (跟 CV-2/3 可并)
7. **CHN-3** 个人分组 reorder + pin (跟 CV-2/3 可并)
8. **CV-4** artifact iterate 完整流 (依赖 CV-1+RT-1+CV-2+CM-4)
9. **CHN-4** channel 协作场骨架 demo (收尾, 依赖 CHN-1~3 + CV-1)

**Phase 3 退出 gate** (必须全过):

| Gate | 证据 | Owner |
|------|------|-------|
| G3.1 artifact 创建 + 推送 E2E (RT-1 推送非轮询) | agent 创建 note → 用户秒看到, 不需刷新 | 战马 / 烈马 |
| G3.2 锚点对话 E2E | 用户加锚点 → agent 收到 → 出新版本 | 战马 / 烈马 |
| G3.3 用户感知签字 (CV-1 ⭐) | 野马跑 demo, 截 3 张: artifact 列表 / 添加新版本 / v1↔v2 切换 | **野马** |
| G3.4 协作场骨架 (CHN-4) E2E + **同 channel chat / artifact 双 tab 截屏** (§6 双支柱, 野马 R2) | 新建 channel → 默认 workspace → 邀 agent → 放 artifact; 双 tab 各 1 张截屏 | 战马 / 烈马 + 野马 (双 tab 截屏) |
| **G3.audit** | v0 代码债 audit 行已登记 (artifacts / artifact_versions / anchor_comments / RT-1 frame) | 飞马 |

**预估**: 4-6 周 (v0)

---

## Phase 4+ — 剩余模块

按需排序, 优先级原则:
- 任何"用户已经看到的产品立场"被破坏的风险 → 优先做
- 任何"灰度切 v1 的前置" (backup / 监控 / 协议版本) → 在 v0 收尾时做

**已知依赖锁紧 (PROGRESS 同步绘制)**:
- **DL-4 必须先于 HB-1 / CS-3** (server 端 plugin manifest API + Web Push gateway 是它们的前置, 飞马 R2 锁定排序)
- **BPP-1 → AL-2 → BPP-3** 串行 (AL-2 拆 a/b: a=config 表, b=BPP frame, b 跟 BPP-3 同合)
- **CM-5** (agent↔agent 协作, 新增) 依赖 CM-4
- **HB-1** 依赖 server-side-services (plugin manifest API)
- **CS-3** 依赖 server-side-services (push gateway)

**Phase 4+ 退出 gate** (各模块自身完成判定 + 全局 G4.audit)

| Gate | 证据 | Owner |
|------|------|-------|
| **G4.audit (滚动)** | 每个模块完成时, v0 代码债 audit 行更新; 全部模块完成时, 总表无 TODO | 飞马 |

---

## v0 → v1 切换 checklist

> v0 阶段允许破坏式升级 (删库重建, 直接换协议)。v1 阶段 (第一个外部用户上线后) 切严格模式。
> 详见 [`../README.md`](../README.md) §阶段策略。

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

### 闸 1 — 模板自检 (烈马反验, 飞马仲裁)

**触发时机**: how-to-write-milestone.md 改动后, 或新模块文档第一次起草时。
**Owner**: **烈马** (执行反验) + 飞马 (仲裁分歧)
**做法**: 烈马用最新模板独立写一份**别模块**的 5 行 skeleton (例: 改 channel-model 模板时, 烈马用模板写一份 admin-model skeleton), 检查章节套不套得上。
**证据**: skeleton 文件 + 一行说明"哪一节套不上 / 全套上"; 烈马如发现套不上, 飞马仲裁修模板还是修立场。
**作用**: 防止飞马自验自验, 模板偏差永远发现不了。

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

**触发时机**: roadmap 标记为"标志性" 的 milestone 关闭前 (当前: CM-4 / CV-1 / RT-3 / HB-4 / ADM-2; 后续视产品立场加)。
**Owner**: **野马** (主) + 战马 (准备 demo 环境) + 烈马 (跑 acceptance)
**做法**: 野马本人跑一遍 demo, 签字, 留 3-5 张关键步骤截屏存入 `docs/evidence/<milestone>/`; 同目录放 `blueprint-sha.txt` 记录当时蓝图 commit, 立场漂移时可反查。AI 团队不录视频。
**证据**: 截屏文件 + 签字记录 (commit / issue comment) + blueprint-sha.txt。
**作用**: 防止做出来不是那回事; 后续若有人改坏立场, 拿截屏对照即知。

### 闸 5 — 测试覆盖 + regression 防护 (烈马底线)

**触发时机**: 每个 PR 合并前 + 每个 Phase 退出 gate 前。
**Owner**: 烈马 (主) + 战马 (写测试) + 飞马 (review 覆盖)
**做法**:
- **每 PR 合并前** 必须挂:
  - 单元测试 (覆盖率口径: **含分支文件 cyclomatic > 1**, ≥ 80%; **schema/migration PR 豁免** — 飞马 R2 收紧。烈马维护 PR 类型 → 标尺映射)
  - 集成测试 (跨模块改动: server↔plugin / server↔client 至少 1 条 happy path E2E)
  - seed 脚本 `testdata/<milestone>/seed.sql` (v0 删库后一键复现 fixture)
- **每 Phase gate 前** 必须跑:
  - 全回归套件: 已 ✅ 的所有 milestone acceptance 一次跑, 任意 fail = gate 不通过
  - **回归套件强制顺序: 先 seed → 再 migration → 再 assert** (不允许 reuse 已建库, 烈马 R2; 否则 Phase 3 改 schema 把 Phase 1 打穿但发现不了)
  - 已合并 milestone 的 4.1 acceptance 自动入册回归套件 (烈马维护清单)
- **UI 层 E2E** 缺自动化时, 以 4.2 关键截屏代替 (烈马 R2 nice-to-have)
**证据**: CI 报告 + coverage 数字 + 回归绿屏截图。
**作用**: v0 阶段开发节奏快, 不写测试 = 后面 milestone 改 schema 把前面 milestone 打穿, 发现不了。这道闸是开发的"安全网"。

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
