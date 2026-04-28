# Phase 3 Readiness Review — 飞马

> 飞马 · 2026-04-29 · Phase 3 主线主体收尾后架构师 review (单一汇总, 同模板 #267 Phase 2)
>
> 源整合: `docs/implementation/00-foundation/execution-plan.md` Phase 3 闸 · `acceptance-templates/cv-1.md` ·
> `acceptance-templates/chn-1.md` · `acceptance-templates/rt-1.md` · `regression-registry.md` (135/108/27)
>
> 作用: 给 Phase 3 收尾联签前提供独立 ✅/⚠️ 判定; 标清 "已闭主体" vs "Phase 3 章程未完 milestone".

## 1. Phase 3 5 闸 SIGNED 状态汇总

| 闸 | 状态 | 性质 | 闭合 PR | 锚点 | 备注 |
|---|---|---|---|---|---|
| **G3.1** artifact 创建 + 推送 E2E (RT-1 推送非轮询) | ✅ SIGNED | 严格 | RT-1 #290+#292+#296 + CV-1.2 #342 + CV-1.3 #346/#348 | 0ef0cb1 (#348 e2e ≤3s) | `cv-1-3-canvas.spec.ts §3.3` 真 WS push owner DOM ≤3s budget ✅ |
| **G3.2** 锚点对话 E2E | ❌ DEFERRED → Phase 4 | 严格 (章程) | — | — | **CV-2 milestone 未启动**; 阻塞 G3.4 CHN-4 协作场骨架 |
| **G3.3** 用户感知签字 (CV-1 ⭐) | ⚠️ PARTIAL | 严格 (野马) | CV-1 三段闭 | 截屏待野马 | impl/acceptance 全闭 (#347 待 merge), 野马 demo 3 截屏 (列表/新版/v1↔v2) 未补 |
| **G3.4** 协作场骨架 (CHN-4) E2E + 双 tab 截屏 | ❌ DEFERRED → Phase 4 | 严格 | — | — | **CHN-4 milestone 未启动**; 依赖 CHN-2/3 + CV-1 + CV-2 |
| **G3.audit** v0 代码债 audit (artifacts/versions/RT-1 frame) | ✅ SIGNED | 严格 | #340/#344/#347 + #345 audit | 81acc1f (#345) | REG-CV1-001..017 全入册 + AL-3 audit drift 修正 + RT-1 frame BPP-1 lint 闸 #304 |

(以上 5 闸是 execution-plan.md Phase 3 章程闸, 跟 G2.* 同性质标)

## 2. Phase 3 主体已闭 milestone (4/9)

| Milestone | 状态 | PR 锚 | 验收模板 | REG-* |
|---|---|---|---|---|
| **CHN-1** workspace ↔ channel | ✅ 全闭 | #276 v=11 / #286 server / #288 client | chn-1.md ✅ | REG-CHN1-001..010 (10 行) |
| **RT-1** ArtifactUpdated frame | ✅ 全闭 | #290 RT-1.1 / #292 RT-1.2 backfill / #296 RT-1.3 resume | rt-1.md ✅ | REG-RT1-001..010 (10 行) |
| **AL-3** presence (Phase 3 提前) | ✅ 全闭 | #310/#317/#324/#327/#336 + #345 audit | al-3.md ✅ | REG-AL3-001..011 (15 行, 12🟢+3⚪) |
| **CV-1** ⭐ artifact + 版本 (3 段 + e2e) | ✅ 主体闭 | #334 CV-1.1 / #342 CV-1.2 / #346 CV-1.3 / #348 e2e | cv-1.md ⚪→✅ pending #347 | REG-CV1-001..017 (17 行) |

## 3. Phase 3 章程未完 milestone (5/9 → Phase 4)

| Milestone | 现状 | Phase 3 章程依赖 | 处置建议 |
|---|---|---|---|
| **CV-2** 锚点对话 | 未启动 | G3.2 强依赖 | Phase 4 第一波 (野马 ⭐ 签字 milestone, CV-1 后顺位) |
| **CV-3** D-lite 画布渲染 | 未启动 | demo 价值 | Phase 4 (CV-2 后) |
| **CHN-2** DM 概念独立 | 未启动 | DM-2 上游 | Phase 4 (DM-2 战马B 进行中, v=14 schema 卡) |
| **CHN-3** 个人分组 reorder + pin | 未启动 | UX 路径 | Phase 4 (并行 CV-2/3) |
| **CV-4** artifact iterate 完整流 | 未启动 | CV-1+RT-1+CV-2+CM-4 已闭 3/4 | Phase 4 (CV-2 后) |
| **CHN-4** 协作场骨架 demo | 未启动 | G3.4 强依赖 (CHN-1~3 + CV-1) | Phase 4 收尾 (依赖链上述全闭后) |

## 4. PR 锚点速查 (Phase 3 主体)

- **CHN-1**: 21f6e9a (#276 schema v=11) → 5e16b2c (#286 server) → 8a4d0c1 (#288 client)
- **RT-1**: 4e0c2b6 (#290 cursor envelope) → c2bb31d (#292 backfill) → c6754c1 (#296 resume — 同 commit feat block)
- **AL-3**: 7e2cf38 (#310) → presence-tracker (#317) → 9d2f01b (#324 client throttle) + #327 + #336 + 81acc1f (#345 audit)
- **CV-1.1**: cd7e12a (#334) + 22203ea follow-up (3 nullable 列 + PKMonotonic)
- **CV-1.2**: b2ed5c0 (#342 server API + WS push, 11 CV12_* test PASS)
- **CV-1.3**: 623c1bb (#346 client SPA, 76 vitest PASS) → 0ef0cb1 (#348 e2e, 2 PASS)
- **CV-1 docs**: 2449e22 (#340) / e02fcf6 (#341 frame align) / 7d0dcef (#344) / 81acc1f (#345 audit) / #347 in-flight a0dffa7

## 5. 是否 ready 出 Phase 3 退出公告

**⚠️ NOT READY — 主体收尾达 ✅, 但 Phase 3 章程闸 G3.2 + G3.4 + G3.3 野马签字未达**

理由: ① G3.1 / G3.audit 严格 ✅ ② G3.3 ⭐ CV-1 impl/acceptance 全闭, **野马 demo 3 截屏未补** (用户感知签字硬约束) ③ G3.2 锚点对话依赖 CV-2, CV-2 未启动 ④ G3.4 CHN-4 协作场骨架依赖 CHN-2/3 + CV-2, 全部未启动 ⑤ Phase 3 章程 9 milestone 仅 4 闭, 5 待启动 → "条件性全过" 都不够格.

**两条路径**:
1. **严守章程** (推荐): 先启 CV-2 (锚点) + CHN-2/3 (DM/分组) → CV-3/4 → CHN-4, 全闭后再公告退出. 估 4-6 周延续.
2. **章程裁减**: 跟建军/野马商定 Phase 3 v0 收窄到 "Canvas Vision 主线 (CV-1)" 单 milestone, 把 CV-2/3/4 + CHN-2/3/4 整体平移 Phase 4. **必须有书面裁减决议** (非飞马单方拍).

⚠️ **Pre-flip 必检 (任一路径)**:
1. **#347 CV-1 acceptance flip** admin merge (a0dffa7 fix 验过, baseline 干净)
2. **野马 G3.3 demo 3 截屏** (artifact 列表 / 添加新版本 / v1↔v2 切换) 入 `docs/qa/signoffs/`
3. **e2e flip follow-up** (REG-CV1-017 ⏸️ → 🟢 active, 烈马接) — 不阻塞但建议同 PR 闭

## 6. Phase 4 entry 前置依赖 (跨 phase 留账)

| Phase 3 留账 | Phase 4 接力 | 状态 |
|---|---|---|
| CV-2 锚点对话 | Phase 4 第一波 (野马 ⭐) | DEFERRED |
| CHN-2 DM 独立 | DM-2 战马B 进行中 (v=14 schema 卡) | IN-FLIGHT |
| CHN-3 个人分组 | UX path | DEFERRED |
| CV-3/4 D-lite + iterate | CV-2 后顺位 | DEFERRED |
| CHN-4 协作场骨架 demo | CHN-2/3 + CV-2 后 | DEFERRED |
| AL-4 agent runtime metrics | Phase 4 (10 行 ⚪ pending in registry) | DEFERRED |
| ADM-1 admin UI (G2.4 #6 留) | Phase 4 (战马B Phase 4 已开 ADM-1 acceptance template #262) | IN-FLIGHT |
| BPP-1 envelope CI lint (G2.6 留) | Phase 3 已落 ✅ #304 | CLOSED |

## 7. 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-29 | 飞马 | v0 — Phase 3 readiness review (5 节, ⚠️ NOT READY 章程未达 — G3.2/3.3/3.4 + 5 milestone 未启动; 双路径建议) |
