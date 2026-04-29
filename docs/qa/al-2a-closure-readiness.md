# AL-2a Closure Readiness — 飞马 prep skeleton

> 飞马 · 2026-04-29 · ≤100 行 (跟 G3 closure announcement #451 同模式 byte-identical 结构 / closure 单 milestone 版)
> Trigger: AL-2a 4 件套 ✅ + AL-2a.1 schema #447 实施进行中 (zhanma-a 修 coverage) → 飞马 prep skeleton, 等 #447 final merge 后接 closure follow-up PR (REG-AL2A 翻 + acceptance ⚪→🟢 + PROGRESS [x])
> 关联: `docs/qa/signoffs/g3-exit-gate.md` (#451 G3 closure 5 链锁源头) / `docs/qa/acceptance-templates/al-2a.md` (#264) / `docs/qa/al-2a-content-lock.md` / `docs/qa/al-2a-stance-checklist.md` / `docs/qa/al-2b-acceptance.md` (#452 AL-2b 同期合规划) / `docs/implementation/PHASE-4-ENTRY-CHECKLIST.md` (#456) / `docs/qa/regression-registry.md` (REG-AL2A-001..007 占号待 #447 trigger flip)

---

## 1. AL-2a milestone 完成判据 (跟 G3 closure §1 5 闸表同模式)

| 件 | 主旨 | 证据 PR | 状态 (本文 cut: 2026-04-29) |
|---|---|---|---|
| **spec brief** | AL-2a 3 立场 + 3 拆段 + SSOT blob 单源 | (战马E PM 客串, 跟 BPP-2 #460 同期) | ✅ |
| **acceptance template** | 数据契约 + 反约束 + 测试矩阵 | #264 (烈马) | ✅ |
| **content lock** | UI 文案 byte-identical (AL-2a config UI) | docs/qa/al-2a-content-lock.md | ✅ |
| **stance checklist** | 7 立场反查 (SSOT / runtime-only 不入 / config 单源 / silent default / admin reject 四源 / 不裂 frame / 跨 milestone byte-identical) | docs/qa/al-2a-stance-checklist.md | ✅ |
| **AL-2a.1 schema (v=20)** | `agent_configs` 表 (agent_id PK + schema_version + blob TEXT JSON + 6 单测) | #447 (zhanma-a, 飞马 LGTM ✅, coverage 修 in-flight) | 🔄 IN-FLIGHT |
| **AL-2a.2 server PATCH API** | REST PATCH /api/v1/agents/:id/config + admin reject 405 + fail-closed runtime-only 字段反约束 | (zhanma-a 续作待 #447 merge) | ⏳ |
| **AL-2a.3 client SPA config UI** | agent settings 页 owner-only PATCH 入口 + reload 触发 | (待派) | ⏳ |
| **REG-AL2A-001..007 占号** | regression-registry 7 行占号待 trigger PR flip 🟢 | (REG-AL2A 占号待 #447 final merge → #452 AL-2b 同期合) | ⚪ pending |

**通过判据**: 4 件套 ✅ + AL-2a.1/2.2/2.3 三段实施 ✅ + REG-AL2A-001..007 全 🟢 → AL-2a milestone closure follow-up PR (PROGRESS [x] + acceptance ⚪→🟢 + REG flip).

---

## 2. closure follow-up PR scope (等 #447 final merge 后)

flip 路径 (跟 #383 REG-DM2 翻牌 / #428 CHN-4 closure 同模式):

1. **acceptance template `al-2a.md` 各 ⚪ → 🟢** — §数据契约 + §server API + §SPA UI 三段同步翻
2. **REG-AL2A-001..007 占号 → 🟢 active** — `docs/qa/regression-registry.md` 各行 trigger PR + status 翻 (跟 #383 数学对账模式同 — total 不增 / DM-2 row 0/N→active/0)
3. **PROGRESS.md `[ ] AL-2a` → `[x] AL-2a` flip** — line 208 字面 (跟 #428 CHN-4 closure flip 同模式)
4. **跨 milestone byte-identical 链 review** — 跟 G3 closure §3 5 链 + AL-1b/AL-2b/BPP-2 同期承袭表跑反向 grep, 防漂移
5. **PHASE-4-ENTRY-CHECKLIST.md (#456) §1 row AL-2a 状态翻** — 🔄 IN-FLIGHT → ✅ closed (Phase 4 entry 8 表第 2 行)

---

## 3. 跨 milestone byte-identical 链承袭 (跟 #451 G3 closure §3 同模式 + AL-2a 新链)

承袭 G3 closure 5 链 + AL-2a 加 4 链:

| # | 链 | 字面 | 源数 | AL-2a 关联 |
|---|---|---|---|---|
| 链 1-5 | (G3 closure 5 链承袭) | kindBadge 二元 / CONFLICT_TOAST / fanout / rollback gate / 5-frame envelope | (跟 #451 §3 同源) | AL-2a UI 不破链 (config UI 不渲染 kindBadge / 不 fanout config 变化 / 不裂 frame namespace) |
| **链 6** | runtime-only 字段反约束 | `api_key` / `temperature` / `token_limit` / `retry_policy` 不入 schema 不入 frame | 单源 (al_2a_1_agent_configs.go schema CHECK + AL-2a.2 server reject + BPP-2.3 frame fields 6 项白名单) | 跟 BPP-2.3 #460 立场 ③ + #379 v2 立场 ① "Borgee 不带 runtime" 同源 |
| **链 7** | admin god-mode reject PATCH 四源 | admin endpoint 不挂 PATCH 业务路径 | 4 源 (AL-3 #303 ⑦ + AL-4 #379 v2 §3 + AL-1b #458 stance ⑤ + AL-2a #454 ④) | AL-2a admin 也走 405 reject (跟 AL-1b BPP single source 同精神, admin 不入业务路径) |
| **链 8** | agent silent default 三源 | 状态/配置变化不发 system message broadcast / 不污染 channel chat 流 | 3 源 (AL-3 #305 ③ + AL-1b #458 ⑦ + AL-2a #454 ⑦, 加上 #382 立场 ⑤) | AL-2a config 变化走 BPP-2.3 agent_config_update server→plugin push, 不进 channel chat / 不发 system message |
| **链 9** | SSOT blob 整体替换 PATCH 语义 | PK 单 agent_id 不裂 multi-row by config_key | 单源 (al_2a_1_agent_configs.go PK 字面) | 跟蓝图 §1.4 字面 + #447 schema PK 单 agent_id 同源 |

**反向 grep 命令** (closure follow-up PR 跑):

```bash
# 链 6: runtime-only 字段不入 schema/frame (跟 BPP-2.3 + AL-4 同精神)
grep -rnE 'agent_configs.*api_key|agent_config_update.*api_key|api_key.*temperature' packages/server-go/internal/   # 0 hit

# 链 7: admin god-mode reject 四源
grep -rnE 'PATCH /api/v1/agents/.*/config|admin.*PATCH.*agent.*config' packages/server-go/internal/api/admin*.go   # 0 hit (admin 不挂 PATCH 业务路径)

# 链 8: agent silent default — config 变化不发 system message
grep -rnE 'agent_config_update.*system.*message|config.*change.*broadcast.*channel' packages/server-go/internal/   # 0 hit

# 链 9: SSOT blob PATCH 语义 (PK 单 agent_id)
grep -rnE 'agent_configs.*config_key|UNIQUE.*agent_id.*config_key' packages/server-go/internal/migrations/   # 0 hit (反 multi-row 拆死)
```

---

## 4. AL-1b / AL-2b / BPP-2 同期合规划 (跟 PHASE-4-ENTRY-CHECKLIST #456 §1 同源)

AL-2a 跟以下 milestone 协同链 (跟 BPP-1→AL-2→BPP-3 串行锁字面承袭):

| Milestone | 协同点 | AL-2a closure 要求 |
|---|---|---|
| **AL-1b** (#453 in-flight) | 同期独立 — AL-1b busy/idle 跟 AL-2a config SSOT 不耦合; 但 admin god-mode reject 四源链 7 共有 | AL-1b ✅ 后, AL-2a closure 跟 AL-1b closure 各自独立, 但反向 grep 链 7 双方 0 hit 同跑 |
| **AL-2b** (#452 in-flight) | 强依赖 — AL-2b BPP frame 真接管 config 推送, AL-2a 仅 schema + REST PATCH | AL-2b 落地后 AL-2a closure 不变 (PATCH 路径不动), 仅 BPP push trigger 加跟 BPP-3 SSOT 同 PR 合 |
| **BPP-2** (#460 v0 spec) | 协议层底座 — BPP-2.3 agent_config_update frame 跟 AL-2a SSOT blob 接 (BPP-3 SSOT 真接管时跟 AL-2b 同 PR) | AL-2a closure 不阻塞 BPP-2; BPP-2.3 落地后, AL-2a 增 BPP push trigger (单独 follow-up patch, 不破 closure) |
| **BPP-3** (Phase 4 后段) | SSOT 真接管 — BPP-2.3 + AL-2b + BPP-3 三 PR 合 | AL-2a closure 落地后 BPP-3 拼装 SSOT 推送链, 不阻 AL-2a closure |

---

## 5. 退出条件 (closure follow-up PR 入)

- §1 milestone 完成判据全 ✅ (4 件套 + 三段实施 + REG-AL2A 全 🟢)
- §2 closure follow-up PR scope 5 项全闭 (acceptance 翻 + REG flip + PROGRESS [x] + 链 review + PHASE-4-ENTRY 状态翻)
- §3 跨 milestone byte-identical 9 链 (G3 closure 5 + AL-2a 4 新) 反向 grep 全 0 hit
- §4 AL-1b/AL-2b/BPP-2/BPP-3 同期合规划字面延续 (不阻塞协同链)
- 跟 #428 CHN-4 closure / #383 REG-DM2 翻牌同模式 (无新增反向断言失败 + 数学对账正确)

---

## 6. 关联 PR / 文件

- **AL-2a.1 schema**: #447 (zhanma-a, 飞马 LGTM ✅, coverage 修 in-flight)
- **AL-2a acceptance**: #264 (烈马, 已 merged)
- **AL-2a content lock**: docs/qa/al-2a-content-lock.md (战马E)
- **AL-2a stance**: docs/qa/al-2a-stance-checklist.md (战马E)
- **AL-2b acceptance**: #452 (in-flight, 飞马 review 排队)
- **BPP-2 4 件套**: #460 (战马E v0, 飞马 LGTM ✅)
- **AL-1b in-flight**: #453 (zhanma-c) + #458 content+stance (飞马 LGTM ✅)
- **G3 closure**: #451 (飞马, 5 链锁源头)
- **G3.audit**: #448 (飞马 v1 fill, A4 AL-3.3 ADM-2 + A2 AL-4 hermes 跨 milestone 留账)
- **PHASE-4-ENTRY-CHECKLIST**: #456 (飞马, §1 row 2 AL-2a 状态)
- **regression-registry**: REG-AL2A-001..007 占号待 trigger PR flip 🟢

---

## 7. 更新日志

| 日期 | 作者 | 变化 |
|------|------|------|
| 2026-04-29 | 飞马 | v0 prep skeleton — AL-2a milestone closure readiness 4 件套 ✅ + AL-2a.1 schema #447 IN-FLIGHT (coverage 修) + AL-2a.2/2.3 ⏳; closure follow-up PR scope 5 项 (acceptance ⚪→🟢 + REG-AL2A flip + PROGRESS [x] + 链 review + PHASE-4-ENTRY 状态翻); 跨 milestone byte-identical 9 链承袭 (G3 closure 5 + runtime-only 字段不入 + admin reject 四源 + agent silent default 三源 + SSOT blob PATCH 语义); AL-1b/AL-2b/BPP-2/BPP-3 同期合规划字面延续不阻协同链. 跟 #451 G3 closure 同模式 byte-identical 结构 / closure 单 milestone 版 (跟 phase 退出闸不同, milestone closure 单 PR). |
