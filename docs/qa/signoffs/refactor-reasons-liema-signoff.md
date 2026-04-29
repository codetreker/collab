# Acceptance Signoff — REFACTOR-REASONS (烈马自签)

> **状态**: ✅ SIGNED 2026-04-29 — REFACTOR-REASONS 一 PR 整闭
> **关联**: 飞马 #492 review flag 3 follow-up — 8 处单测锁链 (#249/#305/#321/#380/#454/#458/#481/#492) 现是 duplicate literal map 而非 SSOT import; REFACTOR-REASONS 一 PR dedupe 到 `internal/agent/reasons` SSOT 包
> **方法**: refactor 不进野马 G4 流, 烈马代签 (跟 CM-5 / ADM-1 deferred 同模式) — 真单测实施证据 + 立场反查 + acceptance template 闭锁 + 跨 milestone byte-identical 链不破

## 验收对照

| # | 锚点 | 实施证据 | 状态 |
|---|---|---|---|
| ① | `internal/agent/reasons/reasons.go` SSOT 包 (6 const + ALL 切片顺序锁 + IsValid + All) + 5 单测 | `reasons_test.go::TestALL_ByteIdentical_AL1a` (顺序+字面锁) + `_AcceptsAL1a6` + `_RejectsOutOfDict` (9 case) + `_ReturnsCopy` (defensive) + `_ExportedNames` (6 const) PASS | ✅ pass |
| ② | 4 production 源 import 替换 — `internal/agent/state.go` re-export / `internal/bpp/task_lifecycle.go::validTaskReason()` / `internal/bpp/agent_config_ack_dispatcher.go::validAL1aReason()` 全调 reasons.IsValid | `go test ./...` 全 PASS (无行为级 regression, 8 处单测锁链 byte-identical 全锁住) | ✅ pass |
| ③ | 反向 grep production 路径 inline 6-字典 map 0 hit | `bpp/task_lifecycle.go` + `bpp/agent_config_ack_dispatcher.go` 改 func wrapper, `agent/state.go` 6 const re-export 不算 inline map; production 路径已 dedupe | ✅ pass |
| ④ | test 字面**不动** — 跨 milestone byte-identical lock pin 是多源独立断言, dedupe production 后才能反向校验 SSOT 漂移 | `agent/state_test.go::TestClassifyProxyError` + `bpp/task_lifecycle_test.go` golden JSON + `migrations/{al_4_1,cv_4_1}_test.go` 6-字典断言 5 处裸字面保留 | ✅ pass |
| ⑤ | spec brief ≤80 行严守 + acceptance template 6 验收项 + REG-RR-001..005 5🟢 | `docs/implementation/modules/refactor-reasons-spec.md` 62 行 + `acceptance-templates/refactor-reasons.md` 6 ✅ + REG-RR rows | ✅ pass |

## 跨 milestone byte-identical 链承袭

- AL-1a #249 (online/offline + 6 reason 立) → AL-3 #305 → DM-2 #321 → CV-4 #380 → AL-2a #454 → AL-1b #458 → AL-2b #481 → AL-1 #492 → 此 SSOT
- 改字面 = 改 `reasons.ALL` 一处即 8 处单测同步挂 (反 fork 守)

## Follow-up ⏸️ deferred

- **REG-RR-006** AL-1 #492 `internal/store/agent_state_log.go::validReasons` 同样改走 SSOT (本 PR baseline 是 main, AL-1 在 feat/al-1 stacked, merge 顺序 #492 → 本 PR follow-up commit)
- **REG-RR-007** client SPA `lib/agent-reasons.ts` 客户端文案 SSOT (跨层 byte-identical lock, future refactor milestone)
- **REG-RR-008** deprecation: `internal/agent.Reason*` re-export 标 // Deprecated, 后续 milestone 全切到 `reasons.*` 直接 import

## 烈马签字

烈马 (代 zhanma-d) 2026-04-29 ✅ SIGNED post-REFACTOR-REASONS PR
- 6/6 验收通过
- 8 处单测锁链不破
- 跟 G4.2 ADM-2 + G4.1-G4.5 + AL-1 #492 烈马代签机制同模式 (refactor 不进野马 G4 流, 用户感知 0 变化)
- 反向断言 production 路径 inline 6-字典 map 0 hit
- 跨 milestone byte-identical 链全锚

## 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-29 | 烈马 | v0 — REFACTOR-REASONS ✅ SIGNED 一 PR 整闭. 6/6 验收通过 (SSOT 包 + 5 单测 + 4 production 源 import 替换 + 反向 grep + test 字面立场守 + spec brief ≤80). 跟 CM-5 / ADM-1 / AL-1 烈马代签机制同模式 (refactor 不进野马 G4 流). REG-RR-001..005 5🟢. 留账 3 项 ⏸️ deferred (REG-RR-006..008: AL-1 #492 store stack + client SPA SSOT + agent.Reason* deprecation). |
