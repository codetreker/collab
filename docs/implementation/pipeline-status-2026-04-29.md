# Pipeline status — 2026-04-29

> 战马D · 2026-04-29 · pipeline 状态快照, docs only.
> 范围: 当日 (2026-04-29) merged + open PR + Phase 5 完成度估算.

## 1. 当日 merged PRs (47 个, 按时间顺序)

### Phase 4 启动 / Privacy & Auth (晨)
- **#454/#458** chore(al-2a/al-1b): content-lock + stance v0
- **#456** docs(impl): Phase 4 entry checklist (8 接力路径 + G4 退出 gate)
- **#457** feat(al-1b.2): server 5-state GET + BPP 单源 PATCH 405
- **#459** test(adm-1): e2e privacy promise + G4.1 双截屏
- **#460** docs(bpp-2): 4 件套 v0 — Phase 4 plugin-protocol 主线起步
- **#461/#462/#467** docs/al-1b.3 client SPA dot UI + reason count audit
- **#463/#465/#471** spec(cm-5/al-2b/al-2b.2): 三 spec brief
- **#464** docs(adm-1): closure (acceptance 9/11 ✅)

### 协议 + skills (中段)
- **#473/#474/#477/#478/#479** chore(skills): 一 milestone 一 PR + worktree + 禁 admin bypass
- **#486/#495** chore(skills/CLAUDE.md): cron + test timeout 血账

### Phase 4 milestones (中下)
- **#480** feat(al-2a): config 表 + update API
- **#481** feat(al-2b): BPP agent_config 双向 frame
- **#482** feat(al-1b): busy/idle 5-state 三段全闭
- **#483** feat(adm-1): PrivacyPromise + SettingsPage 用户隐私承诺页
- **#484** feat(adm-2): 分层透明 audit + admin god-mode
- **#476** feat(cm-5.2): server agent↔agent 协作路径

### Phase 4 + 起步 Phase 5 主轴 (午)
- **#485** feat(bpp-2): plugin protocol dispatcher + task lifecycle
- **#488** ⭐ feat(rt-3): 多端全推 + thinking subject 反约束
- **#489** feat(bpp-3): plugin frame dispatcher + AL-2b ack ingress
- **#491** spec(hb-1): install-butler — host-bridge install daemon
- **#492** feat(al-1): agent state machine + state-log + 6-reason 第8处
- **#493** feat(ap-1): ABAC HasCapability SSOT + capabilities 白名单
- **#494** feat(bpp-3.1): permission_denied BPP frame

### perf / refactor / ci 稳健化 (下午)
- **#496** refactor(reasons): internal/agent/reasons SSOT 包 (6 dedupe)
- **#497** perf(test): 4.5× speedup (t.Parallel + WAL skip + sleep dedup)
- **#498** feat(bpp-3.2): owner DM 一键 grant + plugin retry
- **#499** feat(bpp-4): heartbeat watchdog + dead-letter audit
- **#500** chore(ci): cov 阈值 85→84 (race-flake 抖动)
- **#501** perf(test): JWT clock injection — 38× token_rotation
- **#502** ci(test): race + cov 两 job 拆并行 (race-flake 真根因杀)
- **#504** perf(test): SerializeSchema API ship (integration deferred)
- **#505** fix(e2e): chn-4 flake — toHaveCount auto-retry
- **#506** perf(test): AST scan reusable lint package

### Phase 5 候选起步 (晚)
- **#490** feat(dl-4): web push subscriptions schema + REST
- **#503** feat(bpp-5): plugin reconnect handshake + cursor resume
- **#507** feat(hb-3): host_grants schema SSOT + REST CRUD + 弹窗 UX
- **#509** ⭐ feat(hb-4): host-bridge release gate ≥10 硬条件
- **#508** feat(dm-3): agent-DM 多端 cursor sync (0 server 新增)
- **#511** chore(registry): post-Phase 5 audit (totals 303→324 修)

## 2. In-flight PRs (4 个)

| PR | branch | mergeState | 内容 |
|---|---|---|---|
| #510 | feat/chn-4-wrapper | DIRTY | CHN-4 wrapper — e2e fixture-based 真根因修 (战马D) |
| #512 | feat/al-2-wrapper | BLOCKED | ⭐ AL stack release gate ≥12 (zhanma-a) |
| #513 | docs/skill-block-subagent | CLEAN | teamlead 阻塞操作派 subagent (铁律) |
| #514 | fix/bpp32-system-dm-test | BLOCKED | BPP-3.2 grant DM query 修 (subagent fix) |

**Note**: AL-5 实施 (commit `3002457` on `feat/al-3`) 待 #514 合后 rebase + open PR.

## 3. Phase 5 完成度估算

| 主轴 | 已闭 | in-flight | 完成度 |
|---|---|---|---|
| **host-bridge** (HB-*) | HB-3 #507 / HB-4 #509 ⭐ + HB-1 spec #491 | HB-2 实施待派 | **~75%** |
| **runtime** (AL-* / RT-*) | AL-1 #492 / AL-1b #482 / AL-2a #480 / AL-2b #481 / RT-3 #488 ⭐ | AL-5 ready ⏸️ / AL stack gate #512 | **~85%** |
| **plugin-protocol** (BPP-*) | BPP-2/3/3.1/3.2/4/5 全闭 | — | **~95%** |
| **permission** (AP-* / ADM-*) | AP-1 #493 / ADM-1 #483 / ADM-2 #484 | — | **~90%** |
| **canvas** (CV-*) | CV-1/2/3/4 全闭 | CV-2 v2 spec #cv-2 ready ⏸️ | **~90%** |
| **协作场** (CHN-* / DM-*) | CHN-1/2/3/4 + DM-2/3 全闭 | CHN-4 wrapper #510 ⏸️ | **~95%** |

总评: Phase 5 主线 **~88% 完成度**, 待收尾 4 in-flight PR + AL-5/CHN-4 wrapper.

## 4. 留账 follow-up (各 milestone REG-* ⏸️)

- **REG-AL3-008/-010b/-011** AL-3 v2 (server presence.changed push frame + e2e + cross-org + ADM-2 god-mode)
- **REG-AL4-006..010** AL-4 server/client follow-up flip (待 PR audit)
- **REG-CV4-006..009** CV-4 server iterate API + AL-4 wire
- **REG-DL4-002..006** DL-4 server gateway + client subscribe + admin diagnostic
- **REG-RR-006..008** REFACTOR-REASONS — AL-1 store path + client SPA SSOT + Reason* deprecation
- **REG-PSS-006/007** PERF-SCHEMA-SHARED integration into NewTestServer (ROI 1.6%)
- **REG-PJC-006/007** PERF-JWT-CLOCK — server-side verify clock + auth_coverage_test
- **REG-CSRC-005/006/007** CI-SPLIT-RACE-COV — ruleset required-checks + cov ratchet 渐升
- **REG-AL-006..008** PERF-AST-LINT — BPP-5 #503 + CM-5.1 #473 + vet analyzer 升级
- **REG-CHN1-006..010** CHN-1 follow-up flip (chn-4 wrapper PR 后)
- **REG-DM3-006/007** DM-3 — server cursor sync wire + ws push 真路径

## 5. 跨 milestone byte-identical 锁链承袭

- **AL-1a 6 reason 第 8 处**: AL-1a #249 → AL-3 #305 → DM-2 #321 → CV-4 #380 → AL-2a #454 → AL-1b #458 → AL-2b #481 → AL-1 #492 → REFACTOR-REASONS #496 SSOT
- **CHN-4 DM 永不含 workspace tab 7 源**: #354 ④ + #353 §3.1 + #357 ② + #364 + #371 + #374 + chn-4 stance
- **MentionArtifactPreview 二元 🤖↔👤 五处**: CV-1 #347 + CV-2 v1 #355 + DM-2 #314 + CV-4 #380 + (CV-2 v2 5th)
- **cursor 共一根 sequence**: RT-1 #290 + AL-2b #481 + CV-* + BPP-3.1 #494 + DM-3 #508
- **owner-only ACL pattern**: anchor #360 + AL-2a #480 + BPP-3.2 #498 + AL-1 #492 + AL-5 (待开)

## 6. Phase 6 预案 (PM 起步路径)

主轴: e2ee / cross-org / DRM / HLS / video transcoding / inline pdf / pre-Phase-6 cleanups (registry audit 跑齐 / docs/current sync / G5 退出闸框架).

---

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-29 | 战马D | v0 — pipeline status 快照 (47 merged + 4 in-flight + 6 主轴完成度 88% + 11 留账组). docs only, 不动任何 in-flight branch. |
