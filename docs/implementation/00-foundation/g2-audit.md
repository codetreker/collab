# G2 Audit — Phase 2 退出闸 (audit 集成) [DRAFT]

> 作者: 烈马 (QA) · 2026-04-28 · team-lead 派单 (idle 派活 #3)
> 目的: G1 audit 同款单源, Phase 2 全 milestone (ADM-0 / CM-onboarding / AP-0-bis / RT-0 / CM-3 后置 / G2.4 demo) 落地后, 闸 + audit row 一次集成审完。
> 形式: 此文件 = audit 报告 (草稿); 签字单独走 `docs/qa/signoffs/g2-exit-gate.md` (待落)。
> 状态: 🟡 **DRAFT** — ADM-0.3 (#223) + RT-0 server-half + G2.4 demo 5/5 签 三项 outstanding, audit row 数据待回填。

---

## 1. 闸概览

来源: `phase-2-exit-gate.md` (飞马 PR #221) + `execution-plan.md` §"Phase 2 退出 gate" (R3 锁)。

| 闸 | 主旨 | Trigger PR | Status (本文 cut: 2026-04-28) |
|---|---|---|---|
| G2.0 | ADM-0 cookie 串扰反向断言 (4.1.a/b/c/d) | #197/#201/#223 | 🟡 ADM-0.3 #223 in-flight — 4.1.d 待 v=10 落 |
| G2.1 | 邀请审批 E2E (Playwright + ws push) | #195+#198+RT-0 server | ⏳ INFRA-2 + CM-4 代码就位; e2e spec 锁 (cm-4-realtime.spec.ts `.skip`) — server push 落后 1 行 diff 启用 |
| G2.2 | 离线 fallback E2E | RT-0 + presence stub | ⏳ 待 RT-0 + G2.5 落 |
| G2.3 | 节流不变量 (B.1) | (待派) | ⏳ 单测未挂; 代码可能 RT-0 之后追加 |
| G2.4 | 用户感知签字 (B.2, ⭐) | #199+#213 + demo run | 🟡 partial 2/5 — 野马 spec 落, 截屏 #1/#5 ready, #2/#3/#4 待 AL-1b + e2e |
| G2.5 | presence 接口契约 | RT-0 task #40 | ⏳ 路径未建 |
| G2.6 | /ws → BPP schema 等同性 lint | RT-0 task #40 | ⏳ frame_schemas.go ↔ event_schemas.go byte-identical lint 待飞马挂 |
| G2.audit | v0 代码债登记 | 本文 §3 | 🟡 起表 #212; 完表本文 |

通过判据 (引): G2.0 完整 (ADM-0.3 落) + G2.1-G2.4 全 ✅ (野马签 + 截屏 5/5) + G2.5/G2.6 (RT-0 落) + G2.audit 6 项齐。

---

## 2. 闸闭合情况 (待回填)

### 2.1 G2.0 — ADM-0 4.1.a/b/c/d 反向断言 (待 ADM-0.3 merge 后回填)

ADM-0.2 #201 已落 a/b/c (TestAuthIsolation_2A/2B/AdminFieldWhitelist),
ADM-0.3 #223 4.1.d post-migration `users WHERE role='admin'` count==0 由
`internal/migrations/adm_0_3_users_role_collapse_test.go::TestADM03_BackfillAndCollapse`
反向断言, 同包 `Idempotent / PreexistingAdminLogin / TolerantToTrimmedSchema /
NoUsersTable` 4 个补充 case 覆盖二跑 + bootstrap 共存 + trimmed schema 容错。

**Pending**: PR #223 merge 后回填实测命令输出 (5/5 cases pass) + 红线 grep
`grep -rn '"admin"' internal/ --include='*.go' | grep -v _test.go | grep -v migrations/`
仅余 4 处注释/字面量 (no live `role == "admin"` 短路)。

### 2.2 G2.1 — 邀请审批 E2E (待 RT-0 server-half 落)

CM-4 客户端代码 (PR #198 + RT-0 client #218) 全就位; cm-4-realtime.spec.ts
`test.describe.skip` 锁形完整, 等 server push merge 后 1 行 diff 启用。
野马 G2.4 hardline 链路: 邀请 → owner bell badge ≤ 3s, stopwatch fixture 已落
INFRA-2 #195。

### 2.3 G2.6 — BPP schema 等同性 lint (待飞马挂)

RT-0 #218 client TS 接口与 server Go struct 字段顺序对齐 (注释明示
`BPP-byte-identical` 锁), 但 CI lint `bpp/frame_schemas.go ↔
ws/event_schemas.go` byte-identical diff 检查未上 — 需 RT-0 server PR + 飞马
lint job 双就位。

---

## 3. G2.audit row — Phase 2 跨 milestone 代码债登记 (草稿)

| Audit ID | Source | 内容 (单行) | 接收 milestone | Status |
|---|---|---|---|---|
| AUD-G2-ADM03-a | ADM-0.3 (#223) | SQLite `users.role IN ('member','agent')` 硬 CHECK 后置 (ADD CONSTRAINT post-create 不支持; 现 v=10 由数据不变量 + 反向断言保证, hard-flip 走 CREATE TABLE _new + RENAME) | Phase 3 (TBD) | 📝 logged |
| AUD-G2-ADM03-b | ADM-0.3 (#223) | `sessions` 表 step-2 vacuous gate — 现 v0 JWT 无状态, hasTable() 容错; BPP 引入 user-session 表后此 gate 自动激活, session-revoke E2E 也后置至彼时 | Phase 4 / BPP | 📝 logged |
| AUD-G2-RT0-a | RT-0 client #218 + server (待开 PR) | `/ws` Phase 2 路径仅过渡, BPP-1 启用后 `hub.Broadcast → bpp.SendFrame` 1 行替换; 客户端 schema 0-改 by `frame_schemas.go ↔ event_schemas.go` byte-identical CI lint | Phase 4 / BPP-1 | 📝 logged |
| AUD-G2-RT0-b | RT-0 (待开) | 60s 轮询 fallback (Sidebar.tsx) 保留为 belt-and-suspenders; CM-4.3 删除条件: BPP 保证 redelivery 之后 | Phase 4 (CM-4.3) | 📝 logged |
| AUD-G2-CM-onboard | CM-onboarding (#203) | system user (`role='system'`) disabled-flag 直查并防注册 — bug-030 hotfix `ListChannelsWithUnread` 系统成员路径 (REG-INV-003 守门) | (持续) | ✅ stable |
| AUD-G2-AP0-bis | AP-0-bis (#206) | `idx_user_permissions_user` 索引 retire 评估推迟 — 现读路径仍走 join, 索引复用率 100%, 删之前需先做 EXPLAIN audit (G1-audit §3.5 已记) | Phase 3 (TBD) | 📝 logged |
| AUD-G2-CM3 | CM-3 (#208) | owner_id 列保留 (没删) — read 路径不读, write 时双写; ADM-0.3 落地后再评估 retire (G1.audit AUD-G1-CM3-b 续) | Phase 3 (TBD) | 📝 logged |
| AUD-G2-CHECK | (跨) | 节流不变量 (G2.3) 单测未挂, 代码 hooks 也未落; B.1 节流策略 v0 实现 + `internal/notify/throttle_test.go` 待派 | Phase 2 收尾 / Phase 3 | 📝 logged |

`📝 logged` = Phase 3 输入或长期跟踪, 不阻塞 Phase 2 退出; `✅ stable` 已闭合。

> **填充节奏**: ADM-0.3 #223 merge 后, 战马A 提供 audit row 实测命令输出, 烈马
> 落 §2.1; RT-0 server-half PR merge 后, 烈马回 §2.2/§2.3 + 写 G2.4 demo 5/5 签字。

---

## 4. Phase 2 退出闸结论 (待签)

**待 8 项就位**: ADM-0.3 merge ✅ (待 #223) + RT-0 server-half merge ✅ (待开 PR) + G2.4 demo 5/5 签 ✅ (野马 partial 2/5) + G2.6 BPP lint 落 ✅ (飞马待挂) + audit row 8 行实数据回填 ✅。

8 项就位后, 此文件转 v1 + `docs/qa/signoffs/g2-exit-gate.md` 三人签 + registry
ADM-0/RT-0/CM-onboarding 全 🟢 (现 ADM-0 7/10, RT-0 0/8, CM-onboarding 5/13)。

---

## 5. 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-28 | 烈马 | v0 草稿 — 闸概览 + audit row 8 行登记骨架; 待 ADM-0.3 + RT-0 server merge 后回填实数据 |
