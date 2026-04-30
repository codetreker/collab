# AP-5 messages PUT/DELETE/PATCH post-removal fail-closed — 烈马 (QA acceptance) signoff

> **状态**: ✅ **SIGNED** (烈马 acceptance 代签, 2026-04-30, post-#555 merged + #575 cross-ACL e2e follow-up B)
> **范围**: AP-5 — messages 写路径 ACL audit, post-removal sender-only ACL 不足, 加 channel-member gate fail-closed (404)
> **关联**: 跟 AP-4 reactions ACL #551 + AP-1 ABAC SSOT + DM-4 sender-only ACL 三处同源; #575 双闸互动 e2e

## 1. 验收清单 (5 项)

| # | 验收项 | 结果 | 实施证据 |
|---|---|---|---|
| ① | PUT /api/v1/messages/{id} post-removal → 404 fail-closed (sender-only ACL 不足以放过 channel-member gate) | ✅ | acceptance §2.1 + `ap-5-messages-acl-matrix.spec.ts::§2.1 PUT post-removal → 404` PASS |
| ② | DELETE /api/v1/messages/{id} post-removal → 404 fail-closed | ✅ | acceptance §2.2 + `§2.2 DELETE post-removal → 404` PASS |
| ③ | PATCH /api/v1/channels/{id}/messages/{id} (DM-4 path) post-removal → 403/404 fail-closed (DM-only 路径或 channel-member gate 二选一) | ✅ | acceptance §2.3 + `§2.3 PATCH DM post-removal → 404 fail-closed (DM-4 path)` PASS |
| ④ | cross-org sanity — third-party 不能 PUT/DELETE foreign msg (private channel never joined) | ✅ | acceptance §2.4 + `§2.4 cross-org sanity` PASS [403, 404] |
| ⑤ | AP-5 × DM-4 双 ACL gate 互动 (yema audit follow-up B) — T0 PATCH 通过 → T1 owner remove → T2 PATCH 403/404 fail-closed; 反向 PUT/DELETE 也 fail-closed (双锁 §2.1+§2.2 同源) | ✅ | `ap-5-dm-4-cross-acl.spec.ts` (#575 a0f174f) 5× 连跑全绿 (296-333ms) |

## 2. 反向断言

- DM-4 sender-only ACL **不足以**放过 AP-5 channel-member gate — 两闸串联, 任一拒即拒
- post-removal sender 也不能 PUT/DELETE 自己的 message (cross-channel ACL audit fail-closed)
- REG-INV-002 cross-org / cross-member fail-closed 同源
- 跟 AP-1 ABAC SSOT + AP-4 reactions ACL + DM-4 sender-only 三处 ACL 同精神

## 3. 留账

⏸️ AP-5 follow-up — admin god-mode 不入 message ACL 路径 (反向 grep CI lint follow-up); ⏸️ G4.audit 飞马软 gate

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-30 | 烈马 | v0 — AP-5 acceptance ✅ SIGNED post-#555 merged + #575 双闸 e2e follow-up B. 5/5 验收 covers acceptance §2.1-§2.4 + cross-ACL §5. 跨 milestone byte-identical: AP-1 ABAC SSOT + AP-4 reactions ACL + DM-4 sender-only ACL + REG-INV-002 fail-closed 四处同精神. yema audit follow-up B closure 闭环 (#575 a0f174f 5× 全绿 deterministic). |
