# Phase 2 退出 Gate — QA 联签 (烈马)

> 签字: 烈马 (QA) · 2026-04-28
> Trigger: PR #244 stacked merged → Phase 2 退出 gate 联签 (team-lead 派)
> 同模板: `g1-exit-gate.md` (5 milestone 表 + 整体一句话 + 留账 + 验收挂钩)
> 配套联签: 野马 PM 立场 #233 (`phase-2-yema-stance-signoff.md`) + team-lead admin 公告 (待发)

---

## 1. 八闸状态总览

| 闸 | 主旨 | 证据 PR | Reg / Audit ID | Status |
|---|---|---|---|---|
| **G2.0** | CM-4 agent_invitations schema + state machine + handler | #185 + #198 | REG-CM4-001..006 + AUD-G2-CM4 | ✅ |
| **G2.1** | RT-0 server push (typed Push, no-op invariants, schema lock) | #237 | REG-RT0-001..005 + AUD-G2-RT0-a/b | ✅ server / 🟡 e2e (战马B #239 .skip 解锁 in-flight) |
| **G2.2** | INFRA-2 Playwright scaffold + smoke | #195 | (REG-INFRA2-001..003) | ✅ |
| **G2.3** | dev-only 节流 (T1-T5 5 测) — internal/throttle | #236 | AUD-G2-G23 (T1-T5) | ✅ |
| **G2.4** | 闸 4 demo 5 张截屏 (业主感知) | #213 (1+5) + 野马 partial 4/6 | g2.4-demo-signoff.md (野马 partial) | 🟡 partial 4/6 (#3+#4 等 RT-0 e2e, #6 等 ADM-1) |
| **G2.5** | bug-029 / bug-030 修 + sanitizer | #196 + #198 + #226 | REG-INV-002 + REG-INV-003 (#226 evidence in #244) | ✅ |
| **G2.6** | BPP byte-identical 注释锁 (Phase 4 cutover 前置) | #237 (event_schemas.go godoc) | grep "byte-identical" ≥ 1 (REG-RT0-003) | 🟡 注释锁就位 / CI lint Phase 4 BPP-1 |
| **G2.audit** | Phase 2 跨 milestone codedebt audit (DRAFT v2) | #244 | AUD-G2-ADM01/02/03-a/03-b + RT0-a/b/c + CM-onboard + AP0-bis + CM3 + G23 + CHECK (11 行) | ✅ |

**4 ✅ + 2 🟡 (G2.1 e2e + G2.4 5/6) + 2 🟢 (G2.6 注释锁 / G2.audit) = 退出 gate 候选 4/6 已就位 + 2 留账明文。**

---

## 2. Acceptance 验签 (烈马 QA)

- **G2.0** ✅ — CM-4 schema migration v=4 + state machine 状态机单测 + handler POST/PATCH/GET 全 PASS; bug-029 (raw UUID) / bug-030 (system message) 双修闭环 (#196 + #198).
- **G2.1 server** ✅ — `go test ./internal/ws/... ./internal/api/...` 12 测全 PASS (1.656s + 11.662s); typed Push 无 `interface{}`; nil-Hub / userID="" / frame=nil / offline 4 路 silent no-op 单测覆盖; schema 与 #218 client TS 字段名 1:1 byte-identical (人工 grep 比对通过).
- **G2.1 e2e** 🟡 — `cm-4-realtime.spec.ts` 仍 `.skip`, 战马B PR #239 解锁 in-flight (latency ≤ 3s 真过 + 截屏归档); 不阻塞退出 gate 联签判定, evidence 后置.
- **G2.2** ✅ — Playwright scaffold + 跨 fixture 注入 + smoke spec 全跑通 (#195 merge 已落).
- **G2.3** ✅ — `internal/throttle` 5 case (T1-T5: <budget pass / =budget pass / >budget reject / window reset / per-user 隔离) PASS; AUD-G2-G23 row 落地 (#244 §3).
- **G2.4** 🟡 — 1/6 + 5/6 = 4/6 已签 (#213 partial); #3 + #4 等 G2.1 e2e 解锁; #6 AdminBanner 等 ADM-1 (Phase 4); G2.4 不阻 Phase 2 退出 (野马 #233 立场签 SIGNED 有限版同款判定).
- **G2.5** ✅ — REG-INV-002 (raw UUID sanitizer) + REG-INV-003 (system message no-leak, evidence 列加 `cm-onboarding-bug-030-regression.spec.ts` #226 in #244).
- **G2.6** 🟡 — `event_schemas.go` godoc 注释锁 "byte-identical" 字面 + Phase 4 BPP-1 cutover 文档化; CI lint 比对 (`bpp/frame_schemas.go ↔ ws/event_schemas.go`) 等 BPP-1 PR 接手 (Phase 4); 不阻 Phase 2 退出.
- **G2.audit** ✅ — `g2-audit.md` DRAFT v2 §3 表 11 specific row 全列, AUD-G2-CHECK (SQLite ALTER ADD CHECK 不支持 single-source) 单行落账避免后续 migration 误踩坑.

---

## 3. 整体判定

**Phase 2 退出 gate QA 联签 = ✅ SIGNED (有限)**

- 6 闸刚性条件 (G2.0/G2.1 server/G2.2/G2.3/G2.5/G2.audit) 全 ✅;
- 2 闸软条件 (G2.4 demo 5/5 + G2.6 CI lint) 留账明文, 与野马 #233 同步判定一致 (5 milestone 立场 4/5 全过, ADM-0 demo 等 ADM-1).
- 与 PR #225 Phase 2 退出公告业主感知 5 条对齐: ①②③④ ✅, ⑤ 邀请 ≤ 3s 等战马B #239 e2e 解锁后野马补 G2.4 #3+#4 截屏 (Phase 2 已 merged 立场不变).

业主感知一句话 (与野马 #233 §2 1:1):
> 注册即看到 #welcome + 欢迎消息 + [创建 agent]; agent 默认能读你频道历史 (你可收回); admin 永不入你 channel/DM; 跨 org 看不到别人; 邀请显示名字非 raw UUID; 邀请 push ≤ 3s (代码就位, e2e 真过 evidence 战马B #239 in-flight).

---

## 4. 留账 (不阻 Phase 2 退出 gate, 跟 Phase 4 同期补)

- 🟡 **G2.4 截屏 5/6** 等 战马B #239 (cm-4-realtime.spec.ts .skip 解锁 + latency 截屏) → REG-RT0-008 evidence + 野马补签 G2.4 4/6 → 5/6.
- 🟡 **G2.4 截屏 6/6** 等 ADM-1 (Phase 4) AdminBanner 字面锁 demo merged → 野马补签 5/6 → 6/6.
- 🟡 **G2.6 CI lint** 等 Phase 4 BPP-1 cutover PR (`bpp/frame_schemas.go ↔ ws/event_schemas.go` byte-identical CI 工作流) — 注释锁是 grep 兜底, CI lint 是硬绿.
- 🟡 **REG-RT0-007** 60s polling fallback e2e — Phase 2 收尾后置 (battery 路径, 不阻退出 gate).

---

## 5. 关联 PR / 文件

- **PR #235** — vitest jsdom env 修 (REG-CM4-006 / REG-RT0-006 真过前置)
- **PR #237** — RT-0 server typed Push + no-op + schema lock (G2.1 server / REG-RT0-001..005)
- **PR #218** — RT-0 client TS interface + handler (REG-RT0-006 byte-identical 锁)
- **PR #226** — bug-030 e2e regression (REG-INV-003 evidence)
- **PR #236** — G2.3 internal/throttle 5 测 (AUD-G2-G23)
- **PR #244** — stacked: REG-RT0-001..006 ⚪→🟢 + REG-INV-003 evidence + g2-audit.md DRAFT v2 (本 signoff 触发器)
- **PR #233** — 野马 Phase 2 立场签 (`phase-2-yema-stance-signoff.md`)
- **PR #213** — G2.4 partial 4/6 (野马 + 烈马 spec 第一批)
- (本 PR) — Phase 2 退出 gate QA 联签

文件:
- `docs/implementation/00-foundation/g2-audit.md` (DRAFT v2 in #244)
- `docs/qa/regression-registry.md` (RT-0 6 🟢 in #244, total active 46/59)
- `docs/qa/signoffs/g2-exit-gate-liema-signoff.md` (本文)
- `docs/qa/signoffs/phase-2-yema-stance-signoff.md` (野马 PM 立场)

---

## 6. 签字

| Role | 名字 | 签字 | 日期 |
|---|---|---|---|
| QA | 烈马 | ✅ Phase 2 退出 gate QA 联签 (有限): 6 刚性闸 ✅ + 2 软闸留账明文; 业主感知 ④ 已就位 ⑤ 代码就位 e2e 等战马B #239 | 2026-04-28 |

> Phase 2 退出 gate 全签条件: 本签 (QA) + 野马 #233 (PM 立场) + team-lead admin 公告 + 战马B #239 merge → Phase 4 milestone (ADM-1 / AL-1b / BPP-1) 可全员推进.

---

## 7. 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-28 | 烈马 | v1 — Phase 2 退出 gate QA 联签 (G2.0–G2.audit 8 闸) |
