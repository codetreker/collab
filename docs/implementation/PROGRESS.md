# PROGRESS — 实施进度打勾

> **单一进度真相**。任何 milestone / PR / gate 状态变化都更新此文件。
>
> 形式: ✅ DONE / 🔄 IN PROGRESS / ⏳ PENDING (依赖未就绪) / ⏸️ BLOCKED (有阻塞需处理) / TODO (未开工)。
>
> 更新规则:
> - PR 合并 → 在对应行打 ✅, 提交注明 PR 号
> - Phase gate 通过 → 在 gate 行打 ✅, 注明证据 (PR / 截屏路径 / SQL 输出)
> - 标志性 milestone 关闭 → 野马签字一行 (姓名缩写 + 日期)
> - 每周一由飞马 review 一遍, 落后项标 ⚠️ 并加备注

---

## Phase 概览

| Phase | 状态 | 退出条件 | 备注 |
|-------|------|---------|------|
| Phase 0 基建闭环 | TODO | G0.1+G0.2+G0.3 全过 | 起步 |
| Phase 1 身份闭环 | TODO | G1.1~G1.5 全过 | 等 Phase 0 |
| Phase 2 协作闭环 ⭐ | TODO | G2.1~G2.5 全过 + 野马签字 | 等 Phase 1 |
| Phase 3 第二维度产品 | TODO | 第二段 demo + 野马签字 | 等 Phase 2 |
| Phase 4+ 剩余模块 | TODO | 各模块自身完成判定 | 等 Phase 3 |

---

## Phase 0 — 基建闭环

**Milestones**

- [ ] **INFRA-1** schema_migrations 框架 — 战马 (实现) / 飞马 (review) / 烈马 (验证)
  - [ ] PR-INFRA-1.1 框架代码 + 跑一次假迁移
  - [ ] PR-INFRA-1.2 PR 模板 + `Blueprint:` 锚点 lint

**Gates**

- [ ] G0.1 schema_migrations 能跑 — 证据: ___
- [ ] G0.2 数据契约 acceptance 形态可行 — 证据: ___
- [ ] G0.3 PR 模板生效 — 证据: ___

---

## Phase 1 — 身份闭环

**Milestones (concept-model + auth-permissions)**

- [ ] **CM-1** organizations 表落地 — 战马 / 飞马 / 野马 / 烈马
  - [ ] PR CM-1.1 schema (organizations 表 + users.org_id 列 + 索引)
  - [ ] PR CM-1.2 注册自动建 org
  - [ ] PR CM-1.3 admin stats GROUP BY org_id
  - [ ] PR CM-1.4 admin 调试页 (visibility checkpoint)
- [ ] **AP-0** 默认权限注册回填 (并行 CM-1) — 战马 / 飞马 / 野马 / 烈马
  - [ ] PR AP-0.1 注册时写默认权限
- [ ] **CM-3** 资源归属 org_id 直查 (CM-4 之后) — 战马 / 飞马 / 野马 / 烈马
  - [ ] PR CM-3.1 写路径 (4 张表填 org_id)
  - [ ] PR CM-3.2 读路径 (查询切 WHERE org_id)

**Gates**

- [ ] G1.1 数据层 org_id 落地 — 战马/烈马 / 证据: ___
- [ ] G1.2 注册自动建 org E2E — 战马/烈马 / 证据: ___
- [ ] G1.3 agent 继承 owner org — 战马/烈马 / 证据: ___
- [ ] G1.4 读路径直查 grep — 飞马 / 证据: ___
- [ ] G1.5 UI 不泄漏 org_id — 烈马/野马 / 证据: ___

---

## Phase 2 — 协作闭环 ⭐

**Milestones**

- [ ] **CM-4** agent 同事感首秀 — 野马 (主) / 战马 / 飞马 / 烈马
  - [ ] PR CM-4.1 agent_invitations 表 + 状态机 + API
  - [ ] PR CM-4.2 邀请通知 UI + 接受后 join channel
  - [ ] PR CM-4.3 minimal presence + 离线检测 + system message
  - [ ] PR CM-4.4 5 分钟节流 + E2E 串通

**Gates**

- [ ] G2.1 邀请审批 E2E — 战马/烈马 / 证据: ___
- [ ] G2.2 离线 fallback E2E — 战马/烈马 / 证据: ___
- [ ] G2.3 节流不变量 — 烈马 / 证据: ___
- [ ] G2.4 用户感知签字 — **野马** / 关键截屏路径: `docs/evidence/cm-4/`
- [ ] G2.5 presence 接口契约 — 飞马/战马 / 证据: ___

**野马签字**: ___ (日期: ___)

---

## Phase 3 — 第二维度产品

**Milestones**

- [ ] **CHN-1** workspace 与 channel 关联
  - [ ] PR CHN-1.1, CHN-1.2
- [ ] **CHN-2** DM 概念独立
- [ ] **CHN-3** 个人分组
- [ ] **CHN-4** channel 协作场骨架 demo ⭐
- [ ] **CV-1** artifact 表 + 版本机制 ⭐
  - [ ] PR CV-1.1, CV-1.2, CV-1.3
- [ ] **CV-2** 锚点对话
- [ ] **CV-3** D-lite 画布渲染
- [ ] **CV-4** artifact iterate 完整流

**Gate**: 第二段 demo + 野马签字 — 证据 / 截屏: ___

---

## Phase 4+ — 剩余模块

按需排序。详见各模块文档。

### agent-lifecycle
- [ ] AL-1 状态四态 / AL-2 配置 SSOT 热更新 / AL-3 presence 完整版 / AL-4 退役 = 禁用

### plugin-protocol (BPP)
- [ ] BPP-1 协议骨架 / BPP-2 抽象语义层 / BPP-3 配置 SSOT / BPP-4 失联状态

### host-bridge (Borgee Helper)
- [ ] HB-1 install-butler / HB-2 host-bridge daemon (仅读) / HB-3 情境化授权 / HB-4 信任五支柱可见 ⭐

### realtime
- [ ] RT-1 artifact 推送 / RT-2 离线回放人/agent 拆 ⭐ / RT-3 多端全推 + 活物感

### auth-permissions (剩余, AP-0 在 Phase 1)
- [ ] AP-1 ABAC scope 三层 / AP-2 UI bundle 无角色名 / AP-3 跨 org owner-only / AP-4 capability 清单

### admin-model
- [ ] ADM-1 SPA + 元数据/内容硬隔离 / ADM-2 分层透明 ⭐ / ADM-3 来源 C 混合

### data-layer (剩余, INFRA-1 在 Phase 0)
- [ ] DL-1 接口抽象 (A 必修) / DL-2 events 双流 + retention / DL-3 阈值哨

### client-shape
- [ ] CS-1 三栏 + Artifact 分级 / CS-2 故障三态 + 乐观缓存 / CS-3 Mobile PWA

---

## v0 → v1 切换

参见 [`README.md`](README.md) 切换 checklist。完成日期: ___

---

## 更新日志 (本文件)

| 日期 | 更新人 | 变化 |
|------|--------|------|
| (init) | team-lead | 初版打勾 skeleton 建立 |
