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
> **签字回滚条款 (野马 P3 弱采纳)**: 标志性 milestone 关闭后 1 周内, 若野马在内部 dogfood 中发现立场被实施稀释 (例: "其实没看出 agent 是同事感"), 可发起作废重做; 作废后该 milestone 退回 IN PROGRESS, **仅 reopen 该 milestone, 不阻塞下一 Phase 工程进度** (飞马 R2: 防 PM 卡 dev)。这是产品立场底线, 工程节奏不被反复打断。

---

## Phase 概览

| Phase | 状态 | 退出条件 | 备注 |
|-------|------|---------|------|
| Phase 0 基建闭环 | ✅ DONE | G0.1+G0.2+G0.3+G0.audit 全过 (G0.4/G0.5 软 gate, 不卡退出) | 起步; 含 INFRA-1a/1b 拆分; **工期 2 周** (战马 R2). 实际 5 PR (#169-#173) 一日完成 |
| Phase 1 身份闭环 | ✅ DONE | G1.1~G1.5 + G1.audit 全过 | CM-1 + AP-0 + CM-3 全 merged; G1 全签 #210, G1.4 closed by #208 + #210 |
| Phase 2 协作闭环 ⭐ | TODO | G2.1~G2.5 + G2.audit + 野马签字 | 等 Phase 1 |
| Phase 3 第二维度产品 | TODO | G3.1~G3.4 + G3.audit + 野马签字 (CV-1) | 等 Phase 2; 内部顺序锁死 |
| Phase 4+ 剩余模块 | TODO | 各模块自身完成判定 + G4.audit | 等 Phase 3 |

---

## Phase 0 — 基建闭环

**Milestones**

- [x] **INFRA-1a** schema_migrations 框架 — 战马 / 飞马 / 烈马
  - [x] PR-INFRA-1a.1 框架代码 + 跑一次假迁移 (PR #169, coverage 90.3%)
- [x] **INFRA-1b** 测试 harness — 战马 (主) / 飞马 / 烈马
  - [x] PR-INFRA-1b.1 fake/real Clock (PR #171, coverage 100%)
  - [x] PR-INFRA-1b.2 内存 sqlite + fixture seeder (PR #172, coverage 91.7%)
  - [x] PR-INFRA-1b.3 回归入册 + `make regression` (PR #173, coverage 100%)
- [x] **CI lint** PR 改 internal 必同步 docs/current — 战马 (实现) / 烈马 (验证) (PR #170)
- [x] **PR 模板生效** Blueprint / Touches / Current 同步 三区块强制 — 飞马 (PR #170)

**Gates**

- [x] G0.1 schema_migrations 能跑 — 证据: PR #169 `internal/migrations/migrations_test.go` 8 用例 PASS, coverage 90.3%
- [x] G0.2 acceptance 验证脚本 (1 fail + 1 pass) — 证据: PR #170 `pr-template` lint 自检, run [25008169145](https://github.com/codetreker/borgee/actions/runs/25008169145) FAIL → run [25008849364](https://github.com/codetreker/borgee/actions/runs/25008849364) PASS
- [x] G0.3 PR 模板生效 (≥ 1 PR 三区块齐) — 证据: PR #169-#173 全部含 `Blueprint:`/`Touches:`/`Current 同步`/`Stage:` 五块, lint 全绿
- [x] G0.4 测试 harness 可用 (1 个 fake clock 用例跑通) — 证据: PR #171 `TestAfterFiresWhenDeadlineCrossed` Advance 触发已注册 After waiter PASS; 烈马本地联合 smoke (fake clock + OpenSeeded + Advance) 一次通过
- [x] G0.5 current sync CI lint 工作 — 证据: [`docs/evidence/g0.5/README.md`](../evidence/g0.5/README.md) (双向闭环: fail 路径 PR #170 第一推送拒绝 + pass 路径 #170-#173 全绿; exclude_globs 防纯测试 PR 误伤)
- [x] **G0.audit** v0 代码债 audit 表本 Phase 行已登记 — 飞马 (README §audit: schema_migrations 框架 DONE + main flaky test TODO 已入表)

---

## Phase 1 — 身份闭环

**Milestones**

- [x] **CM-1** organizations 表落地 — 战马 / 飞马 / 野马 / 烈马
  - [x] PR CM-1.1 schema (organizations 表 + users.org_id 列 + 索引) (PR #176)
  - [x] PR CM-1.2 注册自动建 org (PR #178)
  - [x] PR CM-1.3 admin stats GROUP BY org_id (PR #179)
  - [x] PR CM-1.4 admin 调试页 (visibility checkpoint, 非 acceptance) (PR #180)
- [x] **AP-0** 默认权限注册回填 (与 CM-1 并行) — 战马 / 飞马 / 野马 / 烈马
  - [x] PR AP-0.1 注册时写默认权限 (human=`*`, agent=`message.send`) (PR #177)
- [x] **CM-3** 资源归属 org_id 直查 (CM-4 之后) — 战马 / 飞马 / 野马 / 烈马 (PR #208)
  - [x] PR CM-3.1 写路径 (4 张表 stamp org_id at INSERT) (PR #208)
  - [x] PR CM-3.2 读路径 (跨 org 403 + JOIN owner_id 全删) (PR #208)

**Gates**

- [x] G1.1 数据层 org_id 落地 — 战马/烈马 / 证据: 烈马本地 fresh DB SQL 直查 — schema_migrations v2 cm_1_1_organizations / organizations DDL / users·channels·messages·workspace_files·remote_nodes 5 表 org_id TEXT NOT NULL DEFAULT '' / 5 索引 idx_*_org_id 全部确认
- [x] G1.2 注册自动建 org E2E — 战马/烈马 / 证据: 真实 POST /api/v1/auth/register 路径, users.org_id 非空 + organizations 行 name="<DisplayName>'s org" (烈马本地 in-mem sqlite acceptance run, 2026-04-28)
- [x] G1.3 agent 继承 owner org — 战马/烈马 / 证据: member 创 agent → agent.OrgID == owner.OrgID; admin 创 human → 自动建 org (同上 run)
- [x] G1.4 读路径直查 (SQL EXPLAIN + grep 黑名单) — 飞马/烈马 / 证据: closed by #208 (CM-3 写/读路径 stamp + 跨 org 403) + #210 (g1-audit.md §2.1 黑名单 grep count==0 / §2.2 三类 403 PASS / §2.3 EXPLAIN 走 idx_*_org_id)
- [x] G1.5 UI 不泄漏 org_id (合约测试) — 烈马/野马 / 证据: 用户面 6 端点 + 2 响应体 leak-scan 全部不含 `org_id` (GET /api/v1/users/me, /admin-api/v1/auth/me, /admin-api/v1/users, /api/v1/agents; POST /api/v1/auth/register, /api/v1/agents 响应); /admin-api/v1/stats by_org 是 admin-only 故意暴露, 白名单
- [x] **G1.audit** v0 代码债 audit 行已登记 (organizations 删库 / users.org_id 加列) — 飞马 (PR #182)

---

## Phase 2 — 协作闭环 ⭐ (2026-04-28 R3 立场冲突后重排)

> **R3 重排 (#188 merged)**: 6 条立场冲突落地后, Phase 2 解封顺序改为: ADM-0 (admin 拆表) + AP-0-bis (message.read 回归) + INFRA-2 (Playwright 提前) + RT-0 (/ws push 顶住 BPP) + CM-onboarding (Welcome channel) → 然后 CM-4.3b/4.4 → 闸 4 签字。
> **Phase 2 工期净增 +8-10 天** (战马 R3 实测), 但避免 CM-3 之后每个 endpoint 都要写 admin 特殊分支。

**Milestones (按 R3 解封顺序)**

### Phase 2 解封前置 (R3 新增)

- [x] **INFRA-2** Playwright scaffold (E2E) — 战马 / 飞马 / 烈马 (PR #195 merged)
  - 必须前置到 RT-0 之前 (烈马 R3: latency ≤ 3s 硬条件 vitest 跑不了)
  - 工期 2-3 天 (战马 R1: vite orchestrate + cookie fixtures + chromium CI)
- 🔄 **ADM-0** admin 拆表 (admins 独立表 + cookie 拆 + god-mode endpoint) — 战马 / 飞马 (主, 起草) / 烈马 / 野马
  - [x] **ADM-0.1** admins 独立表 + env bootstrap + 独立 cookie name (双轨并存) (PR #197 merged)
  - [x] **ADM-0.2** cookie 拆 + RequirePermission 去 admin 短路 + god-mode 白名单 (users.role='admin' 调 user-api 401) (PR #201 merged)
  - [ ] **ADM-0.3** users.role enum 收 + backfill 旧 admin 行 → admins 表 + revoke session (users.role='admin' 行数 = 0) — 🔄 IN PROGRESS (task #63, v=10)
  - 工期 server 4-6 天 + client 1 天
  - 烈马一票否决: cookie 串扰反向断言
  - 详见 [`modules/admin-model.md`](modules/admin-model.md)
- [x] **AP-0-bis** message.read 默认 grant + backfill 迁移 — 战马 / 飞马 / 烈马 (PR #206 merged, v=8)
  - 工期 1 天
  - 必带 `testutil.SeedLegacyAgent` helper (烈马 R3, CM-3 也用)
  - **依赖 ADM-0.2 已 merge** (飞马 R1 P0 ②: AP-0-bis 加 RequirePermission("message.read") 必须在 admin 直通短路砍掉之后, 否则 admin 既被砍直通又没 message.read 而 401 中间态)
  - 详见 [`modules/auth-permissions.md`](modules/auth-permissions.md)
- [x] **CM-onboarding** Welcome channel + auto-join + system message — 战马 / 飞马 / 野马 (立场) / 烈马 (PR #203 merged, v=7)
  - 工期 0.5-1 天
  - **依赖野马 `00-foundation/onboarding-journey.md` (硬截止 2026-05-05)** — 飞马 R1 P1 ③: 防卡死风险
  - 野马 must-fix (实施时落地): Welcome system message 必带 quick action button "创建 agent" + backfill 失败的空状态降级文案 (§11 反约束) + 文案锁定位置在 onboarding-journey.md
  - 详见 [`modules/concept-model.md`](modules/concept-model.md) §10
- [ ] **RT-0** /ws push 顶住 BPP (取代 60s polling) — 战马 / 飞马 / 烈马 / 野马 (⏳ pending, task #40, INFRA-2 已就绪可解锁)
  - 工期 1.5-2 天
  - 依赖 INFRA-2 (latency E2E 验)
  - 蓝图 realtime §2.3: schema 必须等同未来 BPP frame, CI lint 强制
  - 野马硬条件: latency ≤ 3s (Playwright stopwatch 截屏)
  - 详见 [`modules/realtime.md`](modules/realtime.md)

### CM-4 完成 (前置就位后)

- [x] **CM-4.0** agent_invitations schema + 状态机单测 (#183 merged)
- [x] **CM-4.1** API handler POST/GET/PATCH (#185 merged)
- [x] **CM-4.2** client UI inbox + quick action (#186 merged) — **60s polling, RT-0 后切 ws push 自动升级**
- [ ] **CM-4.3b** 离线检测 + system message — 依赖 RT-0 (复用 ws hub 推送)
- [ ] **CM-4.4** 5 分钟节流 + E2E — 战马 / 烈马
- [ ] **闸 4 独立流程**: 野马 demo 签字 + 5 张关键截屏 (含 subject 文案 + agent↔agent 口播 + **stopwatch ≤ 3s**) + blueprint-sha.txt

### Phase 2 后置 (CM-4 闸 4 通过后)

- [ ] **ADM-1** SPA + 元数据/内容硬隔离 + 用户隐私承诺页 — 飞马 / 战马 / 野马 / 烈马
  - 用户承诺页 3 条文案锁死 (admin-model §4.1)
  - 隐私承诺反查表 v0 ✅ 落 (PR #211, 野马)
  - 详见 [`modules/admin-model.md`](modules/admin-model.md)

**配套 doc 工件 (Phase 2 已落)**:
- ADM-0 立场反查表 v0 ✅ (PR #205, 野马)
- G2.4 5 张截屏 spec + 野马 partial 签 ✅ (PR #199 计划 + 后续 spec)

**Gates**

- [ ] G2.0 (新, R3) ADM-0 cookie 串扰反向断言 — 烈马 / 一票否决式
- [ ] G2.1 邀请审批 E2E (Playwright + ws push) — 战马/烈马 / 证据: ___
- [ ] G2.2 离线 fallback E2E — 战马/烈马 / 证据: ___
- [ ] G2.3 节流不变量 (fake clock 单测) — 烈马 / 证据: ___
- [ ] G2.4 用户感知签字 — **野马** / 关键截屏路径: `docs/evidence/cm-4/` (5 张 + stopwatch ≤ 3s) + blueprint-sha.txt
- [ ] G2.5 presence 接口契约 (IsOnline + Sessions 锁死) — 飞马/战马 / 证据: 接口签名文件 ___
- [ ] G2.6 (新, R3) /ws → BPP schema 等同性 (CI lint byte-identical) — 飞马 / 证据: lint 输出
- [ ] **G2.audit** v0 代码债 audit 行已登记 (agent_invitations / presence map / 节流策略 / **admin 拆表迁移** / **/ws push schema lock**) — 飞马

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
DL-4 ──→ HB-1  (plugin manifest API)
DL-4 ──→ CS-3  (Web Push gateway)
       (DL-4 必须先于 HB-1/CS-3, 飞马 R2)

BPP-1 ──→ AL-2a ──→ AL-2b ╲
   │                       ╲
   ╰──→ ─────────────→ BPP-3 (AL-2b 与 BPP-3 同 PR 合)

CM-4 ─┬→ CM-5 (agent↔agent, 新增, 依赖 CM-4 + AP-3)
      │
AP-3 ─┘
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
- [ ] **ADM-2** 分层透明 (取消 ⭐, 野马 R2 — 普通用户无感)
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
| 2026-04-27 | team-lead | R2 review 落 20 项: Phase 0 工期 2 周 / G2.5 触发点 stub / 闸 5 覆盖率收紧 / 跨模块 PR 拆契约+实现 / CM-4.4 PR 与签字解耦 / Sessions 多端压测留 AL-3 / thinking subject 挪 BPP-2 / DL-4 头部排序锁 / ADM-2 取消 ⭐ / G3.4 加 chat+artifact 双 tab / G2.4 加 subject 文案 + agent↔agent 口播 / HB-4 测量基准锁 / CV-4 timer 单测 + 5s 不刷新 / blueprint §1.3 加协作语义边界 / presence 路径 internal/presence/contract.go / 签字回滚仅 reopen milestone |
| 2026-04-28 | 烈马 | Phase 0 闭环: PR #169-#173 全 merged + Gates G0.1-G0.5 + G0.audit 全 ✅, G0.5 evidence 落 `docs/evidence/g0.5/README.md` |
| 2026-04-28 | 烈马 | Phase 1 收口: CM-1 (PR #176/#178/#179/#180) + AP-0 (#177) + G1.audit (#182) 全 merged; Gates G1.1/G1.2/G1.3/G1.5 ✅ (烈马本地 fresh DB SQL 直查 + 真实 HTTP register/agent E2E + 6 端点 leak-scan); G1.4 ⏸ 待 CM-3 写路径完成后补; Phase 概览改 🔄 4/5 + audit ✅ |
| 2026-04-28 | 飞马 | D1–D9 flip (audit #212 派活): Phase 1 改 ✅ DONE (G1.4 closed by #208 + #210, CM-3 closed by #208); Phase 2 解封前置 5/6 改 [x] (INFRA-2 #195, ADM-0.1 #197, ADM-0.2 #201, AP-0-bis #206, CM-onboarding #203); ADM-0 总括改 🔄 (ADM-0.3 #63 in progress); RT-0 留 ⏳; 配套 doc 工件 (#205 ADM-0 立场反查 / #211 ADM-1 隐私承诺 / #199 G2.4 截屏 plan) 落 Phase 2 后置区 |
