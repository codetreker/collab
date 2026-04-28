# Phase 3 Readiness Review — 飞马 (v0 preview)

> 烈马代飞马起草 · 2026-04-29 · CV-1 三段四件刚闭, Phase 3 退出 gate 提前 preview (非签字)
>
> 源整合: `PROGRESS.md` Phase 3 段 · `regression-registry.md` v=15 · `acceptance-templates/` (chn-1/rt-1/al-3/cv-1/cv-2/cv-3/cv-4/chn-4) · `phase-3-stance-table-v0.md` · `cv-1-stance-checklist.md`
>
> 作用: 出 Phase 3 距离退出公告还差什么的独立判定 — **不是签字 ready**, 是给 team-lead 一份 ✅ done / ⚠️ in-flight / ❌ not-started 三色矩阵, 锁后续派活方向。

## 1. Phase 3 五闸 SIGNED 状态汇总

| 闸 | 状态 | 性质 | 主线锚 | 闭合 PR | 备注 |
|---|---|---|---|---|---|
| **G3.1** artifact 创建 + 推送 E2E | 🟡 PARTIAL | 严格 | CV-1 + RT-1 | #348 (0ef0cb1) | CV-1.3 e2e 闭 §3.1-§3.3 (markdown render / rollback owner-only / WS push ≤3s + 409 toast 文案锁); 真 server-go(4901)+vite(5174) 2 tests ~3.7s; **缺 RT-1 cursor backfill 跨断线 e2e** (REG-RT1-006..010 5 ⚪) |
| **G3.2** 锚点对话 E2E | ❌ NOT-STARTED | 严格 | CV-2 | — | CV-2 milestone 未启 (acceptance template 仅就位); blocker |
| **G3.3** 用户感知签字 (CV-1 ⭐) | 🟡 PENDING | 条件性 | CV-1 截屏 3 张 | — | CV-1 三段四件 (#334/#342/#346/#348) 已闭, 但野马截屏 3 张 (artifact 列表 / 添加新版本 / v1↔v2 切换) 未交; 跟 G2.4 同模式 |
| **G3.4** 协作场骨架 (CHN-4) E2E | ❌ NOT-STARTED | 严格 | CHN-4 | — | CHN-4 收尾 milestone, 依赖 CV-1+CV-2+CM-4; blocker |
| **G3.audit** v0 代码债 audit | ⚪ TBD | 严格 | 跨 milestone | — | artifacts 表 / artifact_versions / anchor_comments / RT-1 frame 4 行登记位待 Phase 3 主线全闭后烈马跑 |

**严格闸完成度**: 1 PARTIAL / 2 NOT-STARTED / 1 PENDING / 1 TBD = **0/5 SIGNED**

## 2. 主线 milestone 完成度 (Phase 3 内部锁定顺序 PROGRESS.md)

| # | Milestone | 状态 | 锚 PR | REG count |
|---|---|---|---|---|
| 1 | **CHN-1** workspace ↔ channel | ✅ DONE | #276 + #286 + #288 | 9 🟢 + 1 ⏸️ |
| 2 | **CV-1** ⭐ artifact + 版本 | ✅ DONE | #334 + #342 + #346 + #348 (+ #350 acceptance flip) | 17 🟢 (CV-1.1 4 + CV-1.2 7 + CV-1.3 5 + e2e 1) |
| 3 | **RT-1** artifact 推送 | ✅ DONE | #290 + #292 + #296 | 5 🟢 + 5 ⚪ (cursor backfill e2e 留账) |
| 4 | **CV-2** 锚点对话 | ❌ NOT-STARTED | — | template only |
| 5 | **CV-3** D-lite 画布渲染 | ❌ NOT-STARTED | — | template only |
| 6 | **CHN-2** DM 概念独立 | ❌ NOT-STARTED | — | template only |
| 7 | **CHN-3** 个人分组 reorder + pin | ❌ NOT-STARTED | — | template only |
| 8 | **CV-4** artifact iterate 完整流 | ❌ NOT-STARTED | — | template only (依赖 CV-1+RT-1+CV-2+CM-4) |
| 9 | **CHN-4** channel 协作场骨架 demo | ❌ NOT-STARTED | — | template only (收尾) |

**主线进度**: **3/9 DONE** (CHN-1 / CV-1 / RT-1 三主线已闭, 6 milestone 待启)

辅线 (跨 Phase): AL-3 (5 🟢 + 5 ⚪, AL-3.2/3.3 待实施) · AL-4 (0/10, 依赖 AL-3.3) · DM-2 (待派 v=14) · AL-4.1 (v=15 卡 v 号待 DM-2.1)

## 3. 是否 ready 出 Phase 3 退出公告

**❌ NOT READY (主线 6/9 未启, 严格闸 0/5 SIGNED)** — 飞马不拍板, 暂不进 announcement skeleton 阶段。

理由: ① 严格 5 闸 0 SIGNED, 跟 Phase 2 收尾时 4 闸 ✅ + 2 留账 的形态差距过大; ② 主线只闭 3/9, CV-2/CV-3/CHN-2/CHN-3/CV-4/CHN-4 全部未启, 跟 announcement v1 5 SIGNED + 3 PARTIAL + 2 DEFERRED 的"条件性全过"门槛差太多; ③ G3.2/G3.4 闸位主线未启, 不存在"留账挂占号 PR #" 路径 (没人拉 stub 也没意义)。

## 4. Phase 3 已闭部分 — 三主线收尾质量盘

跟 Phase 2 收尾标准对照, 三主线 (CHN-1 / CV-1 / RT-1) 已达"严格闸级":

- **CHN-1 三段** (#276/#286/#288): schema v=11 + API + client SPA 全闭, 9 🟢 REG + 1 ⏸️ deferred (acceptance-templates/chn-1.md §1-§3 全 ✅)
- **CV-1 三段四件** (#334/#342/#346/#348 + #350 acceptance flip): schema v=13 + server API 11 test + client SPA 5 vitest + e2e 2 playwright; 17 🟢 REG (Phase 3 内最饱满 milestone, 立场 ①-⑦ + v1 supplement 全闭)
- **RT-1 三段** (#290/#292/#296): cursor backfill + BPP `session.resume`, 5 🟢 REG + 5 ⚪ (cursor 跨断线 e2e 留账, 跟 BPP-1 #304 envelope CI lint 已上线后, 自动覆盖一半)

⚠️ **CV-1 ⭐ G3.3 截屏前置必检** (野马排期):
1. artifact 列表截屏 (workspace 侧栏 + Canvas tab 平级)
2. 添加新版本截屏 (markdown 编辑器 → commit → 版本列表 +1)
3. v1 ↔ v2 切换截屏 (linear 列表 + rollback button owner-only DOM)

跟 G2.4 同模式 (#239 latency ≤ 3s 截屏在册); 三张落 → G3.3 翻 PARTIAL → SIGNED。

## 5. Phase 4 entry 前置依赖 vs Phase 3 留账冲突点

**Phase 4+** (`PROGRESS.md` Phase 4 段): AL-3.2 / AL-3.3 / AL-4 / AL-4.1 / DM-2 / ADM-1 / 各 AL milestone 接力。

| Phase 3 待办 | Phase 4 第一波碰撞? | 处置 |
|---|---|---|
| CV-2 / CV-3 / CV-4 (画布 + 锚点 + iterate 流) | ❌ Phase 4 不依赖 (Phase 4 主线是 agent 生命周期) | 隔离 |
| CHN-2 / CHN-3 / CHN-4 (DM + 分组 + 协作场骨架) | ❌ 同上 | 隔离 |
| AL-3.2 / AL-3.3 presence 后续 | ⚠️ AL-4 (依赖 AL-3.3 接力) + AL-4.1 (v=15 卡 v 号待 DM-2.1) — Phase 4 主线串行依赖 | AL-3.2 / AL-3.3 必须 Phase 3 内闭, 否则 AL-4 / AL-4.1 v 号链断 |
| RT-1 cursor 跨断线 e2e (5 ⚪ 留账) | ❌ Phase 4 不依赖 cursor 跨断线 | 留账 Phase 3 收尾 e2e 补 |
| G3.audit v0 代码债 audit | ✅ 必跑 — Phase 4 主线启动前烈马 audit 跨 milestone | Phase 3 主线 9/9 闭后立即跑, 同 G2.audit v2 12 行模板 |

**Phase 3 退出 trigger** (类比 #241 Phase 3 启动 trigger 4 项): 拟 Phase 3 退出 4 项硬条件:
- ① 主线 9/9 DONE (CV-2 / CV-3 / CHN-2 / CHN-3 / CV-4 / CHN-4 待启)
- ② 严格 5 闸 SIGNED (G3.1 PARTIAL → SIGNED 需 RT-1 cursor e2e + G3.2 / G3.4 主线先闭 + G3.3 截屏 3 张 + G3.audit 跑)
- ③ 野马 G3.3 stance signoff (CV-1 ⭐ 截屏 3 张挂 `signoffs/cv-1-yema-stance-signoff.md`)
- ④ Phase 3 announcement skeleton + 4 角色联签 PR

## 6. 后续派活方向 (team-lead 决策位)

按 PROGRESS.md 锁定顺序, 下一波派活集中在 **CV-2 锚点对话** (Phase 3 milestone #4):
- CV-2 acceptance template 已就位 (`acceptance-templates/cv-2.md` 待飞马 review)
- CV-2 立场反查 + 实施拆段 (CV-2.1 schema / CV-2.2 server / CV-2.3 client) 待派
- 同时 AL-3.2 / AL-3.3 + AL-4 接力 (跨 Phase 串行依赖, 卡 Phase 4 入口)

⚠️ **冲突点**: AL-4.1 v=15 卡 v 号待 DM-2.1 (v=14), 而 DM-2 acceptance template (`dm-2.md`) 跟 CV-2 都属于 Phase 3 主线候选 — 派活顺序需 team-lead 拍板 (DM-2 优先 vs CV-2 优先, 影响 v 号链 + AL-4 接力时机)。

## 7. 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-29 | 烈马 (代飞马起草 v0 preview) | Phase 3 readiness preview — 主线 3/9 DONE, 严格闸 0/5 SIGNED, ❌ NOT READY 出退出公告; 三主线 (CHN-1/CV-1/RT-1) 收尾质量盘 + Phase 4 entry 冲突点 (AL-3.2/3.3 串行 + DM-2 vs CV-2 派活顺序) |
