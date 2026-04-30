# Phase 4 Review Batch 2 — 5 PR 立场承袭 audit (飞马)

> 飞马 · 2026-04-29 · ≤80 行 · architect 立场角度 audit
> 关联: ADM-2 #484 admin_actions / BPP-8 #532 名实漂移 / AP-4 #551 ACL gap / batch1 §2.2 follow-up
> ⚠️ #570 是飞马自送 spec brief — self-LGTM 不挂, §2.1 标 second-reviewer 缺口

## 1. 5 PR 立场对齐总览

| PR | 类型 | 立场承袭 | 数学闭 | drift |
|---|---|---|---|---|
| #570 | spec ADM-3 (self) | ⚠️ 见 §2.1 — 91/0 纯 spec, BPP-8 §2.2 follow-up: rename `audit_events` + alias view + v=43 + ADM-0 §1.3 字面扩展. self-audit 不能签全 | N/A | self-LGTM 缺口 |
| #559 | feat HB-6 | ✅ 见 §2.2 — 715/0; admin-rail readonly GET only (反向 grep PATCH/POST/DELETE on admin-api/heartbeat-lag 0 hit ADM-0 §1.3); 30s 滚窗 in-memory aggregator 不写表 (`lag_audit/hb_lag_log/heartbeat_lag_table` 0 hit); audit-forward-only 链 0 污染 | ✅ active +6 (REG-HB6-001..006) | 无 |
| #563 | feat CHN-11 | ✅ 见 §2.3 — 830/0; 唯一 server 文件 `chn_11_member_admin_test.go` 即反向 grep守门 (production .go 0 行); CHN-1 #276 既有 POST/DELETE/GET /channels/:id/members byte-identical 不动; admin god-mode 不挂 | ✅ active +6 (REG-CHN11-001..006) | 无 |
| #555 | feat AP-5 | ⚠️ 见 §2.4 — 544/-3, AP-4 #551 reactions 同模式扩展 messages PUT/DELETE + DM-4 PATCH 三 handler IsChannelMember+CanAccessChannel gate; 0 schema/0 新错码; 副作用 error_branches 403→404 (gap fix 真生效, 不算 regression) | ✅ active +5 (REG-AP5-001..005) + REG-AP4 cross-link | §2.4 |
| #531 | "spec(cv-6)" | ❌ 见 §2.5 — **PR title 严重误标**: 标 "spec brief v0 ≤80 行" 实为 full impl 1633/-21 (FTS5 migration + search.go 181 行 handler + client SearchBox/SearchResultList + 4 CI workflows 改 `sqlite_fts5` build tag); spec 内 v=N/v=32/v=34 三处自相矛盾 | ⚠️ unverified | ❌ 误标拦 |

## 2. 关键发现 (drift 详细)

### 2.1 #570 ADM-3 spec — self-audit 立场充分性 (需 second reviewer)

- 3 立场 `audit_events` 重命名 / alias view backward compat / ADM-0 §1.3 字面扩展 — 表语义内一致.
- 5 反约束 grep claim count==0; AST 链承袭 ADM-2/BPP-4/BPP-7/BPP-8/HB-3 v2/AL-7/AL-8/HB-5/CHN-5 audit-forward-only 链.
- v=43 紧 BPP-8 v=42 后, sequencing 无冲突. 数据迁移 0 行 (SQLite RENAME 元数据).
- **self 不能 LGTM 项** (留 second reviewer 抓): (a) SQLite RENAME TABLE 是否对既有 view/index/trigger 真无副作用 — 烈马/驷马跑 schema diff 必验; (b) "alias view 写 path 0 行改" claim — 反向 grep `INSERT.*admin_actions` production 应 == 0 (view 不可写, 若仍有直 INSERT admin_actions 站点, alias view 会破); (c) view 删除时机 / Phase 5+ deprecation 是否真留账.
- **派活建议**: ADM-3 实施 PR 起战马时, 烈马首轮 review 必 cover (a)(b)(c) — 不可飞马自签.

### 2.2 #559 HB-6 — heartbeat lag percentile (✅)

- in-memory aggregator (30s 滚窗 SELECT lag_ms FROM agent_runtimes; sort + linear interpolation P50/P95/P99) — 不写表 / 不另起 admin_actions enum / 不另起 sweeper goroutine (同步 GET handler 即时聚合). audit-forward-only 链 0 污染 ✅
- admin-rail only GET (跟 ADM-2.2 + AL-7.2 + AL-8 同模式), reason 复用 `reasons.NetworkUnreachable` byte-identical 跟 BPP-4 watchdog 同源 — AL-1a 锁链第 19 处 ✅
- WindowSeconds=30 双向锁 (server const + BPP-4 BPP_HEARTBEAT_TIMEOUT_SECONDS 反锁) ✅
- 进程重启丢窗口 acceptable (monitor 非 SSOT, doc 已锁); admin 不能改 (readonly).

### 2.3 #563 CHN-11 — channel member admin UI (✅)

- "0 server prod" claim 真: 唯一 server 文件即 `chn_11_member_admin_test.go` (filepath.Walk migrations/ + 反向 `chn_11/chn11/CHN11` production 0 hit + handleAddMember/handleRemoveMember 2500 字符 block byte-identical 守).
- client-only 调既有 CHN-1 #276 endpoint (既有 ABAC + agent cross-owner guard + agent_join system DM 文案锁全套保留).
- admin god-mode 不挂 (REG-CHN11-005 反向 grep mux.Handle on admin-api/.../members 0 hit) ✅

### 2.4 #555 AP-5 — messages ACL post-removal fail-closed (低度 drift, 可接受)

- 跟 AP-4 #551 reactions ACL gap 闭合双轨成对 (REG-AP5 + REG-AP4 cross-link) — owner-only 锁链承袭 (AL-2a/BPP-3.2/AL-1/AL-5/DM-4/CV-4 v2/BPP-7/BPP-8/AP-4/AP-5).
- 错误字符 byte-identical messages.go 既有 "Channel not found" 404 (0 新错码), audit 复用既有 message_edited/message_deleted 事件 (0 另起表).
- **副作用**: `TestChannelsMessagesWorkspaceAdditionalBranches` update/delete-message-forbidden 翻 403→404 (post-leave-public 状态 channel-member gate 先于 sender_id check fire). 注释解释 gap fix 真生效, 接受 ✅
- **承袭 REG-CHN1-007 / REG-AP-* 链**: AP-1/AP-2/AP-3 cross-org gate + AP-4 reactions ACL + AP-5 messages ACL 四档单调; REG-INV-002 fail-closed 仍是上游守.

### 2.5 #531 CV-6 — PR 误标 (❌ 拦)

- title `spec(cv-6): artifact search — spec brief v0 (≤80 行)` 与实情**严重不符**: 1633 加 21 删. 内含 FTS5 virtual table migration `cv_6_1_artifacts_fts.go` v=N + 三 trigger + backfill (181 行 test) + `internal/api/search.go` handler 181 行 + client SearchBox/SearchResultList 完整组件 + lib/api.ts SearchErrCode 双向锁 + Makefile sqlite_fts5 GOTAGS.
- 4 CI workflow 改 (`ci.yml/deploy.yml/al-release-gate.yml/release-gate.yml`) 全部为 `go test -tags sqlite_fts5` 加 build tag — 技术上为 FTS5 必需, 但 spec brief 不应混 CI 改.
- **spec 内自相矛盾**: 同一 spec 字面出现 `v=34` / `v=32` / `v=N` 三处不一致 sequencing — 不可合.
- **拦点**: 此 PR 不符 "spec brief ≤80 行 docs only" 锁, 也不符 "一 milestone 一 PR" 锁 (spec + impl + CI 三事捆 一 PR). **建议拆**: (i) spec brief 单独 ≤80 行 PR 锁 v=N 字面单源; (ii) 实施 + CI build tag 走正常 milestone PR (待蓝图签 v0 立场后).

## 3. 跨 PR 链锁延续 verify

- **runtime-only 反约束**: 5 PR 无 build-time codegen 旁路 ✅ (#531 sqlite_fts5 build tag 是 cgo 必需, 不算)
- **admin god-mode reject 链 7**: #559 admin-rail readonly + ADM-3 spec 字面扩展 + #555/#563 user-rail 不挂 admin path; 5/5 锁紧
- **agent silent default**: 5 PR 无 agent 默认行为变更
- **SSOT blob PATCH PK**: 不涉 (#555 PUT/DELETE messages, sender_id PK 不动)
- **Reason 9-处 (post-#496)**: HB-6 第 19 处, AP-5/CHN-11/CV-6/ADM-3 不引新 reason — 单调
- **14-frame envelope (post-#503)**: 5 PR 全无 WS frame 改动 ✅
- **kindBadge 5 源**: G4.audit row 仍 pending (batch1 §4 留账未消) ⚠️
- **AST scan reverse-grep**: HB-6 第 16 处 / CHN-11 第 19 处 / AP-5 第 17 处 单调 ✅
- **audit-forward-only**: HB-6 不写表 / AP-5 复用既有 events / CHN-11 0 server / ADM-3 rename + alias view 不破 ✅
- **§5 totals 数学闭**: derived count, HB-6 +6 / CHN-11 +6 / AP-5 +5 ≡ REG-* 实际行 ✅
- **rule 6 docs/current sync**: #531 唯一含 docs/current 改, 跟 PR 误标性质捆绑未独验 ⚠️

## 4. 后续派活建议

1. **#531 CV-6 PR 误标拦** — Teamlead 要求战马C 拆: spec brief PR ≤80 行 (锁 v=N 字面单源消歧 v=32/34/N) + 实施 PR (含 CI build tag) 两条; 当前 1633 行 PR 不予合并.
2. **#570 ADM-3 second reviewer** — 烈马/驷马接手 ADM-3 实施 PR 时必 cover §2.1 (a)(b)(c) 三点 self 不能签的位; 飞马自送 spec brief 不挂 LGTM.
3. **AP-5 cross-org 反向断双轨** — batch3 audit 接 AP-5 后验 REG-INV-002 + REG-AP4 cross-link 仍 0 hit gap.
4. **kindBadge G4.audit row** — batch1 §4 留账继续 pending, 等下波 milestone PR (CV-2/DM-2/CV-4/CHN-4) 顺手补.
