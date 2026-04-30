# G4 Acceptance Batch1 Signoff (烈马) — Phase 4+ milestone index

> 烈马 · 2026-04-30 · post AP-1 + BPP-3.1 + AL-1 + REFACTOR-REASONS + G4 batch ✅
> 跟 yema #574 G4.audit naming map 配对; 跟 reg-flip-batch4 #569 + batch5 #572 同期收口
> 范围: Phase 4+ 32 milestone acceptance template signoff queue

## §1 Phase 4+ milestone signoff 状态 (32 项)

| Milestone | Trigger PR | acceptance | signoff 状态 | 备注 |
|---|---|---|---|---|
| **AP-1** | #493 | ap-1.md ✅ | ✅ 烈马 (#493 d6625b2) | Phase 4 entry 8/8 收口 |
| **AP-2** | #525 | ap-2.md ✅ | ✅ 本批 (`ap-2-liema-signoff.md`) | expires_at sweeper |
| **AP-3** | #521 | ap-3.md ✅ | ✅ 本批 (`ap-3-liema-signoff.md`) | cross-org owner-only |
| **AP-4** | #551 | ap-4.md ✅ | ⏸️ 待 zhanma 签 | reactions ACL — 战马 验收 owner |
| **AP-5** | #555 | ap-5.md ✅ | ✅ 本批 (`ap-5-liema-signoff.md`) | post-removal fail-closed |
| **AL-1** | #492 | al-1.md ✅ | ✅ 烈马 (5e37650) | state machine wrapper |
| **AL-2 wrapper** | #512 | al-2-wrapper.md ✅ | ✅ 野马 (`al-2-wrapper-yema-signoff.md`) | release gate 硬条件 |
| **AL-5** | #516 | al-5.md ✅ | ⏸️ 待 zhanma 签 | error recovery — 战马 owner |
| **AL-7 / AL-8** | (specs) | al-7/8.md ⚪ | ⏸️ 未实施 | spec brief 落, 实施未到 |
| **BPP-2** | #485 | bpp-2.md ✅ | ✅ 烈马 (G4.3 batch) | dispatcher + task lifecycle |
| **BPP-3** | #489 | bpp-3.md ✅ | ✅ 烈马 (G4.5 covered) | plugin frame dispatcher |
| **BPP-3.1** | #494 | bpp-3.1.md ✅ | ✅ 烈马 (9c356b4) | permission_denied frame |
| **BPP-3.2** | #498 | bpp-3.2.md ✅ | ⏸️ 待 zhanma 签 | grant DM + retry |
| **BPP-4** | #499 | bpp-4.md ✅ | ✅ 本批 (`bpp-4-liema-signoff.md`) | watchdog + dead-letter |
| **BPP-5** | #503 | bpp-5.md ✅ | ⏸️ 待 zhanma 签 | reconnect handshake |
| **BPP-6** | #522 | bpp-6.md ✅ | ✅ 本批 (`bpp-6-liema-signoff.md`) | cold-start handshake |
| **BPP-7** | (#529 spec) | bpp-7.md ✅ | ⏸️ 待 zhanma 签 | SDK 真接入 |
| **BPP-8** | #532 | bpp-8.md ✅ | ✅ 本批 (`bpp-8-liema-signoff.md`) | lifecycle audit log |
| **CHN-7** | (TBD) | chn-7.md ✅ | ⚪ 未实施 | spec only |
| **CHN-9** | #554 | chn-9.md ✅ | ⏸️ 待 zhanma 签 | visibility 三态 |
| **CHN-4 wrapper** | #510 | chn-4-wrapper.md ✅ | ⏸️ 待 zhanma 签 | fixture-based e2e |
| **CV-2 v2** | #517 | cv-2-v2.md ✅ | ⏸️ 待 zhanma 签 | preview thumbnail + media |
| **CV-3 v2** | #528 | cv-3-v2.md ✅ | ⏸️ 待 zhanma 签 | thumbnail server CDN |
| **CV-4 v2** | #526 | cv-4-v2.md ✅ | ⏸️ 待 zhanma 签 | iteration timeline |
| **CV-7** | #535 | cv-7.md ✅ | ⏸️ 待 zhanma 签 | comment edit/delete/reaction |
| **CV-8 / CV-9 / CV-10..13** | (specs) | ⚪ | ⏸️ 未实施 | spec only |
| **CM-5** | #476 | cm-5.md ✅ | ✅ 烈马 (G4.4 batch) | agent↔agent 协作 |
| **DL-4** | #490 | dl-4.md ✅ | ✅ zhanma-d (#518) | Web Push + PWA |
| **DM-3** | #508 | dm-3.md ✅ | ✅ 本批 (`dm-3-liema-signoff.md`) | DM 多端 cursor sync |
| **DM-4** | (TBD) | dm-4.md ✅ | ⏸️ 待 zhanma 签 | message edit |
| **DM-5 / DM-6 / DM-7** | #549 / #553 / #560? | ✅ | ⏸️ 待 zhanma 签 | — |
| **HB-3 v2** | #507 | hb-3-v2.md ✅ | ⏸️ 待 zhanma 签 | host_grants schema SSOT |
| **HB-4** | (TBD) | hb-4.md ✅ | ✅ 野马 (`hb-4-yema-signoff.md`) | release-gate self-grep |

## §2 本批新签 (烈马 6 篇)

| signoff | 范围 | 行数 | PR# |
|---|---|---|---|
| `ap-2-liema-signoff.md` | expires_at sweeper 业务化 | ~40 | #525 |
| `ap-3-liema-signoff.md` | cross-org owner-only ABAC gate | ~40 | #521 |
| `ap-5-liema-signoff.md` | messages PUT/DELETE/PATCH post-removal | ~40 | #555 |
| `bpp-4-liema-signoff.md` | watchdog 30s + dead-letter audit | ~40 | #499 |
| `bpp-6-liema-signoff.md` | cold-start handshake + state re-derive | ~40 | #522 |
| `bpp-8-liema-signoff.md` | plugin lifecycle audit log 复用 admin_actions | ~40 | #532 |
| `dm-3-liema-signoff.md` | DM 多端 cursor sync 复用 RT-1.3 | ~40 | #508 |

## §3 缺 acceptance template milestone (待 liema 后续起)

- ⚠️ AL-7 / AL-8 — spec brief 落但实施未到 (acceptance template ⚪ pending)
- ⚠️ CHN-7 — spec only, 实施未到
- ⚠️ CV-8 / CV-9 / CV-10..13 — 6 spec only, 实施未到
- ⚠️ DM-5 / DM-6 — 实施可能已落 (#549 / #553), 待确认 acceptance template
- ⚠️ DM-7 — 跟 #560 配 (zhanma 验收)

## §4 留账

- ⏸️ ⏸️ 13 待 zhanma 签 (AP-4 / AL-5 / BPP-3.2/5/7 / CHN-9/4-wrapper / CV-2v2/3v2/4v2/7 / DM-4/5/6/7 / HB-3 v2): zhanma owner 验收, 不在烈马代签 scope
- ⏸️ 8 spec only 未实施 (AL-7/8, CHN-7, CV-8..13): 实施真落后 liema 起 signoff
- ⏸️ Phase 4 closure announcement (G4 entry 8/8 全签 ✅ + G4.audit yema 软 gate 链入飞马职责)
