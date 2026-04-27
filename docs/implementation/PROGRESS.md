# PROGRESS — 实施进度打勾

> **单一进度真相**。任何 milestone / PR / gate 状态变化都更新此文件。
>
> 形式: ✅ DONE / 🔄 IN PROGRESS / ⏳ PENDING (依赖未就绪) / ⏸️ BLOCKED (有阻塞需处理) / TODO (未开工)。
>
> 更新规则:
> - PR 合并 → 在对应行打 ✅, 提交注明 PR 号
> - Phase gate 通过 → 在 gate 行打 ✅, 注明证据 (PR / 截屏路径 / SQL 输出)
> - 标志性 milestone (⭐) 关闭 → 野马签字一行 (姓名缩写 + 日期) + 关键截屏 3-5 张存 `docs/evidence/<milestone>/`
> - 每周一由飞马 review 一遍, 落后项标 ⚠️ 并加备注
>
> **签字回滚条款 (野马 P3 弱采纳)**: 标志性 milestone 关闭后 1 周内, 若野马在内部 dogfood 中发现立场被实施稀释 (例: "其实没看出 agent 是同事感"), 可发起作废重做; 作废后 milestone 退回 IN PROGRESS, 不影响后续 milestone 已合并代码 (因为 acceptance 是渐进的, 单测/E2E 仍跑绿)。这是产品立场底线, 工程节奏不被反复打断。

---

## Phase 概览

| Phase | 状态 | 退出条件 | 备注 |
|-------|------|---------|------|
| Phase 0 基建闭环 | TODO | G0.1+G0.2+G0.3+G0.4+G0.5+G0.audit 全过 | 起步; 含 INFRA-1a/1b 拆分 |
| Phase 1 身份闭环 | TODO | G1.1~G1.5 + G1.audit 全过 | 等 Phase 0 |
| Phase 2 协作闭环 ⭐ | TODO | G2.1~G2.5 + G2.audit + 野马签字 | 等 Phase 1 |
| Phase 3 第二维度产品 | TODO | G3.1~G3.4 + G3.audit + 野马签字 (CV-1) | 等 Phase 2; 内部顺序锁死 |
| Phase 4+ 剩余模块 | TODO | 各模块自身完成判定 + G4.audit | 等 Phase 3 |

---

## Phase 0 — 基建闭环

**Milestones**

- [ ] **INFRA-1a** schema_migrations 框架 — 战马 / 飞马 / 烈马
  - [ ] PR-INFRA-1a.1 框架代码 + 跑一次假迁移
- [ ] **INFRA-1b** 测试 harness — 战马 (主) / 飞马 / 烈马
  - [ ] PR-INFRA-1b.1 fake clock + 内存 sqlite + fixture seeder
  - [ ] PR-INFRA-1b.2 seed 脚本契约 + 回归测试入册机制 + CI 集成
- [ ] **CI lint** PR 改 internal 必同步 docs/current — 战马 (实现) / 烈马 (验证)
- [ ] **PR 模板生效** Blueprint / Touches / Current 同步 三区块强制 — 飞马

**Gates**

- [ ] G0.1 schema_migrations 能跑 — 证据: ___
- [ ] G0.2 acceptance 验证脚本 (1 fail + 1 pass) — 证据: ___
- [ ] G0.3 PR 模板生效 (≥ 1 PR 三区块齐) — 证据: ___
- [ ] G0.4 测试 harness 可用 (1 个 fake clock 用例跑通) — 证据: ___
- [ ] G0.5 current sync CI lint 工作 — 证据: ___
- [ ] **G0.audit** v0 代码债 audit 表本 Phase 行已登记 — 飞马

---

## Phase 1 — 身份闭环

**Milestones**

- [ ] **CM-1** organizations 表落地 — 战马 / 飞马 / 野马 / 烈马
  - [ ] PR CM-1.1 schema (organizations 表 + users.org_id 列 + 索引)
  - [ ] PR CM-1.2 注册自动建 org
  - [ ] PR CM-1.3 admin stats GROUP BY org_id
  - [ ] PR CM-1.4 admin 调试页 (visibility checkpoint, 非 acceptance)
- [ ] **AP-0** 默认权限注册回填 (与 CM-1 并行) — 战马 / 飞马 / 野马 / 烈马
  - [ ] PR AP-0.1 注册时写默认权限 (human=`*`, agent=`message.send`)
- [ ] **CM-3** 资源归属 org_id 直查 (CM-4 之后) — 战马 / 飞马 / 野马 / 烈马
  - [ ] PR CM-3.1 写路径 (4 张表填 org_id)
  - [ ] PR CM-3.2 读路径 (查询切 WHERE org_id)

**Gates**

- [ ] G1.1 数据层 org_id 落地 — 战马/烈马 / 证据: SQL ___
- [ ] G1.2 注册自动建 org E2E — 战马/烈马 / 证据: E2E test ___
- [ ] G1.3 agent 继承 owner org — 战马/烈马 / 证据: ___
- [ ] G1.4 读路径直查 (SQL EXPLAIN + grep 黑名单) — 飞马/烈马 / 证据: ___
- [ ] G1.5 UI 不泄漏 org_id (合约测试) — 烈马/野马 / 证据: ___
- [ ] **G1.audit** v0 代码债 audit 行已登记 (organizations 删库 / users.org_id 加列) — 飞马

---

## Phase 2 — 协作闭环 ⭐

**Milestones**

- [ ] **CM-4** agent 同事感首秀 — 野马 (主) / 战马 / 飞马 / 烈马
  - [ ] PR CM-4.0 schema + 状态机单测
  - [ ] PR CM-4.1 邀请创建/同意/拒绝 API
  - [ ] PR CM-4.2 邀请通知 UI + join channel
  - [ ] PR CM-4.3a presence map (IsOnline + Sessions 接口契约) + 注册/注销
  - [ ] PR CM-4.3b 离线检测 + system message
  - [ ] PR CM-4.4 5 分钟节流 + E2E 串通

**Gates**

- [ ] G2.1 邀请审批 E2E — 战马/烈马 / 证据: ___
- [ ] G2.2 离线 fallback E2E — 战马/烈马 / 证据: ___
- [ ] G2.3 节流不变量 (fake clock 单测) — 烈马 / 证据: ___
- [ ] G2.4 用户感知签字 — **野马** / 关键截屏路径: `docs/evidence/cm-4/` (5 张: 邀请通知 / 接受后成员 / 离线通知 / 节流第 6 次无通知 / **左栏团队感知**) + blueprint-sha.txt
- [ ] G2.5 presence 接口契约 (IsOnline + Sessions 锁死) — 飞马/战马 / 证据: 接口签名文件 ___
- [ ] **G2.audit** v0 代码债 audit 行已登记 (agent_invitations / presence map / 节流策略) — 飞马

**野马签字**: ___ (日期: ___) | 1 周 dogfood 反馈期截止: ___

---

## Phase 3 — 第二维度产品

**Milestones (内部顺序锁死)**

1. [ ] **CHN-1** workspace 与 channel 关联
   - [ ] PR CHN-1.1 schema + 自动建 workspace
   - [ ] PR CHN-1.2 channel API 返回 workspace_id
2. [ ] **CV-1** ⭐ artifact 表 + 版本机制
   - [ ] PR CV-1.1 schema + 创建 API
   - [ ] PR CV-1.2 版本不可变约束 + 列表 API
   - [ ] PR CV-1.3 workspace UI 列 artifacts
3. [ ] **RT-1** artifact 推送 (从 Phase 4 提前)
   - [ ] PR RT-1.1 BPP `ArtifactUpdated` frame + server 转发
4. [ ] **CV-2** 锚点对话
5. [ ] **CV-3** D-lite 画布渲染
6. [ ] **CHN-2** DM 概念独立 (可与 CV-2/3 并行)
7. [ ] **CHN-3** 个人分组 reorder + pin (可与 CV-2/3 并行)
8. [ ] **CV-4** artifact iterate 完整流 (依赖 CV-1+RT-1+CV-2+CM-4)
9. [ ] **CHN-4** channel 协作场骨架 demo (收尾)

**Gates**

- [ ] G3.1 artifact 创建 + 推送 E2E (RT-1 推送非轮询) — 战马/烈马
- [ ] G3.2 锚点对话 E2E — 战马/烈马
- [ ] G3.3 用户感知签字 (CV-1 ⭐) — **野马** / 截屏 3 张: artifact 列表 / 添加新版本 / v1↔v2 切换
- [ ] G3.4 协作场骨架 (CHN-4) E2E — 战马/烈马
- [ ] **G3.audit** v0 代码债 audit 行已登记 (artifacts 表 / artifact_versions / anchor_comments / RT-1 frame) — 飞马

**野马签字 (CV-1)**: ___ (日期: ___)

---

## Phase 4+ — 剩余模块

按需排序。**已知依赖锁紧 (绘制成依赖箭头, 不允许颠倒)**:

```
BPP-1 ──→ AL-2a ──→ AL-2b ╲
   │                       ╲
   ╰──→ ─────────────→ BPP-3 (AL-2b 与 BPP-3 同 PR 合)

CM-4 ──→ CM-5 (agent↔agent, 新增, 依赖 CM-4 + AP-3)

DL-4 ──→ HB-1 (plugin manifest API)
DL-4 ──→ CS-3 (Web Push gateway)
```

### agent-lifecycle
- [ ] **AL-1** 状态四态扩展
- [ ] **AL-2a** config 表 + update API (并行 CM-*)
- [ ] **AL-2b** BPP ConfigUpdated frame (与 BPP-3 同 PR)
- [ ] **AL-3** presence 完整版 (复用 CM-4 的 IsOnline + Sessions 接口)
- [ ] **AL-4** 退役 = 禁用

### plugin-protocol (BPP)
- [ ] **BPP-1** 协议骨架 + 直连 flag + grep no-runtime + thinking subject 反约束 (工期 2 周)
- [ ] **BPP-2** 抽象语义层
- [ ] **BPP-3** 配置 SSOT + 热更新 (与 AL-2b 同合)
- [ ] **BPP-4** 失联与故障状态

### host-bridge (Borgee Helper)
- [ ] **HB-1** install-butler (依赖 DL-4)
- [ ] **HB-2** host-bridge daemon (仅读)
- [ ] **HB-3** 情境化授权 4 类
- [ ] **HB-4** ⭐ 信任五支柱可见 + v1 release gate 数字化 6 行指标

### realtime
- [ ] RT-1 (已在 Phase 3)
- [ ] **RT-2** 离线回放人/agent 拆 (取消 ⭐)
- [ ] **RT-3** ⭐ 多端全推 + 活物感 + thinking subject 反约束 (升 ⭐, 取代 RT-2)

### auth-permissions (剩余, AP-0 在 Phase 1)
- [ ] **AP-1** ABAC scope 三层
- [ ] **AP-2** UI bundle (无角色名)
- [ ] **AP-3** 跨 org owner-only 强制
- [ ] **AP-4** capability 清单 enum 化

### concept-model 补
- [ ] **CM-5** agent 间独立协作 (新增, X2 冲突裁决) — Phase 4

### admin-model
- [ ] **ADM-1** SPA + 元数据/内容硬隔离 + 用户隐私承诺可见 (核心 §13)
- [ ] **ADM-2** ⭐ 分层透明
- [ ] **ADM-3** 来源 C 混合

### data-layer (剩余, INFRA-1 在 Phase 0)
- [ ] **DL-1** 接口抽象 (A 必修)
- [ ] **DL-2** events 双流 + retention
- [ ] **DL-3** 阈值哨
- [ ] **DL-4** server-side services (plugin manifest API + Web Push gateway) — must-fix 收口

### client-shape
- [ ] **CS-1** 三栏 + Artifact 分级
- [ ] **CS-2** 故障三态 + 乐观缓存
- [ ] **CS-3** Mobile PWA (依赖 DL-4)

**G4.audit (滚动)**: 每个模块完成时更新 v0 代码债 audit 行; 全部完成时总表无 TODO — 飞马

---

## v0 → v1 切换

参见 [`README.md`](README.md) 切换 checklist。完成日期: ___

---

## 更新日志 (本文件)

| 日期 | 更新人 | 变化 |
|------|--------|------|
| (init) | team-lead | 初版打勾 skeleton 建立 |
| 2026-04-27 | team-lead | 4 人 review 后改: 加 CM-5 / AL-2 拆 a/b / RT-1 移 Phase 3 / RT-3 升 ⭐ / DL-4 收口 / 每 Phase audit gate / 签字回滚条款 / 4.1+4.2 双挂规则 |
