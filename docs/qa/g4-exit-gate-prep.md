# G4 退出闸 prep doc — PM 视角 5 闸 + 50 milestone 闭判据 (野马 v0)

> **状态**: v0 (野马, 2026-04-30) — Phase 4 实施仍在跑 (BPP-7 / CV-4-v2 / DL-1..3 / HB-1/2 / RT-3 / CS-* 待落), PM 先把 G4 退出条件列清楚锁字面.
> **跟既有文档关系**: 跟飞马 `docs/qa/g4-exit-gate.md` (草稿, 125 行) 同模式不重复, 本文 PM 视角补足 — **闸 → 证据需求 → 当前未完项 → 闭判据 → 签字模板** 五段链.
> **关联**: PR #568 Phase 4 stance 反查表 + PR #571 admin god-mode 私密总表 + PR #574 milestone naming map + 飞马 #g4-exit-gate.md 草稿 + G3 closure `g3-exit-gate.md` 模式承袭.

---

## §1 G4 退出 5 闸 + G4.audit (PM 视角)

| 闸 | 主旨 (用户感知 / 工程契约) | 当前状态 | 主依赖 milestone | 跟 G3 同模式 |
|---|---|---|---|---|
| **G4.1** | admin SPA + 用户隐私承诺页 (3 字面 + 8 行表 + 三色锁 byte-identical) | ✅ **SIGNED** (野马 2026-04-29 `g4.1-adm1-yema-signoff.md`) | ADM-1 #455+#459+#483 | 跟 G3.3 #403 同模式 (野马 PM 单签) |
| **G4.2** | god-mode metadata audit + impersonation E2E (5 action audit + 5 system DM byte-identical + impersonation_grants v=23) | ⏳ **READY** (待签) | ADM-2 ✅ #484 | 跟 G3.2 烈马 acceptance signoff 同模式 (内部 milestone, 烈马代签 — 野马 R2: 普通用户无感) |
| **G4.3** | BPP v2 协议 envelope (envelope 14→15 frame) + ack dispatcher + reason 字典锁链 ≥10 处 byte-identical 全链 E2E | ⏳ **READY** | BPP-2 ✅ #485 + BPP-3 ✅ #489 + BPP-3.1/3.2 ✅ + BPP-4 ✅ + BPP-5 ✅ + BPP-6 ✅ #522 + AL-2b ✅ #481 | 跟 G3.1 RT-1 协议链同模式 (烈马 acceptance + 飞马签) |
| **G4.4** | agent ↔ agent 协作走人 path 不裂表 E2E (DM-2 router 复用 + CV-1 lock 复用 + **0 行新 server impl**) + 蓝图 §1.2 "agent=同事" 红线 | ⏳ **READY** | CM-5 ✅ #463+#473+#476 | 跟 G3.4 CHN-4 协作场骨架同模式 (战马 e2e + 烈马 + 野马 5 张截屏) |
| **G4.5** | runtime registry + agent_configs SSOT + plugin protocol release gate 全链 E2E (registry → SSOT blob 整体替换 → BPP push → ack 三态 → AL/HB release-gate yml 双拆独立) | ⏳ **PARTIAL** | AL-4 ✅ + AL-2a ✅ + AL-2b ✅ + AL-2-wrapper ✅ + HB-3 ✅ + HB-4 ✅ (4.1) | 跟 G3.audit 飞马 v1 fill 同模式 (release gate 联签) |
| **G4.audit** (滚动) | Phase 4 跨 milestone 代码债 audit + 7 项 naming-map 整合 (#574 §3) | 🔄 **DRAFT** | 全 Phase 4 milestone | 跟 G3.audit `g3-audit.md` skeleton + flip 同模式 |

**通过判据 (跟 G3 closure 同模式无软留账)**:
- G4.1-G4.5 全 ✅ SIGNED + G4.audit 滚动闭
- 跨 phase 留账锚 (Phase 5+) 全明示 (跟 PR #571 §4 v3+ 留账 4 项 + PR #574 §3 audit 7 项同源)
- Phase 4 closure announcement (跟 G3 closure announcement 飞马职责)

---

## §2 每闸具体证据需求 (锚最近 PR # 已 SIGNED 项)

### G4.1 ✅ SIGNED — 全证据已落
- `g4.1-adm1-yema-signoff.md` (post-#459 e2e merged + #483 commits)
- 双截屏 `g4.1-adm1-{privacy-promise,privacy-table}.png` 入 git (反 PS)
- e2e `adm-1-privacy-promise.spec.ts` 3 cases PASS
- REG-ADM1-001..006 6 🟢

### G4.2 ⏳ READY — 待签证据需求
- [ ] `docs/qa/signoffs/g4.2-adm2-liema-signoff.md` (烈马 acceptance, 野马 R2 内部 milestone 代签)
- [ ] G4.2 双截屏 `g4.2-adm2-{audit-list,impersonate-grant}.png` (REG-ADM2-011 follow-up)
- [ ] REG-ADM2-010 grant 校验 wire (admin SPA audit-log 页 + e2e)
- [ ] start_impersonation audit hook 5/5 闭 (#484 当前 4/5)

### G4.3 ⏳ READY — 待签证据需求
- [ ] BPP frame schema reflect lint (envelope whitelist 14→15 自动覆盖, BPP-1 #304 lint 守)
- [ ] reason 字典 ≥10 处单测锁链 byte-identical CI 守 (AL-1a #249 + AL-3 #305 + CV-4 #380 + AL-2a #454 + AL-1b #458 + AL-4 #387/#461 + BPP-2.2 #485 + AL-2b #481 + BPP-4 + BPP-5 共 10 处)
- [ ] ack dispatcher 三态全链 e2e (applied / rejected / stale 三路径 byte-identical)
- [ ] G4.3 demo 截屏 ≥3 张 (BPP envelope 帧 / ack 三态 / reason 字典命中)
- [ ] 飞马 + 烈马 联签 `g4.3-bpp-protocol-signoff.md`

### G4.4 ⏳ READY — 待签证据需求 (跟 G3.4 同模式)
- [ ] 战马 e2e PASS (`cm-5-x2-collab.spec.ts` 已落 #476)
- [ ] 烈马 acceptance ✅ (REG-CM5-001..005 全 🟢, 已 #476 闭)
- [ ] 野马双 tab 5 张截屏 (X2 conflict toast / hover collab anchor / agent silent default / owner-first transparency / DM-2 router 复用 0 行 server) — 跟 G3.4 野马 5 张 ⏸️ follow-up 同模式
- [ ] 蓝图 §1.2 "agent=同事" 红线反向 grep 0 hit (sender_id 不分 agent/human, 跟 PR #568 §4 同源)

### G4.5 ⏳ PARTIAL — 待签证据需求
- [ ] AL release gate yml ✅ (al-release-gate.yml ≥12 step, AL-2-wrapper 已落)
- [ ] HB release gate yml ✅ (release-gate.yml ≥10 step, HB-4 已落, 4.2 demo 签字 ⏸️ deferred 留账 release 前)
- [ ] AL-1 wrapper state machine validator follow-up (dispatcher wire / presence wire / client UI / e2e ⏸️ deferred 4 项)
- [ ] HB-4.2 野马 demo 签字 3 张截屏 (五支柱状态页 / 情境授权弹窗 / 撤销后行为)
- [ ] AL-2-wrapper 野马 4.2 签字 3 张截屏 (5-state UI / error→online 反向 / busy/idle BPP frame 触发)

### G4.audit 🔄 DRAFT — 滚动 audit row
- [ ] kindBadge helper 5 源补齐 (post-#485 抓出实为 2 源, 缺 DM-2 / CV-4 / CHN-4 渲染面)
- [ ] 链 4 rollback owner-only DOM gate regex 对齐 (`channel\??\.created_by`)
- [ ] PR #574 §3 7 项整合 (AL-6/AL-9 / AP-4 双义 / HB-3 拆段 / HB-5 占号 / CHN-9 占号 / DM-8 占号 / canonical-id 头注规范)
- [ ] PR #571 §4 v3+ 留账 4 项明示 (搜索历史 / 未读计数 / typing / last_seen)

---

## §3 当前未完项 (PROGRESS.md grep ⏳/⏸️/🔄/TODO)

| # | 项 | 类型 | 阻 G4? | 备注 |
|---|---|------|------|------|
| 1 | BPP-7 plugin SDK 真接入 | 实施未起 | ❌ 不阻 | spec #529 占号, 实际接入 v3+ |
| 2 | RT-3 多端全推 + 活物感 ⭐ | 实施未起 | ⚠️ 可能阻 G4.audit | 取代 RT-2, 升 ⭐ |
| 3 | DL-1/2/3 (interface / events / threshold) | 占号未起 | ❌ 不阻 | DL-4 已落, 1/2/3 占号 v3+ |
| 4 | HB-1 install-butler / HB-2 daemon | 占号未起 | ❌ 不阻 | 依赖 DL-4 ✅, 实际 v3+ |
| 5 | CS-1/2/3 client-shape | 占号未起 | ❌ 不阻 | 客户端 shape 三栏 v3+ |
| 6 | ADM-3 来源 C 混合 | 占号未起 | ❌ 不阻 | v3+ admin 实际混合源 |
| 7 | AL-2-wrapper 4.2 demo 签字 ⏸️ | 留账 | ⚠️ G4.5 阻 | 3 张截屏 release 前补 |
| 8 | HB-4.2 demo 签字 ⏸️ | 留账 | ⚠️ G4.5 阻 | 3 张截屏 release 前补 |
| 9 | REG-ADM2-010/011 follow-up ⏸️ | 留账 | ⚠️ G4.2 阻 | grant wire + admin SPA audit-log 页 e2e |
| 10 | G3.audit 飞马 v1 fill ⏸️ | Phase 3 留账 | ❌ 不阻 G4 (Phase 3 收口已 PARTIAL) | #443 skeleton 已落 |
| 11 | G3.4 野马 5 张截屏 ⏸️ | Phase 3 留账 | ❌ 不阻 G4 | follow-up |
| 12 | AL-1 wrapper 4 项 follow-up ⏸️ | 留账 | ⚠️ G4.5 阻 | dispatcher wire / presence wire / client UI / e2e |

**G4 真阻塞项**: 4 项 (G4.5 wrapper 4.2 双签 + G4.2 ADM-2 follow-up + AL-1 wrapper 4 项).

---

## §4 Phase 4 ~50 milestone 全闭判据 (复用 PR #574 naming-map §2)

| Module group | 已闭 ✅ | in-flight 🔄 | 占号未起 ⚪ | G4 阻塞? |
|---|---|---|---|---|
| agent-lifecycle | AL-1 wrapper / AL-1a/1b/1.4 / AL-2-wrapper / AL-2a/2b / AL-3 / AL-4 / AL-5 / AL-7 / AL-8 (11 项) | — | AL-6/AL-9 占号 | ⚠️ AL-6/AL-9 G4.audit 决议 |
| BPP | BPP-1 (Phase 3) / BPP-2 / BPP-3/3.1/3.2 / BPP-4 / BPP-5 / BPP-6 / BPP-8 (8 项) | — | BPP-7 占号 | ❌ 不阻 |
| host-bridge | HB-3/-v2 / HB-4 (3 项, HB-4.2 demo ⏸️) | — | HB-1/HB-2/HB-5 占号 | ⚠️ HB-4.2 G4.5 阻 |
| auth-permissions | AP-1 / AP-2 / AP-3 / AP-4 / AP-5 (5 项) | — | AP-2 UI bundle 占号 | ⚠️ AP-4 双义 G4.audit 决议 |
| canvas-view | CV-2-v2 / CV-3-v2 / CV-5/7/8/9/10/11/12/13 (10 项) | CV-4-v2 spec | — | ❌ 不阻 |
| channel | CHN-3.2 / CHN-7 / CHN-9 (3 项) | — | CHN-9 缺 PROGRESS 占号 | ⚠️ CHN-9 占号 G4.audit |
| direct-message | DM-4 / DM-5 / DM-6 / DM-7 (4 项) | — | DM-8 bookmark 占号 | ❌ 不阻 |
| realtime | — | RT-3 ⭐ | RT-3 实施未起 | ⚠️ G4.audit 评估 |
| data-layer | DL-4 (1 项) | — | DL-1/2/3 占号 | ❌ 不阻 |
| admin-model | ADM-1 / ADM-2 (2 项) | — | ADM-3 占号 | ⚠️ ADM-2 follow-up G4.2 |
| concept-model | CM-5 (1 项) | — | — | ❌ 不阻 |
| client-shape | — | — | CS-1/2/3 占号 | ❌ 不阻 |

**Phase 4 总计**: ~48 项已闭 + 1 in-flight (CV-4-v2) + ~12 占号未起 v3+. **G4 真阻塞**: 5 类 audit 决议 (AL-6/AL-9 + AP-4 + CHN-9 + HB-4.2 demo + ADM-2 follow-up + AL-1 wrapper 4 项).

---

## §5 G4 真签字签字模板 (跟 G3 同模式预占)

```
建军 (founder):       ⏸️ 待联签 (Phase 4 closure announcement 时)
野马 (PM):            ✅ G4.1 SIGNED (2026-04-29) + ⏸️ G4.4 5 张截屏 follow-up
飞马 (architect):     ⏸️ G4.3 BPP 协议 + G4.5 release gate + G4.audit fill
烈马 (acceptance):    ⏸️ G4.2 ADM-2 + G4.4 CM-5 + G4.5 联签
战马 (impl):          ⏸️ G4.3 e2e + G4.4 e2e + G4.5 wrapper 4.2 demo
```

**Phase 4 closure announcement** (跟 phase-2-exit-announcement.md / phase-3 退出闸 同模式) 飞马职责, G4.x 5 闸全 SIGNED + G4.audit 滚动闭后链入.

---

## §6 更新日志

| 日期 | 作者 | 变化 |
|------|------|------|
| 2026-04-30 | 野马 | v0 — Phase 4 G4 退出闸 PM 视角 5 段链 (5 闸 + audit / 证据需求 / 未完 12 项 / 50 milestone 全闭判据 / 签字模板). 跟飞马 `g4-exit-gate.md` 草稿 byte-identical 不重复, PM 视角补足. 跟 PR #568 stance + #571 admin private + #574 naming-map 三件套 Phase 4 PM 反查全景四角同源. **G4 真阻塞**: AL-6/AL-9 + AP-4 + CHN-9 + HB-4.2 demo + ADM-2 follow-up + AL-1 wrapper 4 项 共 5 类 audit 决议. |
