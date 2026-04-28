# Phase 2 退出 Gate 公告 (QA 草稿)

> 烈马 · 2026-04-28 · 草稿 v0
> 受众: dev / QA / 内部 review (内部公告, 业主感知公告走野马 `announcements/phase-2-exit-summary.md` 那条)
> 配套: 飞马 `phase-2-exit-gate-decision.md` (判定) + 烈马 `signoffs/g2-exit-gate-liema-signoff.md` (QA 联签) + 野马 `signoffs/phase-2-yema-stance-signoff.md` (PM 立场签)
> 状态锚: `phase-2-gate-status.md` v3 (#251) 看板实时

## 1. SIGNED — 4 闸严格关闭

| 闸 | 性质 | 闭合 PR | 证据/Reg | 签字 |
|---|---|---|---|---|
| **G2.0** ADM-0 cookie 串扰反向断言 | 严格 | #197 + #201 + #223 | REG-ADM0-001..010 + AUD-G2-ADM01/02/03 | 烈马 ✅ |
| **G2.3** 节流不变量 T1-T5 单测 | 严格 | #221 + #236 | AUD-G2-G23 (二维 key + clock 注入 + 边界 `>=`) | 烈马 ✅ |
| **G2.6** /ws ↔ BPP schema 注释锁 | 严格 (注释锁部分) | #237 godoc | REG-RT0-003 grep `BPP-1.*byte-identical` count≥1 | 飞马 ✅ |
| **G2.audit** Phase 2 codedebt audit v2 | 严格 | #212 + #231 + #244 | 11 行 audit (ADM01/02/03-a/b + RT0-a/b/c + CM-onboard + AP0-bis + CM3 + G23 + CHECK) | 飞马/烈马 ✅ |

## 2. PARTIAL — 3 闸条件性接受 (按 #248 condition signoff)

| 闸 | 性质 | 当前 | 留账依据 | 闭合路径 |
|---|---|---|---|---|
| **G2.1** 邀请审批 E2E | 条件性 | 🟡 server ✅ / e2e `.skip` | `acceptance-templates/cm-onboarding.md` REG-CMO-006/007 | 战马B #239 解 `.skip` (rate-limit bypass) → e2e 真闭 |
| **G2.2** 离线 fallback E2E | 条件性 | 🟡 partial | `acceptance-templates/rt-0.md` REG-RT0-007 (60s fallback) | RT-0 client e2e + presence stub 落地 |
| **G2.4** 用户感知签字 ⭐ | 条件性 (野马 ≥4/5) | 🟡 4/6 | `g2.4-demo-signoff.md` (#1/#5 ✅; #2 等 AL-1b; #3/#4 等 e2e; #6 等 ADM-1) | AL-1b busy/idle + e2e 解锁后 → 野马补签 5/6 |

## 3. DEFERRED — 2 闸明文留 Phase 4

| 闸 | 性质 | 留账类 | 闭合 PR 编号 |
|---|---|---|---|
| **G2.5** presence 接口契约 | 留账 | Phase 4 | `internal/presence/contract.go` 路径锁 PR (飞马 + 战马, AL-3 同期) |
| **G2.6** /ws ↔ BPP schema CI lint | 留账 | Phase 4 | `bpp/frame_schemas.go` CI lint (飞马, BPP-1 PR 内含) |

> 红线: 留账闸 ✅ 必须挂 Phase 4 PR 编号, 不接受口头 "等以后" (规则 6)。

## 4. 后续动作 (3 天路线, 锁 #227 + #248)

1. 战马B 解 `cm-4-realtime.spec.ts` `.skip` → G2.1 e2e + G2.2 真闭
2. 战马A `internal/presence/contract.go` 路径锁 PR → G2.5 留账行确认
3. 烈马 G2.audit v3 补 (presence / 节流 / CHECK enforcement) → DRAFT → SIGNED
4. 野马 G2.4 demo #2 (AL-1b 后) + #3/#4 (e2e 后) + #6 (ADM-1 后) → 5/6
5. 飞马 G2.6 CI lint PR (BPP-1 同 PR) → Phase 4 准备齐全

## 5. Acceptance template 索引 (Phase 2 完整集)

`docs/qa/acceptance-templates/`:
- ADM-0 (admin 拆表, ADM-0.1/0.2/0.3) ✅
- AP-0-bis (默认权限回填) ✅
- INFRA-2 (Playwright scaffold) ✅
- RT-0 (server push 邀请) 🟡
- CM-onboarding (welcome channel) 🟡
- AL-2a (config SSOT 表 + update API) — PR #264 (本周新增)
- ADM-2 (分层透明 audit) — PR #266 (本周新增)
- AL-1b / ADM-1 (业主感知 / 隐私承诺) 落到 Phase 4 同期

## 6. 签字位 (Phase 2 退出 4 角色联签)

> 全部 PARTIAL 项满足 #248 condition + 留账闸挂上 Phase 4 PR 编号后, 4 角色逐一签:

- [ ] 飞马 (architecture / 闸 1+2): _________________ (date: ____)
- [ ] 战马A (实施 / 闸 3): _________________ (date: ____)
- [ ] 野马 (PM / 闸 4 G2.4): _________________ (date: ____)
- [ ] 烈马 (QA / 闸 4 acceptance): _________________ (date: ____)

> team-lead (建军) 在 4 联签齐后宣布 Phase 2 关闭, 同步触发 `announcements/phase-2-exit-summary.md` 业主公告发布。

## 7. 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-28 | 烈马 | v0 草稿 — 4 SIGNED + 3 PARTIAL (条件性 #248) + 2 DEFERRED (Phase 4 PR 编号锁), 4 角色签字位预留 |
