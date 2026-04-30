# Phase 4 milestone naming map (G4.audit 准备) — 野马 v0

> **状态**: v0 (野马, 2026-04-30) — Phase 4 大量 milestone 命名混乱跨链审计, 跟 G4.audit 收口 + Phase 5 启动前 canonical-id 锁字面.
> **范围**: ~50 个 Phase 4 merged + in-flight milestone (CV-2..13 / CHN-3..7 / DM-4..8 / AL-1..8 / AP-1..5 / BPP-2..8 / HB-3..5 / DL-4 / ADM-1..2 / CM-5 / AL-2 wrapper / AL-1.4 wrapper).
> **关联**: PROGRESS.md §"Phase 4+ 剩余模块" + #467 cross-milestone count audit + PR #568 Phase 4 stance 反查表 + PR #571 admin god-mode 总表.

---

## §1 命名冲突 / 双义识别 — 必修澄清

| 冲突类型 | canonical-id | 别名 / 双义 | 实情 + 建议 |
|---|---|---|---|
| **HB-3 vs HB-3 v2** | `HB-3` | "HB-3" 有 schema-only 锁 contract 段, "HB-3 v2" `feat(hb-3-v2)` PR #534 是 daemon decay derive 续段 | 推荐: HB-3 = full milestone (4 件套 + schema), HB-3-v2 = 第 2 段 (heartbeat decay 三档 derive). PROGRESS 当前混称, 建议 G4.audit 统一为 `HB-3.1` schema/contract + `HB-3.2` daemon Rust + `HB-3-v2` 续段 derive (跟 CV-2-v2/CV-3-v2/CV-4-v2 同模式) |
| **AP-4 双义** | `AP-4` | (a) PR #551 reactions ACL gap 闭合 / (b) PROGRESS line 273 "capability 清单 enum 化" | **冲突**: PR #551 实施 ≠ PROGRESS 占号. 建议: PR #551 重命名为 `AP-4-reactions` 续段 (跟 AP-3 cross-org 类比), PROGRESS line 273 占号 enum 化保持, 或反向 — G4.audit 决议 |
| **AL-9 替 AL-6** | `AL-9` | AL-6 占号被 AL-9 实质 (野马观察, 待飞马确认) | PROGRESS 当前无 AL-6/AL-9 行, **建议**: G4.audit 启动后先确认 AL-6/AL-9 是否真存在并补 PROGRESS 占号 |
| **DM-7 vs spec 重复** | `DM-7` | 两份 spec — 一份 dm-7-spec.md (战马E v0) + 一份内嵌 PROGRESS line | 实际无冲突 (spec brief + 实施同源), 但建议 spec 顶部加 canonical-id 头注 |
| **AL-1 wrapper vs AL-1.4 wrapper** | `AL-1` | "AL-1 状态四态扩展" + "AL-1.4 wrapper state machine validator" 两层 | 实情: AL-1 是 Phase 4 wrapper milestone 整闭, AL-1.4 是其 sub-段. 建议: G4.audit 标 `AL-1` 为 wrapper, `AL-1a/1b/1.4` 为 sub-段 (跟 AL-2 wrapper / AL-2a/2b sub 同模式) |
| **AL-2 wrapper vs AL-2a/2b** | `AL-2-wrapper` | AL-2 wrapper release gate (4 件套 + al-release-gate.yml) ≠ AL-2a/AL-2b 实施 | 已锁 — al-2-wrapper-stance-checklist.md 顶部已标 wrapper 性质, ✅ 干净 |
| **CV-2 vs CV-2-v2** | `CV-2` + `CV-2-v2` | CV-2 #359+#360+#404 三段 + CV-2-v2 #517 三段四件全闭 | 已锁 — `-v2` 后缀清晰 (CV-3/CV-4 同模式) ✅ |
| **BPP-3 vs BPP-3.1 vs BPP-3.2** | `BPP-3` | BPP-3 (PR #489) + BPP-3.1 (permission_denied frame) + BPP-3.2 (permission_denied UX) | 已锁 — `.1/.2` sub-段清晰 ✅ |
| **CHN-7 mute vs CHN-9 visibility** | `CHN-7` | CHN-7 mute (PR #550) / CHN-9 visibility (本次 main 含 chn_9_visibility.go) | 无 PROGRESS 占号 CHN-9, 建议补 PROGRESS line `CHN-9 channel visibility` |

---

## §2 Phase 4 全 milestone canonical-id 表 (按 module group)

格式: `<canonical-id> | <displayed-name> | <PR# / 状态> | <蓝图 §> | 备注`

### agent-lifecycle
- `AL-1-wrapper` | 状态四态扩展 | ✅ #(本 PR) | agent-lifecycle.md §2.3 | wrapper, sub: AL-1a/1b/1.4
- `AL-1a` | online/offline + error 旁路 + 6 reason | ✅ #249 | §2.3 R3 | 6 reason 字典锁链 ≥10 处源头
- `AL-1b` | busy/idle 5-state | ✅ #453+#457+#462 | §2.3 R3 + plugin §1.6 | BPP-2.2 task lifecycle 真接管
- `AL-1.4-wrapper` | state machine validator + state_log | ✅ (含在 AL-1) | §2.3 + §13 | sub-段 of AL-1
- `AL-2-wrapper` | agent lifecycle release gate ⭐ | ✅ feat/al-2-wrapper | §13 release | 跟 HB-4 同模式拆独立 yml
- `AL-2a` | config 表 + update API | ✅ #480 (#447+#264+#454+#481) | plugin §1.4 + §1.5 | 整 blob SSOT
- `AL-2b` | BPP agent_config 双向 frame | ✅ #481 | plugin §1.5 | ack 入站三态
- `AL-3` | presence 完整版 | ✅ #310+#317+#324+#327 | §2.3 | sub: AL-3.1/3.2/3.3
- `AL-4` | runtime registry | ✅ #398+#414+#417+#427 | §2.2 | sub: AL-4.1/4.2/4.3
- `AL-5` | recover (deleted message 恢复) | ✅ (PR# 待补) | §2.4 | admin-rail 不挂
- `AL-6` | (占号 — 待确认) | ⏸️ G4.audit 决议 | TBD | 见 §1 命名冲突
- `AL-7` | audit log retention + archive | ✅ #536 | §13 audit | schema v=33 archived_at + RetentionSweeper
- `AL-8` | audit log filter | ✅ #538 | §13 audit | 0 schema 0 新 endpoint
- `AL-9` | (替 AL-6 实质?) | ⏸️ G4.audit 决议 | TBD | 见 §1 命名冲突

### plugin-protocol (BPP)
- `BPP-1` | 协议骨架 + envelope CI lint | ✅ #304 | plugin §0..§2 | (Phase 3 起步)
- `BPP-2` | 抽象语义层三段四件 | ✅ #485 | plugin §1.3..§1.6 | sub: BPP-2.1/2.2/2.3
- `BPP-3` | plugin frame dispatcher | ✅ #489 | plugin §1.3 | sub: BPP-3.1/3.2
- `BPP-3.1` | permission_denied frame (server→plugin) | ✅ | auth-permissions §4.1 | envelope 12→13
- `BPP-3.2` | permission_denied plugin UX 流 | ✅ (3 段) | plugin §1.3 主入口 | DM dispatch + owner UI + retry cache
- `BPP-4` | 失联检测 + dead-letter audit | ✅ feat/bpp-4 | plugin §1.6 | 30s heartbeat 单源 + reason 第 9 处链
- `BPP-5` | reconnect handshake + cursor resume | ✅ feat/bpp-5 | plugin §1.6 | 复用 RT-1.3 #296 ResolveResume + reason 第 10 处
- `BPP-6` | plugin cold-start handshake | ✅ #522 | plugin §1.6 | envelope 14→15
- `BPP-7` | plugin SDK 真接入 | ⏸️ spec #529 | plugin §3 | 实施待落
- `BPP-8` | plugin lifecycle audit log | ✅ #532 | §13 audit | 5 事件复用 admin_actions

### host-bridge
- `HB-3` | 情境化授权 4 类 (schema/contract) | ✅ feat/hb-3 | host-bridge §1.3 | sub: HB-3.1 schema / HB-3.2 daemon contract
- `HB-3-v2` | heartbeat decay 三档 derive | ✅ #534 | §1.5 | 续段, 跟 CV-2-v2 同模式
- `HB-4` | release gate ⭐ | ✅ feat/hb-4 (4.1) + ⏸️ 4.2 demo | §1.5 | 跟 AL-2 wrapper 同模式独立 yml
- `HB-5` | (待 PROGRESS 补占号) | ⏸️ G4.audit | TBD | DM-7 锁链第 17 处提及

### auth-permissions
- `AP-1` | ABAC 单 SSOT + 14 capability + 严格 403 | ✅ #(战马C) | auth-permissions §1+§2 | REG-CHN1-007 ⏸️→🟢
- `AP-2` | expires_at sweeper 业务化 | ✅ #525 | §13 audit | UI bundle 占号被实质替换, 见 §1
- `AP-3` | 跨 org owner-only 强制 | ✅ #521 | §1.3 | abac 加 1 层 org gate
- `AP-4` | reactions ACL gap (PR #551) **OR** capability enum 化 (PROGRESS 占号) | ⚠️ 双义, G4.audit 决议 | §2 | 见 §1
- `AP-5` | messages PUT/DELETE/PATCH post-removal fail-closed | ✅ #555 | §2 | 一 milestone 一 PR

### canvas-view (CV)
- `CV-2-v2` | preview thumbnail + media player 三段四件 | ✅ #517 | canvas §2.1 | 跟 CV-2 #359 续段
- `CV-3-v2` | thumbnail server CDN + 二闸互斥 | ✅ #528 | §2.2 | 跟 CV-3 #396 续段
- `CV-4-v2` | iteration history list + timeline UI 续 | ⏸️ spec #526 | §3 | 实施待落
- `CV-5` | artifact comment 主线 (起步) | ✅ #530 | §4 | thinking 5-pattern AST 锁
- `CV-7` | comment edit/delete/reaction 续 | ✅ #535 | §4 | 0 schema 0 新 endpoint
- `CV-8` | comment thread reply (1-level) | ✅ #537 | §4 | CV-5/CV-7 续
- `CV-9` | comment @mention 通知 | ✅ #539 | §4 | 0 server production
- `CV-10` | comment 草稿持久化 | ✅ #541 | §4 | client localStorage only
- `CV-11` | comment markdown 渲染 | ✅ #543 | §4 | 0 server + 0 新 lib
- `CV-12` | comment search (复用既有 messages search) | ✅ #545 | §4 | 0 server
- `CV-13` | comment quote / reference | ✅ #557 | §4 | 0 server, 跟 DM-6 quote 同模式

### channel (CHN)
- `CHN-3.2` | user_channel_layout (drag/drop persistence) | ✅ | channel §1.4 | layout admin 不挂
- `CHN-7` | channel mute (bitmap bit 1) | ✅ #550 | §1.6 | AST 锁链第 12 处
- `CHN-9` | channel visibility (PROGRESS 待补占号) | ✅ (本次 main) | TBD | 见 §1

### direct-message (DM)
- `DM-4` | agent message edit (last-write-wins) | ✅ #(战马D) | dm §2 | spec #523
- `DM-5` | reaction summary (复用 CV-7) | ✅ #549 | §2 | 0 server
- `DM-6` | thread reply (复用 reply_to_id) | ✅ #556 | §2 | 0 server production
- `DM-7` | edit history audit | ✅ #558 | §2 + §13 | schema v=34 + UpdateMessage SSOT + owner-only history GET
- `DM-8` | bookmark (占号, 待落) | ⏸️ Phase 5? | TBD | 见 admin-godmode 总表 §2 ②

### realtime / data-layer / client-shape / admin-model / concept-model
- `RT-3` | 多端全推 + 活物感 ⭐ | ⏸️ pending | realtime §3 | 取代 RT-2
- `DL-4` | PWA Web App Manifest + Web Push + VAPID | ✅ #490 + #518 (DL-4 zhanma-d signoff) | data-layer §4 | 6/7 实施 + 1 ⏸️
- `ADM-1` | 用户隐私承诺页 ⭐ G4.1 SIGNED | ✅ #455+#459+#483 | admin §4.1 R3 | 三色锁 (allow/deny/impersonate)
- `ADM-2` | 分层透明 audit + impersonate | ✅ #484 | admin §1.4 R3 | schema v=22+v=23 + 5 endpoints
- `CM-5` | agent↔agent 独立协作 (X2 冲突裁决) | ✅ #463+#473+#476 | concept §4 | 0 server 实施代码新增

---

## §3 G4.audit 整合建议 (Phase 5 启动前必修)

1. **AL-6 / AL-9 占号确认** (高优): 飞马跟 PROGRESS 对账 — AL-6 占号是否真被 AL-9 替, 若是补 PROGRESS line `~~AL-6~~` strikethrough + AL-9 实占号; 若不是, 补 AL-6 占号 spec 锚.
2. **AP-4 双义决议** (高优): G4.audit 决议 PR #551 重命名 `AP-4-reactions` 还是 PROGRESS line 273 重命名 `AP-4-capability-enum`. **野马倾向**: PR #551 已 merged, 保持 PR title 但 PROGRESS line 273 重命名 `AP-4-capability-enum (占号 v3+)`.
3. **HB-3 / HB-3-v2 / HB-3.1 / HB-3.2 拆段统一** (中优): 跟 AL-1/AL-2 wrapper 同模式 — `HB-3-wrapper` (4 件套) + sub `HB-3.1/3.2/-v2`.
4. **HB-5 占号补** (中优): DM-7 锁链已提到 HB-5, PROGRESS 缺占号行, 补 `HB-5 (TBD heartbeat-* milestone)`.
5. **CHN-9 visibility 补 PROGRESS** (低): 本次 main 已含代码, PROGRESS line 235 缺占号.
6. **DM-8 bookmark 占号锚** (低): admin-godmode 总表 §2 ② 已占号 v3+, PROGRESS 补 line.
7. **canonical-id 顶部头注规范** (低): 各 milestone spec / stance / content-lock 顶部统一加 `> canonical-id: <id>` 一行 (跟 ADM-1 `g4.1-adm1-yema-signoff.md` 头注同模式), 反向 grep 锚 G4.audit CI 守.

**收口闸**: G4.audit 飞马 v1 fill 时把以上 7 项作为 audit checklist 一段 (≤15 行), 跟 G3.audit `docs/implementation/00-foundation/g3-audit.md` 同模式.

---

## §4 更新日志

| 日期 | 作者 | 变化 |
|------|------|------|
| 2026-04-30 | 野马 | v0 — Phase 4 ~50 milestone canonical-id 表 (按 6 module group) + §1 命名冲突 9 类识别 (HB-3 v2 / AP-4 双义 / AL-6→AL-9 / DM-7 spec 重复 / AL-1 wrapper / AL-2 wrapper / CV-2-v2 / BPP-3 拆段 / CHN-9 占号) + §3 G4.audit 整合建议 7 项 (Phase 5 启动前必修). 跟 PR #568 Phase 4 stance + PR #571 admin god-mode 总表同模式跨链收口. |
