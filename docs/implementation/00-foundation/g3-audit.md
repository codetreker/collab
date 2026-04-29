# G3 Audit — Phase 3 退出闸 (audit 集成) — v1 fill

> 作者: 战马A v0 skeleton + 飞马 v1 fill · 2026-04-29 · team-lead Phase 3 退出 gate 收尾派活
> 目的: G1 / G2 audit 同款单源, Phase 3 全 milestone (RT-1 / CHN-1 / AL-3 / BPP-1 / CV-1 / CV-2 / CV-3 / CV-4 / DM-2 / CHN-2 / CHN-3 / CHN-4) 落地后, 闸 + audit row 一次集成审完.
> 形式: 此文件 = audit 报告 (战马 skeleton, 飞马填实); 签字单独走 `docs/qa/signoffs/g3-exit-gate.md` (待落); evidence 走 `docs/evidence/g3-exit/README.md` (#442).
> 状态: 🟢 **v1 fill** — 飞马 fill 闸闭合详情 + audit row 6 项触发条件 + 通过判据齐.
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

**飞马 v1 fill** (闸闭合摘要 + 跨 milestone byte-identical 链承认):
- **闸闭合**: artifact 创建 (CV-1.2 #342 server `POST /channels/:id/artifacts`) → commit 触发 ArtifactUpdated frame (RT-1.1 #290 cursor.go:48-57 7 字段 `{type, cursor, artifact_id, version, channel_id, updated_at, kind}`) → client backfill ≤3s + 离线 30s × 5 (RT-1.2 #292) + BPP session.resume 三 hint (RT-1.3 #296) → CV-1.3 #346 `useArtifactUpdated` hook pull-after-signal (line 106) + CONFLICT_TOAST `内容已更新, 请刷新查看` (line 49) → CV-1.3 e2e #348 真 4901+5174 ≤3s contract.
- **跨 milestone byte-identical 链**: ArtifactUpdated frame 7 字段是 5-frame envelope 共序之首 (后续 AnchorCommentAdded 10 / MentionPushed 8 / IterationStateChanged 9 / RT-1 7 共一根 hub.cursors.NextCursor() 单调发号; type/cursor 头位 byte-identical; BPP-1 #304 envelope CI lint reflect 自动覆盖).
- **REG**: REG-CV1-001..017 全 🟢 + REG-RT1-001..010 全 🟢 (regression-registry.md).

### 2.2 G3.2 — 锚点对话 E2E ✅

**Evidence path** (G3 evidence bundle §2 同源):
- 实施: CV-2.1 #359 (schema v=14 双表) + CV-2.2 #360 (server REST + WS push 10 字段 byte-identical) + CV-2.3 #404 (client SPA — 选区→锚点 entry + thread side panel + WS push 接入) + REG-CV2 #421
- Tests: `cv-2-3-anchor-client.spec.ts` 4 cases PASS + 4 文案锁 byte-identical (#355 文案锁 ① ② ③ ④ 同源)
- AnchorCommentAddedFrame 10 字段 byte-identical (`{type, cursor, anchor_id, comment_id, artifact_id, artifact_version_id, channel_id, author_id, author_kind, created_at}`) — author_kind 命名拆 commit 之 committer_kind
- REG-CV2-001..005 全 🟢

**飞马 v1 fill** (闸闭合摘要 + 烈马 acceptance signoff doc 锚 + 跨 milestone byte-identical 链承认):
- **闸闭合**: 选区 → 锚点入口 (CV-2.3 #404 client SPA `<ArtifactPanel>` 选区 entry button owner-only DOM) → `POST /artifacts/:id/anchors` (CV-2.2 #360 server, owner-only 立场 ① + version pin 立场 ② immutable artifact_version_id PK 钉死) → AnchorCommentAddedFrame WS push (10 字段 byte-identical, type/cursor 头位跟 5-frame 同模式) → client thread side panel (按 start_offset 排) + WS 实时刷; e2e §3.1 选区创锚 + §3.2 thread 列 + §3.5 agent 反约束三连 (`anchor.create_owner_only` 403 + agent-only thread 反断 + cross-anchor agent→agent 0 hit) + §3.6 resolve 折叠 PASS.
- **烈马 acceptance signoff doc**: `docs/qa/signoffs/g3.2-cv2-lima-signoff.md` (TBD follow-up, 跟 `g3.3-cv1-yema-signoff.md` #403 同模式 — 5/5 验收 + REG-CV2-001..005 全 🟢 链承认).
- **跨 milestone byte-identical 链**: anchor_comments.author_kind 列名 (cv_2_1_anchor_comments.go) ↔ AnchorCommentAddedFrame.AuthorKind json:"author_kind" (anchor_comment_frame.go) ↔ #355 文案锁立场 ⑤ ↔ cv-2 acceptance §1.2 = 4 源 byte-identical, 不复用 CV-1 committer_kind 命名 (anchor 是评论作者非 commit 提交者).
- **REG**: REG-CV2-001..005 全 🟢.

### 2.3 G3.3 ⭐ — 用户感知签字 (CV-1) ✅ SIGNED

**已 SIGNED** (#403 野马 PM, 2026-04-29, signoff doc `docs/qa/signoffs/g3.3-cv1-yema-signoff.md`):
- 5/5 验收通过 (artifact 归属 channel / 单文档锁 30s + 409 conflict / 版本线性 + rollback DOM gate / kindBadge 二元 / ArtifactUpdated frame 7 字段)
- 关键截屏 3 张路径承认 (跟 #391 §0 byte-identical 同源, follow-up Playwright `page.screenshot()` 入 git)
- 跨 milestone byte-identical 链锁字面源头 (kindBadge 五处单测锁源头 / CONFLICT_TOAST / fanout / rollback gate / 5-frame envelope 共序)

**飞马 v1 fill** (G3.3 SIGNED 状态承认 + 链入 G3 closure announcement):
- **状态**: ✅ SIGNED 锁死 — 不再回滚, 后续闸状态 (G3.1/G3.2/G3.4/G3.audit) 闭合后直接进 closure announcement, G3.3 不再独立闸.
- **链入 closure**: G3 closure announcement (`docs/qa/signoffs/g3-exit-gate.md` 待落) 引 #403 5/5 验收 + 3 张截屏路径 (跟 #391 §0 byte-identical) + 跨 milestone byte-identical 5 链 (kindBadge 五处单测锁源头 / CONFLICT_TOAST / fanout / rollback gate / 5-frame envelope 共序) 作为 Phase 3 用户感知签字承认.

### 2.4 G3.4 — 协作场骨架 (CHN-4) E2E + 双 tab 截屏 ✅ READY

**Evidence path** (G3 evidence bundle §4 同源):
- 实施: CHN-4 #411 (client + 双 tab + G3.4 双截屏) + CHN-4 #423 (follow-up 反约束兜底 + 跨 org + 2 边界态截屏) + CHN-4 #428 closure (acceptance + REG + PROGRESS)
- 依赖链全闭: CHN-1 ✅ + CHN-2 ✅ (#406/#407/#413) + CHN-3 ✅ (#410/#412/#415/#422/#425) + CV-1 ✅ + CV-2 ✅ + CV-3 ✅ (#396/#400/#408/#424/#425) + CV-4 ✅ (#405/#409/#416) + DM-2 ✅ (#361/#372/#388)
- 三签依据: 战马 e2e PASS + 烈马 acceptance 全 ✅ (#428) + 野马 双 tab 截屏文案锁验 (3 张已 landed: g3.4-cv3-markdown / g3.4-cv4-iterate-pending / g3.4-cv4-iterate-error-baseline; 5 张 ⏸️ 待 follow-up `page.screenshot()` 入 git)

**飞马 v1 fill** (闸闭合摘要 + 跨 milestone byte-identical 链承认):
- **闸闭合**: ChannelView 双 tab `data-tab="chat|workspace"` byte-identical (#411 client wiring) + DM 视图无 workspace tab `if channel.type==='dm' return null` (CHN-2 立场 ② 7+ 源 byte-identical 永久锁) + workspace tab 三 kind artifact (markdown / code / image_link 跟 CV-3 #370 ① 同源) + agent 🤖 角标二元 (CV-1 #347 line 251 五源 byte-identical) + iterate 按钮 owner-only (#380 ①) + anchor sidebar 仅 markdown (CV-2 §4 反约束); 走真 4901+5174 不 mock + runtime stub 注释字面 `// CV-4 runtime stub: direct owner commit (not server mock)` 区分两层 (#378 立场 ③); e2e ≤3s 真过 + 烈马 acceptance ✅ #428.
- **跨 milestone byte-identical 链**: kindBadge 五处单测锁 (#347 line 251 + #355 ④ + #314 ② + #380 ④ + #382 ②) / CONFLICT_TOAST `内容已更新, 请刷新查看` (CV-1.3 line 49) / fanout `{agent_name} 更新 {artifact_name} v{n}` (artifacts.go:591) / rollback owner-only DOM gate (`showRollbackBtn = isOwner && !isHead && !editing` line 254) / 5-frame envelope 共序 (RT-1=7 / AnchorCommentAdded=10 / MentionPushed=8 / IterationStateChanged=9 + AL-4 emit BPP-1 既有 frame 不裂 namespace).
- **三签依据**: 战马 e2e PASS (#411+#423) + 烈马 acceptance ✅ (#428) + 野马双 tab 截屏文案锁验 (3 张已 landed + 5 张 ⏸️ 待 follow-up `page.screenshot()` 入 git, 不阻 closure 但同 PR 闭).
- **REG**: REG-CHN4-001..022 全 🟢 (依赖链 CHN-1/2/3 + CV-1/2/3/4 + DM-2 全 🟢).

---

## 3. G3.audit row — 6 项跨 milestone 留账 (战马 skeleton, 飞马 fill)

> 跟 G1.audit / G2.audit 同模式 — 跨 milestone 实施时发现的代码债 / 留账, 一行一项, 飞马 fill 触发条件 + 处理 Phase + 验收锚.

| audit 项 | 来源 PR / milestone | 触发条件 | 处理 Phase | 飞马 fill v1 |
|---------|---------------------|---------|-----------|--------------|
| **A1** CHN-3 作者删 group 路径 lazy 90d GC cron — `user_channel_layout` 表无 ON DELETE CASCADE, 作者删 group 不阻塞但留 layout 行孤儿 | #410 + #412 (CHN-3.1+3.2) | 作者删 group + 90 天后 cron 跑 lazy GC | Phase 4+ cron job | **触发条件**: 作者 `DELETE /channels/:id/groups/:group_id` (CHN-1 #286 既有 endpoint 不阻塞) → `user_channel_layout` 行 group_id 失效但保留; **GC SQL**: `DELETE FROM user_channel_layout WHERE group_id NOT IN (SELECT id FROM channel_groups) AND updated_at < strftime('%s','now','-90 days')*1000`; **频率**: 每日 0:00 UTC 1 次 (单实例 cron, 跟 AL-1a 节流 in-memory 同精神, Redis 留 Phase 5+); **验收锚**: Phase 4 cron job milestone 接, 反向断言 90 天前孤儿行 count==0 + 作者侧 channel_groups CRUD 行为不破 (CHN-1 #286 e2e 同源); **反约束**: 不在 CHN-3.2 PR 路径写 cron (cron 是独立 Phase 4 milestone, CHN-3 仅留账) |
| **A2** AL-4 hermes plugin 占号 (v1 仅 openclaw) — `process_kind` enum 'hermes' 占号但 v1 不实施, v2+ 加 | #398 (AL-4.1) | v2+ 启用 hermes runtime 时 | Phase 5+ | **v2+ 启用条件**: BPP-2 plugin 协议 v2 落地 (蓝图 §2.2 v2 务实边界字面 — Hermes runtime 真接通 + 跨 plugin 协议兼容), 触发 `agent_runtimes.process_kind='hermes'` server validation 由 reject (v1 CHECK 报错) 改 accept; **migration 路径**: 不动 schema CHECK (enum 已含 'hermes' 占号), 仅 server `internal/api/runtimes.go` 删 `if process_kind == 'hermes' reject` (v1 锁); **兼容性**: openclaw 老 runtime 不破 (CHECK 仍含两值), agent 详情页 4 态 badge UI (#398 client) 自动支持; **反约束**: v1 不前置 hermes 实施 (蓝图 §2.2 字面 "v1 only OpenClaw"); **验收锚**: BPP-2 milestone 接, e2e 反向断言 hermes runtime 创建 200 + 老 openclaw runtime 不影响 |
| **A3** CV-4 iterate retry 路径 (failed 不复用 iteration_id) — failed 态 owner 重新触发 = 新 iteration_id, 不复用 failed 行 (#380 ⑦) | #405 + #409 (CV-4.1+4.2) | 永不实施 (反约束 #380 ⑦ + #365 反约束 ②) | 永不实施 (反约束) | **永不实施理由**: (1) **隐式 bypass owner 决策**违反 CV-4 立场 ② "owner 触发 iterate 单源" 字面 (#365 §0 ② + #380 文案锁 ⑦); (2) **state machine 反断**: completed→running reject + failed→pending reject (#365 立场 ① state 转移图字面禁); (3) **autoRetry timer 隐式触发新 iteration** = 立场 ② 单源违反, 反向 grep `autoRetry.*iteration|setTimeout.*POST.*iterate.*failed` count==0 永久锁; **owner 重新触发路径**: 走 ① iterate 按钮路径 (新 iteration_id, 不复用 failed iteration_id) — 跟 CV-1 commit 单源同精神; **验收锚**: 永久反约束, regression-registry 不挂 (反约束清单走 spec/文案锁/acceptance 三源 byte-identical 锁) |
| **A4** AL-3.3 ADM-2 god-mode 元数据 (REG-AL3-011 ⚪) | #324/#327 (AL-3.3) | ADM-2 milestone 落地后 | Phase 4+ ADM-2 milestone | **ADM-2 接入条件**: ADM-2 admin SPA milestone 落地 (admin god-mode endpoint 元数据白名单设计完成); **flip 路径**: REG-AL3-011 当前 ⚪ pending (`docs/qa/regression-registry.md`), 翻 🟢 active 时 trigger PR 是 ADM-2 实施 PR; ADM-2 实施加 `GET /admin/presence` 元数据 only (跟 ADM-0 #211 god-mode 字段白名单同模式), **不返回** session_id/last_heartbeat_at 等敏感字段 (隐私 §13 红线); **验收锚**: ADM-2 milestone acceptance template §X.Y AL-3.3 god-mode 字段白名单反向断言, e2e admin token GET 不漏字段 + 业务用户 token 同 endpoint 路径走 403 |
| **A5** CHN-1 AP-1 严格 403 (REG-CHN1-007 ⏸️) | #286 (CHN-1.2) | AP-1 落时 flip 改断 status==403 | Phase 4 AP-1 milestone | **AP-1 落地条件**: AP-1 (access perms milestone) 实施 channel 严格权限 — 当前 CHN-1 #286 非 channel member `GET /channels/:id` 走 404 (隐藏存在性) + member-but-no-read-perm 走 403; AP-1 落地后**严格 403** = 即使非 member 也 403 (暴露 channel 存在但拒访问), 跟 GitHub repo 私有路径同模式; **flip 路径**: REG-CHN1-007 当前 ⏸️ deferred → AP-1 实施 PR trigger flip 🟢 active (改断 `status === 403` 而非 `404`); **验收锚**: AP-1 milestone acceptance template §X.Y CHN-1 反向断言 e2e 非 member token GET → 403 (不是 404) + 跟 owner-only 路径 (CV-1 rollback) 同模式 |
| **A6** 第 6 轮 remote-agent 安全 (蓝图 §4) | AL-4 spec | 二进制下载 / 沙箱 / 资源限制 / uninstall 留第 6 轮 | Phase 6+ | **第 6 轮 milestone scope**: (1) `remote_agent_binaries` 表 (binary hash + 签名 + version) — 防供应链攻击; (2) 沙箱 (Linux seccomp / macOS AppSandbox) — runtime 进程隔离; (3) 资源限制 (CPU/RAM/disk per agent) — 跟 AL-4 `agent_runtimes` 共表加 quota 列; (4) uninstall 路径 — owner 撤销 grant 时清理本地 plugin process; **优先级**: Phase 6 入口位 (蓝图 §4 字面 "Remote-agent / Host bridge" 留第 6 轮); 不阻 Phase 4/5 (AL-4 v1 仅锁 registry + 启停信号, 不管 remote-agent 怎么真起进程); **验收锚**: 第 6 轮 milestone spec brief + acceptance template + 安全 audit (binary 签名 + 沙箱 escape test + uninstall e2e) |

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
| 2026-04-29 | 飞马 | v1 fill — 状态 🟡 DRAFT v0 → 🟢 v1 fill. §2 4 闸闭合详情真填: G3.1 frame 7 字段 byte-identical 链承认 (5-frame 同模式头位 type/cursor) + REG-CV1+RT1 全 🟢; G3.2 4 文案锁 byte-identical (#355 ①②③④) + author_kind ↔ committer_kind 命名拆链承认 + 烈马 acceptance signoff doc TBD follow-up; G3.3 ✅ SIGNED 状态承认 (#403 锁死, 链入 G3 closure); G3.4 跨 milestone byte-identical 5 链锚 (kindBadge 五处单测锁源头 / CONFLICT_TOAST / fanout / rollback gate / 5-frame envelope 共序). §3 audit row 6 项触发条件 + 处理路径全填: A1 CHN-3 GC SQL + 每日 0:00 UTC 频率 + 反向断言孤儿 count==0; A2 AL-4 hermes BPP-2 启用条件 + server reject 删路径; A3 CV-4 retry 永不实施反约束三连承认 (#380 ⑦ + #365 ② state machine + autoRetry 0 hit); A4 AL-3.3 REG-AL3-011 ⚪→🟢 ADM-2 milestone trigger; A5 CHN-1 REG-CHN1-007 ⏸️→🟢 AP-1 milestone trigger 路径; A6 第 6 轮 remote-agent 安全 4 项 scope (binary 签名 / 沙箱 / 资源限制 / uninstall). 通过判据齐 → G3 closure announcement 接续位. |
