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
| Phase 2 协作闭环 ⭐ | ✅ DONE | 4 角色联签 (#271/#272/#273/#279) + 5+1 严格闸 SIGNED + 3 PARTIAL #248 condition + 2 DEFERRED 挂 Phase 4 PR # | closure #284 (建军 2026-04-28); 留账 G2.4 #275 / G2.5 #277 / G2.6 #274+#280; 锚 `docs/qa/phase-2-exit-announcement.md` |
| Phase 3 第二维度产品 | 🔄 IN PROGRESS | RT-1 ✅ / CHN-1 ✅ / AL-3 ✅ / CV-1 ✅ 三段四件 / BPP-1 ✅ #304; **CV-2/3/4 + CHN-2/3/4 + DM-2 七 milestone 4 件套全闭** (spec brief 7/7 + 文案锁 6/7 + acceptance 7/7 + stance 2/2 借用); 实施进度: CV-2.1+2.2 ✅ #359/#360 / CV-3.1 ✅ #396 / **DM-2 三段全闭 ✅** #361/#372/#388 (REG-DM2-001..009 🟢 #383); 待战马起手: CV-2.3/CV-3.2-3/CV-4/CHN-2/CHN-3/CHN-4 | Phase 2 ✅ closed; 锚 acceptance-templates `chn-1.md` / `rt-1.md` / `cv-1.md` / `al-3.md` / `cv-2.md` (#358) / `cv-3.md` (#376) / `cv-4.md` (#384) / `chn-2.md` (#353) / `chn-3.md` (#376) / `chn-4.md` (#381) / `dm-2.md` (#293) |
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
- [x] **ADM-0** admin 拆表 (admins 独立表 + cookie 拆 + god-mode endpoint) — 战马 / 飞马 (主, 起草) / 烈马 / 野马
  - [x] **ADM-0.1** admins 独立表 + env bootstrap + 独立 cookie name (双轨并存) (PR #197 merged)
  - [x] **ADM-0.2** cookie 拆 + RequirePermission 去 admin 短路 + god-mode 白名单 (users.role='admin' 调 user-api 401) (PR #201 merged)
  - [x] **ADM-0.3** users.role enum 收 + backfill 旧 admin 行 → admins 表 + revoke session (users.role='admin' 行数 = 0) (PR #223 merged, v=10)
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
- [x] **RT-0** /ws push 顶住 BPP (取代 60s polling) — 战马 / 飞马 / 烈马 / 野马 (PR #218 client + #237 server merged)
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
- [x] G2.3 节流不变量 (fake clock 单测) — 烈马 / 证据: PR #229 internal/throttle + #236 T1-T5 全过
- [ ] G2.4 用户感知签字 — **野马** / 关键截屏路径: `docs/evidence/cm-4/` (5 张 + stopwatch ≤ 3s) + blueprint-sha.txt
- [ ] G2.5 presence 接口契约 (IsOnline + Sessions 锁死) — 飞马/战马 / 证据: 接口签名文件 ___
- [ ] G2.6 (新, R3) /ws → BPP schema 等同性 (CI lint byte-identical) — 飞马 / 证据: lint 输出
- [ ] **G2.audit** v0 代码债 audit 行已登记 (agent_invitations / presence map / 节流策略 / **admin 拆表迁移** / **/ws push schema lock**) — 飞马

**野马签字**: ___ (日期: ___) | 1 周 dogfood 反馈期截止: ___

---

## Phase 3 — 第二维度产品

**Milestones (内部顺序锁死)**

1. [x] **CHN-1** workspace 与 channel 关联 ✅
   - [x] PR CHN-1.1 schema + 自动建 workspace (PR #276 merged, v=11)
   - [x] PR CHN-1.2 channel API 返回 workspace_id (PR #286 merged)
   - [x] PR CHN-1.3 client SPA workspace 侧栏 (PR #288 merged)
2. [x] **CV-1** ⭐ artifact 表 + 版本机制 ✅ DONE
   - [x] PR CV-1.1 schema (artifacts + artifact_versions, v=13) (PR #334 cd7e12a + 22203ea follow-up; acceptance flip #340)
   - [x] PR CV-1.2 server API + WS push (PR #342 merged b2ed5c0f, 11 CV12_* test PASS, frame 守 #290 byte-identical)
   - [x] PR CV-1.3 workspace UI 列 artifacts (PR #346 client SPA 623c1bb 5 vitest PASS + PR #348 e2e 0ef0cb1 2 playwright PASS; acceptance flip #347 + REG-CV1-017 flip #350)
3. [x] **RT-1** artifact 推送 (从 Phase 4 提前) ✅
   - [x] PR RT-1.1 BPP `ArtifactUpdated` frame + server cursor (PR #290 merged)
   - [x] PR RT-1.2 client backfill `?since=N` (PR #292 merged)
   - [x] PR RT-1.3 BPP `session.resume` frame (PR #296 merged)
4. [x] **CV-2** 锚点对话 三段四件全闭 ✅ (spec #356 v3 #368 / 文案锁 #355 / acceptance #358 / stance 借 spec; CV-2.1 ✅ #359 c5bf03d schema v=14 + CV-2.2 ✅ #360 84f9e5d server 4 endpoints + 8+2 PASS + AnchorCommentAdded 10 字段 byte-identical WS frame + CV-2.3 ✅ #404 693e70c client SPA 选区→锚 + thread side panel + 4 literals 文案锁 byte-identical + e2e §3.1+§3.2+§3.5+§3.6; REG-CV2-001..005 🟢 #421)
5. [ ] **CV-3** D-lite 画布渲染 — 4 件套 ✅ (spec #363+#397 v1 / 文案锁 #370 / acceptance #376 / 借 spec stance); CV-3.1 ✅ #396 schema v=17 (artifacts.kind enum 扩 'code'/'image_link'); CV-3.2/3.3 实施待战马A
6. [ ] **CHN-2** DM 概念独立 — 4 件套 ✅ (spec #357 / 文案锁 #354+#364 / acceptance #353 / 借 spec stance); CHN-2.1/2.2/2.3 实施待战马
7. [ ] **CHN-3** 个人分组 reorder + pin — 4 件套 ✅ (spec #371 / 文案锁 待野马 / acceptance #376 / stance #366); CHN-3.1/3.2/3.3 实施待战马B
8. [ ] **CV-4** artifact iterate 完整流 — 4 件套 ✅ (spec #365 / 文案锁 #380 / acceptance #384 / stance #385); CV-4.1/4.2/4.3 实施待战马A
9. [ ] **CHN-4** channel 协作场骨架 demo (收尾) — 4 件套 ✅ (spec #374 / 文案锁 #382 / acceptance #381 / stance #378); CHN-4.1/4.2/4.3 实施待战马 (G3.4 三签退出闸: 战马 e2e + 烈马 acceptance + 野马 双 tab 截屏文案锁验)
10. [ ] **DM-2** mention (从 Phase 4 提前, G3.4 协作场骨架依赖) — 4 件套 ✅ (spec #312/#362/#377 / 文案锁 #314 / acceptance #293 / 借 spec stance); DM-2.1 ✅ #361 + DM-2.2 ✅ #372 + **DM-2.3 ✅ #388** (76fb0f8, client SPA mention 渲染收口) — DM-2 三段全闭 ⭐ (REG-DM2-001..009 🟢 #383, -010 留 client 翻牌)

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
  - [x] **AL-1a** online/offline + error 旁路 + 6 reason codes (PR #249, Phase 2 起步, 蓝图 §2.3 R3 锁)
  - [ ] **AL-1b** busy/idle (Phase 4, 跟 BPP task_started/task_finished frame 同期)
- [ ] **AL-2a** config 表 + update API (并行 CM-*)
- [ ] **AL-2b** BPP ConfigUpdated frame (与 BPP-3 同 PR)
- [x] **AL-3** presence 完整版 ✅ (复用 PresenceTracker IsOnline + Sessions 接口, #277 stub → 真实施)
  - [x] **AL-3.1** schema (presence_sessions 表, v=12) (PR #310 merged)
  - [x] **AL-3.2** server hub WS lifecycle hook (PR #317 merged)
  - [x] **AL-3.3** client UI presence dot (PR #324 + #327 follow-up merged)
- [ ] **AL-4** runtime registry (3 件套全 merged: #313 v0/#379 v2 spec / #318 acceptance / #319 stance / #321 文案锁 / #322; **AL-4.1 schema v=16 ✅ #398 1327c82**; AL-4.2 server in-flight 战马E #414 / AL-4.3 client #417 战马C in-flight)
  - [x] **AL-4.1** schema (agent_runtimes 表, v=16) (PR #398 merged 1327c82)
  - [ ] **AL-4.2** server start/stop API + heartbeat hook + admin god-mode (in-flight 战马E #414)
  - [ ] **AL-4.3** client SPA agent settings 启停 UI (in-flight 战马C #417)

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
| 2026-04-28 | 飞马 | Phase 概览 flip: Phase 2 → ✅ DONE (closure #284 4 联签 #271/#272/#273/#279 + 5+1 严格闸 SIGNED + 3 PARTIAL #248 + 2 DEFERRED 留账 #274/#275/#277/#280, 锚 phase-2-exit-announcement.md); Phase 3 → 🔄 IN PROGRESS (RT-1 三段 #290+#292+#296 + CHN-1 三段 #276+#286+#288 + CV-1 立场 #282+#295 实施 / BPP-1 envelope CI lint 留账) |
| 2026-04-29 | 飞马 | Phase 3 详细段 stale flip (audit 抓出 ⚠️): CHN-1 ⚪→✅ (#276/#286/#288 三段全闭); RT-1 ⚪→✅ (#290/#292/#296 三段全闭, 拆出 RT-1.2 + RT-1.3); CV-1 ⚪→🔄 (CV-1.1 ✅ #334+#340, CV-1.2 in-flight 战马A 锚 #341 frame align); Phase 4+ AL-3 ⚪→✅ (#310/#317/#324/#327 三段全闭, 加 stub→真实施备注); AL-4 备注实施前置全 merged #313/#318/#319/#321/#322 待战马B; Phase 概览行同步更新 (CHN-1/RT-1/AL-3 ✅, CV-1.1 ✅, CV-1.2 in-flight) |
| 2026-04-29 | 战马A | CV-1 三段四件全闭 flip (dev-side stale 抓出): Phase 概览行 "CV-1.2 in-flight" → "CV-1 三段四件全闭 (#334+#342+#346+#348)" + BPP-1 envelope CI lint 由"留账"改 "✅ #304 真落"; CV-1 milestone `[ ] 🔄` → `[x] DONE`; CV-1.2 `[x] PR #342 merged b2ed5c0f` (11 CV12_* test PASS); CV-1.3 `[x] PR #346 客户端 623c1bb 5 vitest + #348 e2e 0ef0cb1 2 playwright` (acceptance flip #347 + REG-CV1-017 flip #350); 锚 acceptance-templates `cv-1.md` (#340+#347); CV-1 ⭐ Phase 3 主线饱满 milestone (17 🟢 REG); 主线进度 3/9 → 3/9 (CHN-1/CV-1/RT-1 闭, 待启 CV-2/CV-3/CHN-2/CHN-3/CV-4/CHN-4) |
| 2026-04-29 | 烈马 | Phase 3 章程 4 件套全闭里程碑 + 实施进度同步: 6 收尾 milestone (CV-2/3/4 + CHN-2/3/4) 加 DM-2 共 7 milestone **4 件套全闭** (spec brief 7/7 #312/#356 v3 #368/#363/#365/#357/#371/#374/#377 / 文案锁 6/7 #314/#355/#370/#380/#354+#364/#382 — CHN-3 文案锁待野马 / acceptance 7/7 #293/#358/#376 CV-3+CHN-3/#384/#353/#381 / stance 2/2 #366+#378 其他借 spec); 实施进度: CV-2.1 ✅ #359 schema v=14 + CV-2.2 ✅ #360 server (4 endpoints + 8+2 PASS) + DM-2.1 ✅ #361 schema v=15 + DM-2.2 ✅ #372 server parser+WS push+offline fallback (REG-DM2-001..009 ⚪→🟢 #383, count 145/118/27 三方对账平衡); 待战马起手 CV-2.3/CV-3/CV-4/CHN-2/CHN-3/CHN-4 + DM-2.3 (战马C 续作 #388 路径). Phase 概览行同步翻新 (RT-1/CHN-1/AL-3/CV-1 ✅ + 7 milestone 4 件套全闭 + 实施 2/7 milestone server-side 闭). REG audit: 总计 145 / active 118 / pending 27 (含 ⏸️ 9), 各 milestone ⚪ pending IDs 见 regression-registry.md §3. |
