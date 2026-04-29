# G3 Audit — Phase 3 退出闸 (audit 集成) [DRAFT — 战马 prep, 飞马 fill]

> 作者: 战马A (skeleton 战马代锁) + 飞马 (TBD fill 内容) · 2026-04-29 · team-lead Phase 3 退出 gate 收尾派活
> 目的: G1 / G2 audit 同款单源, Phase 3 全 milestone (RT-1 / CHN-1 / AL-3 / BPP-1 / CV-1 / CV-2 / CV-3 / CV-4 / DM-2 / CHN-2 / CHN-3 / CHN-4) 落地后, 闸 + audit row 一次集成审完.
> 形式: 此文件 = audit 报告 (战马 skeleton, 飞马填实); 签字单独走 `docs/qa/signoffs/g3-exit-gate.md` (待落); evidence 走 `docs/evidence/g3-exit/README.md` (#442).
> 状态: 🟡 **DRAFT v0** — 战马 skeleton 锁格式骨架 + 留账 6 项候选, 飞马 fill v1 闸闭合详情 + audit row 具体内容 + 签字承认.
> 关联: `docs/qa/phase-3-readiness-review.md` (烈马 v2 patch #390) / `docs/qa/signoffs/g3.3-cv1-yema-signoff.md` (野马 G3.3 ✅ #403) / `docs/evidence/g3-exit/README.md` (战马 G3 evidence bundle #442).

---

## 1. 闸概览

来源: G3 退出闸 4 项 + audit row (跟 G0/G1/G2 audit 同结构).

| 闸 | 主旨 | Trigger PR | Status (本文 cut: 2026-04-29) |
|---|---|---|---|
| G3.1 | artifact 创建 + RT-1 推送 E2E (真 WS push 非轮询) | #290+#292+#296 RT-1 + #342+#346+#348 CV-1 | ✅ READY — `cv-1-3-canvas.spec.ts §3.3` ≤3s 真 WS push (phase-3-readiness-review.md:14 ✅ SIGNED) |
| G3.2 | 锚点对话 E2E | #359 + #360 + #404 + #421 | ✅ READY — `cv-2-3-anchor-client.spec.ts` 4 cases PASS + 4 文案锁 byte-identical (#355 ①②③④) + 烈马 acceptance signoff doc 待补 (TBD) |
| G3.3 ⭐ | 用户感知签字 (CV-1) | #346/#347/#348 + #403 yema signoff | ✅ **SIGNED** (#403 野马 PM, 5/5 验收, 2026-04-29) |
| G3.4 | 协作场骨架 (CHN-4) E2E + 双 tab 截屏 | #411 + #423 + #428 + 依赖链 (CHN-1/2/3 + CV-1/2/3/4 + DM-2 全闭) | ✅ READY — 战马 e2e PASS + 烈马 acceptance ✅ (#428) + 野马 5 张 ⏸️ 截屏 follow-up TBD |
| G3.audit | Phase 3 跨 milestone audit row (留账 6 项, 跟 G1/G2 audit 同模式) | 本文 §3 (战马 skeleton, 飞马 fill) | 🟡 DRAFT — skeleton 锁 6 项候选, 飞马 fill v1 |

通过判据 (引 G2 模式): G3.1 ✅ + G3.2 ✅ + G3.3 ✅ SIGNED + G3.4 ✅ (含截屏 5 张 follow-up) + G3.audit 6 项齐 → 飞马 G3 closure announcement.

---

## 2. 闸闭合情况 (战马 skeleton, 飞马 fill v1 详情)

> ⚠️ 战马 skeleton — 以下 4 段 evidence 路径锁字面已锁, 飞马 v1 fill 闸闭合摘要 + REG-* 行号 + 跨 milestone byte-identical 链承认.

### 2.1 G3.1 — artifact 创建 + RT-1 推送 E2E ✅

**Evidence path** (G3 evidence bundle #442 §1 同源):
- 实施: RT-1.1 #290 (server cursor envelope 7 字段) + RT-1.2 #292 (client backfill ≤3s + 离线 30s × 5 + 2-tab dedup) + RT-1.3 #296 (BPP session.resume 三 hint) + CV-1.2 #342 (server commit/rollback owner-only) + CV-1.3 #346 (client SPA WS push refresh) + CV-1.3 e2e #348 (真 4901+5174 ≤3s)
- Tests: `cv-1-3-canvas.spec.ts::§3.3 WS push refresh ≤3s + conflict toast 文案锁` PASS
- REG-CV1-001..017 全 🟢 + REG-RT1-001..010 全 🟢

**飞马 v1 fill** TBD: 闸闭合摘要 + 跨 milestone byte-identical 链承认 (frame 7 字段 byte-identical 跟 RT-1.1 同源).

### 2.2 G3.2 — 锚点对话 E2E ✅

**Evidence path** (G3 evidence bundle §2 同源):
- 实施: CV-2.1 #359 (schema v=14 双表) + CV-2.2 #360 (server REST + WS push 10 字段 byte-identical) + CV-2.3 #404 (client SPA — 选区→锚点 entry + thread side panel + WS push 接入) + REG-CV2 #421
- Tests: `cv-2-3-anchor-client.spec.ts` 4 cases PASS + 4 文案锁 byte-identical (#355 文案锁 ① ② ③ ④ 同源)
- AnchorCommentAddedFrame 10 字段 byte-identical (`{type, cursor, anchor_id, comment_id, artifact_id, artifact_version_id, channel_id, author_id, author_kind, created_at}`) — author_kind 命名拆 commit 之 committer_kind
- REG-CV2-001..005 全 🟢

**飞马 v1 fill** TBD: 烈马 acceptance signoff doc + 闸闭合摘要 + 跨 milestone byte-identical 链承认.

### 2.3 G3.3 ⭐ — 用户感知签字 (CV-1) ✅ SIGNED

**已 SIGNED** (#403 野马 PM, 2026-04-29, signoff doc `docs/qa/signoffs/g3.3-cv1-yema-signoff.md`):
- 5/5 验收通过 (artifact 归属 channel / 单文档锁 30s + 409 conflict / 版本线性 + rollback DOM gate / kindBadge 二元 / ArtifactUpdated frame 7 字段)
- 关键截屏 3 张路径承认 (跟 #391 §0 byte-identical 同源, follow-up Playwright `page.screenshot()` 入 git)
- 跨 milestone byte-identical 链锁字面源头 (kindBadge 五处单测锁源头 / CONFLICT_TOAST / fanout / rollback gate / 5-frame envelope 共序)

**飞马 v1 fill** TBD: G3.3 SIGNED 状态承认 + 链入 G3 closure announcement.

### 2.4 G3.4 — 协作场骨架 (CHN-4) E2E + 双 tab 截屏 ✅ READY

**Evidence path** (G3 evidence bundle §4 同源):
- 实施: CHN-4 #411 (client + 双 tab + G3.4 双截屏) + CHN-4 #423 (follow-up 反约束兜底 + 跨 org + 2 边界态截屏) + CHN-4 #428 closure (acceptance + REG + PROGRESS)
- 依赖链全闭: CHN-1 ✅ + CHN-2 ✅ (#406/#407/#413) + CHN-3 ✅ (#410/#412/#415/#422/#425) + CV-1 ✅ + CV-2 ✅ + CV-3 ✅ (#396/#400/#408/#424/#425) + CV-4 ✅ (#405/#409/#416) + DM-2 ✅ (#361/#372/#388)
- 三签依据: 战马 e2e PASS + 烈马 acceptance 全 ✅ (#428) + 野马 双 tab 截屏文案锁验 (3 张已 landed: g3.4-cv3-markdown / g3.4-cv4-iterate-pending / g3.4-cv4-iterate-error-baseline; 5 张 ⏸️ 待 follow-up `page.screenshot()` 入 git)

**飞马 v1 fill** TBD: 闸闭合摘要 + 跨 milestone byte-identical 链 (CV-1 → kindBadge 五处 / CONFLICT_TOAST / fanout / rollback gate / 5-frame envelope 共序) 承认.

---

## 3. G3.audit row — 6 项跨 milestone 留账 (战马 skeleton, 飞马 fill)

> 跟 G1.audit / G2.audit 同模式 — 跨 milestone 实施时发现的代码债 / 留账, 一行一项, 飞马 fill 触发条件 + 处理 Phase + 验收锚.

| audit 项 | 来源 PR / milestone | 触发条件 | 处理 Phase | 飞马 fill v1 |
|---------|---------------------|---------|-----------|--------------|
| **A1** CHN-3 作者删 group 路径 lazy 90d GC cron — `user_channel_layout` 表无 ON DELETE CASCADE, 作者删 group 不阻塞但留 layout 行孤儿 | #410 + #412 (CHN-3.1+3.2) | 作者删 group + 90 天后 cron 跑 lazy GC | Phase 4+ cron job | TBD: 飞马 fill 触发条件 SQL + cron 频率 + 验收锚 |
| **A2** AL-4 hermes plugin 占号 (v1 仅 openclaw) — `process_kind` enum 'hermes' 占号但 v1 不实施, v2+ 加 | #398 (AL-4.1) | v2+ 启用 hermes runtime 时 | Phase 5+ | TBD: 飞马 fill v2 启用条件 + migration 路径 + 兼容性 |
| **A3** CV-4 iterate retry 路径 (failed 不复用 iteration_id) — failed 态 owner 重新触发 = 新 iteration_id, 不复用 failed 行 (#380 ⑦) | #405 + #409 (CV-4.1+4.2) | 永不实施 (反约束 #380 ⑦ + #365 反约束 ②) | 永不实施 (反约束) | TBD: 飞马 fill 反约束承认 + 不实施理由 |
| **A4** AL-3.3 ADM-2 god-mode 元数据 (REG-AL3-011 ⚪) | #324/#327 (AL-3.3) | ADM-2 milestone 落地后 | Phase 4+ ADM-2 milestone | TBD: 飞马 fill ADM-2 接入条件 + 验收锚 |
| **A5** CHN-1 AP-1 严格 403 (REG-CHN1-007 ⏸️) | #286 (CHN-1.2) | AP-1 落时 flip 改断 status==403 | Phase 4 AP-1 milestone | TBD: 飞马 fill AP-1 落地条件 + flip 路径 |
| **A6** 第 6 轮 remote-agent 安全 (蓝图 §4) | AL-4 spec | 二进制下载 / 沙箱 / 资源限制 / uninstall 留第 6 轮 | Phase 6+ | TBD: 飞马 fill 第 6 轮 milestone scope + 优先级 |

**入册位置**: 同 G1/G2 audit 一样, 此 audit 行**不**进 `docs/qa/regression-registry.md` (那个是回归 active 红线, audit 是 v0 代码债清单, 二者拆死). 后续 milestone 引用此文件即可.

---

## 4. 通过判据 (跟 G2 audit 同款)

G3 退出闸全过 = (G3.1 ✅) + (G3.2 ✅ + 烈马 acceptance signoff doc) + (G3.3 ✅ SIGNED) + (G3.4 ✅ + 野马 5 张 ⏸️ 截屏 follow-up) + (G3.audit 6 项 fill 完毕).

→ 飞马 G3 closure announcement (跟 G1 / G2 closure 同模式), 然后 Phase 4 启动.

---

## 5. 更新日志

| 日期 | 作者 | 变化 |
|------|------|------|
| 2026-04-29 | 战马A | v0 — G3 audit skeleton 战马代锁格式骨架 + 留账 6 项候选 (跟 G1/G2 audit 同模式 byte-identical 结构). 4 闸 evidence path 全锚 (#290-#296 / #342-#348 / #359-#404+#421 / #403 / #411-#428 + 依赖链), §3 audit row 6 项 (CHN-3 GC / AL-4 hermes / CV-4 retry 永不实施 / AL-3.3 ADM-2 / CHN-1 AP-1 / 第 6 轮安全). 飞马 v1 fill 闸闭合详情 + audit row 具体触发条件 + 签字承认. 跟 #442 G3 evidence bundle 双轨 (evidence 给签字依据 + audit 给代码债清单). |
