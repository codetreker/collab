# REFACTOR-2 stance checklist — internal/api boilerplate 收口 (refactor only)

> 7 立场 byte-identical 跟 refactor-2-spec.md §0+§2. **真有 prod code refactor 但 0 行为改 / 0 schema / 0 endpoint / 0 client UI**. 跟 REFACTOR-1 #611 + DL-1 #609 + INFRA-3 #594 + TEST-FIX-1/2/3 同模式. content-lock 不需 (server-only). **scope 全清 — REFACTOR-1 留尾教训, #4-#13 全做不留 v2 (用户铁律)**.

## 1. 0 行为改 (refactor only)
- [ ] 0 endpoint shape 改 — `git diff origin/main -- internal/api/server.go | grep -E '\\+.*Method|\\+.*Register'` 0 hit
- [ ] 0 response body / 0 error code 字面改 — 既有错码 (`dm.*`/`pin.*`/`chn.*`/`auth.*`) before/after byte-identical
- [ ] 0 SLO 收紧 — 反"为绕 boilerplate 改 endpoint shape"
- [ ] 既有 unit + e2e 全 PASS byte-identical (反 race-flake, 跟 #612 cov 85% 协议承袭)

## 2. 0 schema / 0 endpoint / 不动 v 号
- [ ] `git diff origin/main -- internal/migrations/` 0 改
- [ ] `currentSchemaVersion` 不动 + `migrations/refactor_2_` 0 hit
- [ ] server.go register 新 endpoint 0 hit

## 3. helper 单源不复制 (mustUser / decodeJSON / loadAgent)
- [ ] 三 helper 各 internal/api/ 单源一份, 反 spam 多文件本地复制
- [ ] **黑名单 grep 真测**: `grep -rn "user, ok := userFromContext" internal/api/` 应降 0
- [ ] 0 新 `*_helpers.go` 复制 (单源在既有 helper 文件, 跟 REFACTOR-1 4 helper SSOT 承袭)
- [ ] Go idiom 命名锁 — `mustUser` / `decodeJSON` / `loadAgent` byte-identical (反 `getUser` / `parseJSON` / `fetchAgent` 漂)

## 4. DM-gate 三错码统一 (v0 选一字面)
- [ ] `layout.dm_not_grouped` / `dm.edit_only_in_dm` / `Forbidden` 三轨收单 (用户拍 v0 字面 byte-identical)
- [ ] 跟 REFACTOR-1 字面锁延伸 — DM-gate 字面值 byte-identical, 仅收 3 轨成 1 轨
- [ ] 反向 grep 收口验 — refactor 后单一字面 + 跨 spec/helper/单测三处对锁

## 5. IsChannelMember vs CanAccessChannel 双 ACL 收单源
- [ ] 双 ACL helper 收单源 — security correctness 真守 (反 drift)
- [ ] 复用 AP-4 #551 + AP-5 #555 既有 helper byte-identical (跟 DM-9/10/11/12 + DL-1 同模式)
- [ ] 反向 grep `^func.*(IsChannelMember|CanAccessChannel)` 各 count==1 (SSOT)
- [ ] anchor #360 owner-only 锁链 22+ PRs 承袭 + REG-INV-002 fail-closed
- [ ] admin god-mode 不挂 helper (反向 grep `admin.*IsChannelMember|admin.*CanAccessChannel` 0 hit)

## 6. scope 全清 (#4-#13 全做, 不留 v2)
- [ ] spec #4-#13 项全闭一次合, 反"留 v2 / 留 follow-up / 留 REFACTOR-3" 字面
- [ ] 跟 user memory `strict_one_milestone_one_pr` + `progress_must_be_accurate` 铁律承袭
- [ ] 反 REFACTOR-1 留尾教训 (用户铁律)

## 7. 测试全 PASS (0 改, 0 race-flake)
- [ ] 既有 unit + e2e 0 改 byte-identical (反 refactor 顺手改测试)
- [ ] 0 race-flake — 跟 TEST-FIX-2 #608 + TEST-FIX-3 #610 + #612 deterministic 协议承袭
- [ ] cov ≥85% 不降 (#612 协议, user memory `no_lower_test_coverage` 铁律)
- [ ] server-go ./... 全 25+ packages 全绿 (+sqlite_fts5)

## 反约束 — 真不在范围
- ❌ 文件名重命名 / 结构体名 audit (留 NAMING-1)
- ❌ 改 endpoint shape / response body / error code 字面
- ❌ 0 schema / 0 migration / 0 client / 0 acceptance / 0 content-lock 改
- ❌ 加新 CI step (跟 REFACTOR-1 + INFRA-3 + TEST-FIX-* 同精神)
- ❌ 加 helper 不在 spec 列表内 (反 REFACTOR-1 5 模式 reject 承袭)
- ❌ 留尾 v2 (用户铁律) / 为绕 boilerplate 改 endpoint shape (反 SLO 收紧)
- ❌ admin god-mode 加挂 (永久不挂, ADM-0 §1.3 红线)

## 跨 milestone byte-identical 锁链 (5 链)
- **REFACTOR-1 #611** 4 helper SSOT 承袭 + "留尾"反面教训
- **DL-1 #609** 4 interface 抽象同精神 (refactor 真有 prod code 类别)
- **AP-4 #551 + AP-5 #555** ACL helper 复用 (跟 DM-9/10/11/12 同模式)
- **anchor #360** owner-only ACL 锁链 22+ PRs 立场延伸
- **#612 cov 85% deterministic + TEST-FIX-1/2/3** race-flake 协议承袭

## PM 拆死决策 (3 段)
- **REFACTOR-2 #4-#13 scope 全清 vs REFACTOR-1 留尾拆死** — 一次合不分 v0/v1/v2 (用户铁律)
- **helper SSOT vs spam 复制拆死** — 单源 count==1 各 (反 N+ 散布 / 反 *_helpers.go 复制 / 反改 endpoint shape 绕)
- **DM-gate 三错码统一 vs drift 拆死** — v0 选一字面 byte-identical (反三轨 drift = user-facing 错码不一致 = security correctness 红线)

## 用户主权红线 (5 项)
- ✅ 0 行为改 (e2e + unit 全 PASS byte-identical)
- ✅ 既有 ACL gate 字面 + 行为 byte-identical (anchor #360 + REG-INV-002 守)
- ✅ 0 user-facing change (server-only refactor)
- ✅ 0 SLO 收紧 vs 0 endpoint shape 改 (反"为绕 boilerplate 改")
- ✅ admin god-mode 不挂 helper (ADM-0 §1.3 红线)

## PR 出来 5 核对疑点
1. 黑名单 grep `userFromContext` count==0 (SSOT 真兑现)
2. 0 schema / 0 endpoint / 0 migration (`git diff` 反向断言)
3. 既有 unit + e2e 全 PASS + cov ≥85% (#612 协议)
4. DM-gate 三错码字面统一 byte-identical (跨 spec/helper/单测三处对锁)
5. scope #4-#13 全闭 0 留尾 (PR description 反向断言无 v2/follow-up 字面)
