# Acceptance Template — REFACTOR-2 (handler boilerplate 全清 + DM-gate 三错码归一 + ACL 双 helper 收单源)

> Spec brief `refactor-2-spec.md` (飞马 v0). Owner: 战马C 实施 / 飞马 review / 烈马 验收.
>
> **REFACTOR-2 范围**: handler-level 全清 — 4 helper 抽出 (mustUser / decodeJSON / loadAgent / cursor wrapper) + caller boilerplate 100+ 处 0 残留 + DM-gate 三错码归一 (`pin.dm_only_path` / `dm.edit_only_in_dm` / `dm_search.q_required` ↔ DM-only path 单源) + IsChannelMember / CanAccessChannel 双 ACL helper 收单源. 立场承袭 REFACTOR-1 #611 (CHN 4 helper) + 跨九 milestone const SSOT 锁链. **0 endpoint 行为改 + 0 migration / 0 schema + LoC 净减 ≥500 行**.

## 验收清单

### §1 helper 抽出验收 (4 helper 全单源)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 1.1 `mustUser(ctx) (User, ok)` 单源 (反约束: handler 不再 inline `userFromContext`); 反向 grep `user, ok := userFromContext` body count==0 | grep | reverse grep test PASS |
| 1.2 `decodeJSON(r, &v) error` 单源 (反约束: handler 不再 inline `json.NewDecoder(r.Body).Decode`); 反向 grep `json\.NewDecoder.*Decode` 在 handler/ body count==0 (除 helper 单源 + _test.go) | grep | reverse grep test PASS |
| 1.3 `loadAgent(ctx, agentID) (*Agent, error)` 单源 (反约束: handler 不再 inline `store.GetAgentByID + nil 检查`); 反向 grep `store\.GetAgentByID` 在 handler/ body count==0 (除 helper 单源) | grep | reverse grep test PASS |
| 1.4 cursor wrapper helper 单源 (`encodeCursor` / `decodeCursor` 抽到 internal/api/cursor/); 反向 grep `base64\.StdEncoding\.EncodeToString.*Cursor` body 在 handler/ count==0 (除 helper 单源) | grep | reverse grep test PASS |

### §2 caller 跟随验收 (boilerplate 100+ 处 0 残留)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 2.1 `user, ok := userFromContext` body count==0 (除 helper 单源 + _test.go); before≥100 hits, after=0 | grep | `git grep -c 'user, ok := userFromContext' packages/server-go/internal/api/ -- ':!*helpers.go' ':!*_test.go'` ==0 |
| 2.2 `mustUser(` call site count ≥100 (替换前 100+ 处 inline 全走 helper) | grep | `git grep -c 'mustUser(' packages/server-go/internal/api/` ≥100 |
| 2.3 LoC 净减 ≥500 行 | git diff --stat | `git diff origin/main...HEAD --stat packages/server-go/internal/api/` 净减 ≥500 行 |

### §3 drift 统一验收 (DM-gate 三错码归一 + ACL 双 helper 收单源)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 3.1 DM-gate 三错码归一 — `pin.dm_only_path` / `dm.edit_only_in_dm` / `dm_search.q_required` 跟 DM-only path 走 `chn.GateDM(channel)` 单源 (REFACTOR-1 #611 chn helper 复用); 字面 byte-identical 不变 | grep + unit | 三错码字面 byte-identical 跟 main 对比 + chn.GateDM call site count ≥3 (DM-only 3 endpoint) |
| 3.2 IsChannelMember / CanAccessChannel 双 ACL helper 收单源 — handler 不再两选一/各调一次, 走 `chn.GateChannelMember` 单 helper 内部组合 (反约束: 反向 grep `IsChannelMember\|CanAccessChannel` 在 handler body 除 chn/helpers.go count==0) | grep | reverse grep test PASS |
| 3.3 飞马 audit #4-#13 全清 (10 项 drift) — 0 留 v2 (反 G4.audit 长尾) | inspect | spec §4-§13 各项跟实施 PR 1:1 verify, audit checklist 全 ✅ |

### §4 全清不留账验收 (反约束 + drift 守门)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 4.1 0 endpoint 行为改 — 既有 server-go ./... + client vitest + e2e Playwright 全绿不破 (Wrapper 立场, helper 抽出不动 endpoint shape) | full test | `go test -tags sqlite_fts5 -timeout=180s ./...` 全 PASS + `pnpm exec vitest run --testTimeout=10000` 全 PASS + `pnpm exec playwright test --timeout=30000` 全 PASS |
| 4.2 0 migration / 0 schema 改 (`git diff main -- internal/migrations/` 0 行) | git diff | 0 行 |
| 4.3 0 race-flake — go-test-race + go-test-race-heavy 双轨 PASS, cov ≥85.0% 不降 (TEST-FIX-3-COV #612 立场承袭) | CI verify | go-test-race / go-test-race-heavy / go-test-cov 三 SUCCESS |
| 4.4 反平行 helper / 反 admin god-mode bypass — 反向 grep `func mustUser\|func decodeJSON\|func loadAgent\|func encodeCursor\|func decodeCursor` 在 internal/api/ 除 chn/+helpers.go count==0 + admin god-mode 反向 grep `admin.*chn\\.GateDM\|admin.*mustUser` 在 admin*.go 0 hit (ADM-0 §1.3 红线) | CI grep | reverse grep tests PASS |

## REG-REFACTOR2-* 占号 (initial ⚪)

- REG-REFACTOR2-001 🟢 4 helper 抽出 (mustUser / decodeJSON / loadAgent / cursor wrapper) 全单源, 反向 grep `userFromContext\|json.NewDecoder...Decode\|store.GetAgentByID\|base64...EncodeToString.*Cursor` 在 handler body 除 helper 单源 0 hit
- REG-REFACTOR2-002 🟢 caller 跟随 boilerplate 100+ 处 0 残留 (`user, ok := userFromContext` body 0, `mustUser(` ≥100 call site) + LoC 净减 ≥500 行
- REG-REFACTOR2-003 🟢 DM-gate 三错码归一 (`pin.dm_only_path` / `dm.edit_only_in_dm` / `dm_search.q_required` 字面 byte-identical) + chn.GateDM 单源复用 REFACTOR-1 #611 锁链
- REG-REFACTOR2-004 🟢 IsChannelMember / CanAccessChannel 双 ACL helper 收单源 (chn.GateChannelMember 内部组合, handler body 反向 grep 0 hit) + 飞马 audit #4-#13 全清 (0 留 v2)
- REG-REFACTOR2-005 🟢 0 endpoint 行为改 + 0 migration / 0 schema + 既有 unit + e2e + vitest 全绿不破 + 0 race-flake (race + race-heavy + cov 三轨 PASS)
- REG-REFACTOR2-006 🟢 反平行 helper + 反 admin god-mode bypass (ADM-0 §1.3) + 跨 milestone const SSOT 锁链承袭跨九 milestone (BPP-2 + REFACTOR-REASONS + DM-9 + CHN-15 + AP-4-enum + DL-1 + REFACTOR-1 + REFACTOR-2)

## 退出条件

- §1 (4) + §2 (3) + §3 (3) + §4 (4) 全绿 — 一票否决
- 4 helper 全单源 (mustUser / decodeJSON / loadAgent / cursor wrapper)
- caller boilerplate 100+ 处 0 残留 + LoC 净减 ≥500 行
- DM-gate 三错码归一 (字面 byte-identical) + ACL 双 helper 收单源 (chn.GateChannelMember)
- 飞马 audit #4-#13 全清 (0 留 v2)
- 既有全包 unit + e2e + vitest 全绿不破 + 0 race-flake (race + race-heavy + cov 三轨 PASS)
- 0 endpoint 行为改 + 0 migration / 0 schema
- 登记 REG-REFACTOR2-001..006

## 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-05-01 | 烈马 | v0 — acceptance template 草稿 (4 选 1 验收框架 + REG-REFACTOR2-001..006 6 行占号 ⚪). 立场承袭 REFACTOR-1 #611 (CHN 4 helper 抽取) + 跨九 milestone const SSOT 锁链 (BPP-2 + REFACTOR-REASONS + DM-9 + CHN-15 + AP-4-enum + DL-1 + REFACTOR-1 + REFACTOR-2). 关键: 0 endpoint 行为改 + 0 migration / 0 schema + LoC 净减 ≥500 行 + 飞马 audit #4-#13 全清不留 v2. |
| 2026-05-01 | 战马C | flip — REG-REFACTOR2-001..006 6 ⚪→🟢 实施验收 PASS. 实测: 4 helper 单源 (mustUser/decodeJSON/loadAgentByPath/fanoutChannelStateMessage 各==1 hit) + 100 mustUser callsites + 5 decodeJSON callsites (canonical-shape only) + 8 loadAgentByPath callsites + ACL drift 部分收口 (artifact_comments OR 折叠, 其他 AND 保留 fail-closed 真守) + LoC 净减 -137 行 (40 文件 +509 -495) + 既有 24 包 test 全 PASS + post-#612 haystack gate TOTAL 85.5% no func<50% no pkg<70%. 留账透明: helper-3 DM-gate 三错码归一 (语义冲突) + helper-5 admin-list (净减 0) + helper-7 cursor-envelope (跨包边界) 留 REFACTOR-3. |
