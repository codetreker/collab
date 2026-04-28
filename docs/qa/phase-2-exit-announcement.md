# Phase 2 退出公告 — 条件性全过

> 烈马 · 2026-04-28 · 草稿 v1
> 受众: dev / QA / 内部 review (业主感知公告走野马 `announcements/phase-2-exit-summary.md` 那条, 不重复)
> 配套: 飞马 readiness review **PR #267** (`phase-2-readiness-review.md`, 6 ✅ + 2 留账 ✅ READY 判定)
> 配套: 烈马 QA 联签 `signoffs/g2-exit-gate-liema-signoff.md` + 野马 PM 立场签 `signoffs/phase-2-yema-stance-signoff.md`
> 状态锚: `phase-2-gate-status.md` v3 (#251) 看板实时 + `phase-2-closing-checklist.md` (#257)

## 1. 总判定: ✅ **条件性全过** (飞马 PR #267 拍板)

5+1 严格闸 SIGNED + 3 条件性闸按 #248 condition signoff 接受 + 2 留账闸全部挂 Phase 4 PR 编号 → 4 角色联签后 team-lead 宣布 Phase 2 关闭。

## 2. SIGNED — 5+1 严格闸 ✅

| 闸 | 闭合 PR | 证据 / Reg | 签字 |
|---|---|---|---|
| **G2.0** ADM-0 cookie 串扰反向断言 | #197 + #201 + **#223** | REG-ADM0-001..010 + AUD-G2-ADM01/02/03 | 烈马 ✅ |
| **G2.3** 节流不变量 T1-T5 单测 | #221 + **#236** | AUD-G2-G23 (二维 key + clock 注入 + 边界 `>=`) | 烈马 ✅ |
| **G2.6** /ws ↔ BPP schema 注释锁 | **#237** godoc | REG-RT0-003 grep `BPP-1.*byte-identical` count≥1 | 飞马 ✅ |
| **G2.audit** Phase 2 codedebt audit v2 | #212 + #231 + **#244** + **#251** | 11 行 audit + AUD-G2-AL1A (#252) | 飞马/烈马 ✅ |
| **AL-1a** runtime 三态 + reason codes | **#249** + #250 速读卡 + #252 REG | REG-AL1A-001..005 | 烈马 ✅ |

## 3. 条件性闸 — 3 项 (按 #248 condition signoff)

| 闸 | 当前 | 闭合路径 | 留账引 |
|---|---|---|---|
| **G2.1** 邀请审批 E2E | 🟡 server ✅ / e2e `.skip` | **#237 + #239** 战马B 解 `.skip` (rate-limit bypass) | `acceptance-templates/cm-onboarding.md` REG-CMO-006/007 |
| **G2.2** 离线 fallback E2E | 🟡 partial | **#237 + #239** RT-0 client e2e + presence stub | `acceptance-templates/rt-0.md` REG-RT0-007 (60s fallback) |
| **G2.4** 用户感知签字 ⭐ | 🟡 5/6 (#275) | 野马补签 #2 (AL-1b 后) + #3/#4 (e2e 后) + #6 (ADM-1 后) | `acceptance-templates/al-1b.md` + `acceptance-templates/adm-1.md` + `g2.4-demo-signoff.md` |

## 4. 留账闸 — 2 项 (Phase 4 PR 编号锁, 规则 6)

| 闸 | 留账 PR 路径 | 锚 acceptance-templates |
|---|---|---|
| **G2.5** presence 接口契约 | `internal/presence/contract.go` AL-3 同期 PR **#277** (战马A AL-3 占号) | `acceptance-templates/al-2a.md` (config SSOT, AL-3 前置) + AL-3 留账行 |
| **G2.6** /ws ↔ BPP schema CI lint | `bpp/frame_schemas.go` CI lint **#274** (飞马 BPP-1 占号) | `acceptance-templates/al-2a.md` (BPP frame 不在 AL-2a 反向断言) + BPP-1 PR |

> ⚠️ Phase 3 RT-1 ArtifactUpdated frame 必须套 #237 envelope 直到 BPP-1 CI lint 落 (飞马 #267 §5 强约束)。

## 5. Phase 4 acceptance template 索引 (本周新增 + 链)

`docs/qa/acceptance-templates/`:
- **AL-2a** (config SSOT 表 + update API) — **PR #264** (本周新增, 7 验收)
- **ADM-2** (分层透明 audit) — **PR #266** (本周新增, 7 验收)
- **AL-1b** (busy/idle, BPP 同期) — 留 Phase 4
- **ADM-1** (隐私承诺页实施) — 留 Phase 4 (文案 3 条已锁)

## 6. 后续动作 (3 天路线)

1. 战马B 解 `cm-4-realtime.spec.ts` `.skip` (#239) → G2.1/G2.2 真闭
2. 战马A `internal/presence/contract.go` 路径锁 PR (AL-3 同期) → G2.5 留账行确认
3. 烈马 G2.audit v3 补 (presence / 节流 / CHECK enforcement) → DRAFT → SIGNED
4. 野马 G2.4 demo #2/#3/#4/#6 补签 → 5/6
5. 飞马 G2.6 CI lint PR (BPP-1 同 PR) → Phase 4 准备齐全

## 7. 4 角色联签位

> 全部 PARTIAL 项满足 #248 condition + 留账闸挂 Phase 4 PR 编号后, 4 角色逐一签:

- [x] 飞马 (architecture / 闸 1+2): ✅ 拍板 — 引 PR #267 readiness review §4 (5+1 严格闸 SIGNED + 条件性 3 闸 #248 condition + 留账 2 闸挂 Phase 4 PR 编号: AL-3 / BPP-1 / ADM-1) + §5 Phase 3 entry 唯一冲突点 (RT-1 envelope 套 #237, 已 PR #269 spec 守门) (date: 2026-04-28)
- [ ] 战马A (实施 / 闸 3): _________________ (date: ____)
- [ ] 野马 (PM / 闸 4 G2.4): _________________ (date: ____)
- [ ] 烈马 (QA / 闸 4 acceptance): _________________ (date: ____)

> team-lead (建军) 在 4 联签齐后宣布 Phase 2 关闭, 同步触发 `announcements/phase-2-exit-summary.md` 业主公告发布。

## 8. 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-28 | 烈马 | v0 草稿 — 4 SIGNED + 3 PARTIAL + 2 DEFERRED |
| 2026-04-28 | 烈马 | v1 — 顶部加飞马 #267 readiness review 引用; title 锁 "条件性全过"; SIGNED 升 5+1 (加 AL-1a #249); 留账行链 al-2a.md / adm-2.md / al-1b.md / adm-1.md |
| 2026-04-28 | 烈马 | v2 — 锁 deferred PR #: G2.5→#277 (战马A AL-3 占号), G2.6→#274 (飞马 BPP-1 占号), G2.4 PARTIAL 升 5/6 引 #275 (野马 G2.4 #5) |
| 2026-04-28 | 飞马 | §7 飞马联签 ✅ — 引 #267 readiness §4/§5 + #269 RT-1 envelope 守门 |
