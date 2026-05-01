# G4.audit — 野马 (PM) 独立 audit Phase 4+ 真漏项 (≤200 行)

> 2026-05-01 · 野马 (yema PM) · **不读飞马 audit, 独立 PM 视角**. 5 角度全审 (蓝图立场 / content-lock 字面 / 5 截屏 / deferred 票 / 跨 milestone 反约束漂移). 排除"已留账 v2+"且蓝图明示项. 真漏项按优先级排.
>
> 数据源: `docs/blueprint/*.md` (15 章) + `docs/implementation/progress/phase-4.md` + `docs/qa/regression-registry.md` + `docs/qa/signoffs/g4.{1-5}-*-signoff.md`

---

## 🔴 P0 真漏项 (蓝图明示但未兑现 / 用户主权红线 gap)

### P0.1 G4.x 5 截屏全无归档 (PM 必修 #2 真违反)

**真漏**: `docs/qa/signoffs/g4-screenshots/` 目录**完全不存在** (G3.4 #590 同模式归档路径锚是 PM 必修 #2 真兑现要求, 跨 #599 HB stack Go PM 必修锚 + g3-exit-gate 立场承袭).

**已签 5 文件 (g4.1-g4.5 *-signoff.md) 是文字 signoff, 非真截屏**:
- ✅ g4.1 ADM-1 yema 签 (无截屏锚)
- ✅ g4.2 ADM-2 liema 签 (REG-ADM2-011 deferred 双截屏 `g4.2-adm2-{audit-list,red-banner}.png` 真漏)
- ✅ g4.3 BPP-2 liema 签
- ✅ g4.4 CM-5 liema 签
- ✅ g4.5 runtime-stack liema 签

**真漏清单**:
- HB-4 ⭐ 4.2 deferred 3 张截屏 (五支柱状态页 / 情境授权弹窗 / 撤销后行为) — phase-4.md 行 53 明示
- AL-2 wrapper ⭐ 4.2 deferred 3 张截屏 (5-state UI / error→online 反向链 / busy/idle BPP frame 触发) — phase-4.md 行 24 明示
- ADM-2 REG-ADM2-011 双截屏 (audit-list + red-banner) — phase-4.md 行 70 + registry.md 行 360
- RT-3 ⭐ 多端 cursor + presence 活物感 — 我 G4.audit PM 三联签字 (前一 commit 233119b9) 提的 #1+#2

**优先级**: 🔴 P0 — PM 必修 #2 真兑现 = G4.audit 三签闭环必备, 不补=没真完.

### P0.2 PROGRESS phase-4.md 概览 stale [ ] 9 项 (用户铁律 progress_must_be_accurate 命中)

**真漏**: `phase-4.md` 行 51/57/61/71/75/76/81/83/85 仍 `[ ] 未做` 但实际:
- HB-2 (51) 状态: #606 v0(C) ✅ + #605 HB-2.0 ✅ + HB-2 v0(D) 待派 → 概览仍 `[ ]` 误导
- RT-3 ⭐ (57): #588 ✅ 已合 (基础多端 fanout) + ⭐ 升级版 stance/content-lock 已落待派 → 概览 `[ ]` 误导 (这是 CS-2/CS-3 撤回派活根因)
- AP-2 (61): #620 ✅ 已合 → `[ ]` 错
- ADM-3 (71): #586 + #619 ✅ 已合 → `[ ]` 错
- DL-2 (75): #617 ✅ + DL-3 (76): #618 ✅ → 概览未翻
- CS-1 (83): #601 ✅ 已合 → `[ ]` 错
- CS-2 (81): #595 ✅ + CS-3 (85): #598 ✅ 已合 → `[ ]` 错

**user memory 命中**: `progress_must_be_accurate` 铁律 (做完即翻牌, stale = 误派活根因, 这是 CS-2/CS-3 撤回派活的根因; 不补 PROGRESS = 下次还会误派).

**优先级**: 🔴 P0 — 直接误导 teamlead 派活, 真"血账"案例已发生.

### P0.3 蓝图 §0.1 一条不变立场 0 milestone 真兑现 e2e 验

**真漏**: `concept-model.md §0.1 "一条不变的产品立场"` 是蓝图最强立场 (用户主权红线), 但跨 Phase 4 30+ milestone 无任何 e2e 真测此立场字面承袭. 所有 milestone 各自做 stance / content-lock 单测, 但**蓝图 §0.1 字面**未拆出独立的 cross-milestone e2e 守门.

**优先级**: 🔴 P0 — 蓝图立场承袭最强红线无 e2e 守, drift 风险高.

---

## 🟡 P1 真漏项 (反约束漂移风险 / 立场承袭 gap)

### P1.1 admin god-mode 反向 grep CI step 缺失

**真漏**: 跨 30+ milestone 我 PM 立场反查每次锁 `admin god-mode 不挂 <scope>` (反向 grep `admin.*<scope>|/admin-api.*<scope>` 0 hit), 但**没有统一 CI step** 守此立场跨全 milestone (类似 BPP-1 #304 reflect lint / AP-4-enum #591 reflect-lint 守门模式).

**建议**: 加 `release-gate.yml` `admin-godmode-no-mount` step 反向 grep ≥10 scope 关键字 (datalayer/events/metrics/bundle/audit_events 写/presence/fanout/cursor/helper/grants/retention/sweeper) 0 hit. 跟 dict-isolation step 同模式承袭.

**优先级**: 🟡 P1 — 防 future PR drift, ADM-0 §1.3 红线机器化守门.

### P1.2 thinking 5-pattern 锁链 N+4 处但无统一 CI 守门

**真漏**: thinking 5-pattern 锁链立场跨 BPP-3+CV-7+CV-8/9/11/12/13/14+DM-3/4/9/12+RT-3+HB-2 v0(D)+AP-2+CS-2 已 14+ 处, 但**没有 CI step 跨 client + server + daemon 路径统一守 5 字面 + typing 同义词 9+ 类禁词反向 grep 0 hit**.

**建议**: 加 `release-gate.yml` `thinking-5-pattern-lock` step 反向 grep `processing|responding|thinking|analyzing|planning|typing|composing|loading|正在输入|正在加载` 在 `packages/client/src/` + `packages/server-go/internal/` + `packages/borgee-helper/` 0 hit (allowlist 内部 i18n key 等).

**优先级**: 🟡 P1 — 14+ milestone 散布锁难维护, CI 真守.

### P1.3 沉默胜于假活物感锁链第 6 处但无禁词 CI

**真漏**: 跨 AL-3 + RT-3 ⭐ + CV-14 + CS-3 + CS-4 + CS-2 锁链, 但 `"已连接"|"在线状态正常"|"connected"|"系统正常"` 等沉默立场禁词无 CI 守门.

**建议**: 加 `release-gate.yml` `silence-over-fake-aliveness` step 反向 grep 禁词 0 hit.

**优先级**: 🟡 P1 — 沉默立场用户体验红线, CI 真守.

### P1.4 5-field audit schema 锁链跨六源但无 reflect lint

**真漏**: `actor / action / target / when / scope` 跨 HB-1/HB-2/BPP-4/HB-4/HB-3/ADM-3 byte-identical 立场, 但只有 HB-4 release-gate.yml `audit-schema-cross-milestone reflect lint` 守 5 源 (HB-1+HB-2+BPP-4+HB-3+HB-4), **未扩到 ADM-3 第 6 源**.

**建议**: 升级 reflect lint 第 5 处 → 第 6 处 (加 ADM-3 audit_events 源).

**优先级**: 🟡 P1 — 改一处=改六处真守门.

---

## 🟢 P2 改进项 (非阻塞, follow-up)

### P2.1 字典分立锁链第 8 处缺统一 reflect lint
8 字典 (AL-1a 6 / HB-1 7 / HB-2 8 / AP-4-enum 14 / DL-2 3 / DL-3 3 / AP-2 bundle / ADM-3 4) 分散在各 milestone 守门. AP-4-enum #591 既有 reflect-lint 仅守 14-cap, 未扩跨 8 字典. 建议: 加 `release-gate.yml` `dict-isolation-cross-milestone` step.

### P2.2 owner-only ACL 锁链 22+ 处无 anchor #360 统一守门
跨 22+ PRs 各自 stance 锁, 但无 cross-PR CI 守 anchor #360 立场字面 byte-identical (`Owner is the user who created the channel/artifact/agent`).

### P2.3 蓝图 §1.4 来源透明 actor_kind 4-enum mixed 路径无 e2e
ADM-3 #619 真兑现 actor_kind 4-enum, 但**mixed 来源场景** (例: agent 代 user + admin 推翻) 真测 e2e 缺失. 建议: G4.audit 闭环前补 1 e2e.

---

## 📋 G4.audit 闭环建议 (按优先级真闭路径)

**真闭 P0 必做** (G4.audit 三签真闭环):
1. 🔴 P0.2 — PROGRESS phase-4.md 概览 [ ]→[x] 9 项翻牌真补 (我 PM 可立即出 docs PR)
2. 🔴 P0.1 — 5 截屏 G4.x 归档 (RT-3 ⭐ #1+#2 / HB-4 4.2 / AL-2 wrapper 4.2 / ADM-2 REG-011) — 待 zhanma + liema 真截屏
3. 🔴 P0.3 — 蓝图 §0.1 立场 e2e 守门 — 真"一不变立场" cross-milestone 验

**真闭 P1 强烈建议** (CI 守门防 future drift):
4. 🟡 P1.1 — admin god-mode 反向 grep CI step
5. 🟡 P1.2 — thinking 5-pattern + typing 同义词 CI step
6. 🟡 P1.3 — 沉默胜于假活物感 CI step
7. 🟡 P1.4 — 5-field audit reflect lint 升级第 5→第 6 源 (加 ADM-3)

**P2 follow-up** (非阻 G4.audit):
8. 🟢 P2.1 — 字典分立 8 锁链 reflect lint
9. 🟢 P2.2 — owner-only anchor #360 统一守门
10. 🟢 P2.3 — actor_kind mixed 路径 e2e

---

## 总结

**Phase 4 真完判定**: ⚠️ **不真完** — P0 3 项真漏未兑现:
- PROGRESS 概览 stale 9 项 (用户铁律 命中, 已发生 CS-2/CS-3 撤回派活血账)
- 5 截屏 G4.x 归档全缺 (PM 必修 #2 真违反)
- 蓝图 §0.1 立场无 e2e 守门

**飞马说"Phase 4 真完"**: 我 PM 视角 ⚠️ **半真完** — milestone 实施真完 (~30 PR ✅), 但 **closure 流程 (PROGRESS 翻牌 + 5 截屏 + e2e 立场守门) 未真闭**.

**建议**: G4.audit 不能用前 commit 233119b9 PM 三联签字独自闭环, 需先做 P0 3 项真补 → 再发 G4.audit 总闸三签 (飞马 + 烈马 + 野马).

— 野马 (Yema PM) 2026-05-01 (独立 audit, 不与飞马交流)
