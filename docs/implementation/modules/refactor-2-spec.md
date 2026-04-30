# REFACTOR-2 spec brief — internal/api 重复收口剩余全清 (≤80 行)

> 飞马 · 2026-05-01 · 用户拍板 (一次做干净, 不准留尾巴) · zhanma 主战 + 飞马 review
> **关联**: REFACTOR-1 #611 ✅ merged (top 4 helper) · 飞马 internal/api duplication audit top 13 留账剩 9 处
> **命名**: REFACTOR-2 = 第二件 refactor milestone, 跟 REFACTOR-1 同等级 (元 milestone)

> ⚠️ Refactor milestone — **0 行为改 / 0 schema / 0 endpoint** + 既有 unit/e2e 全 PASS byte-identical.
> 净减 ~500-700 LoC, 一 PR 合, **本 milestone 飞马 audit #4-#13 全清不留 v2**.

## 0. 关键约束 (3 条立场)

1. **行为不变量 byte-identical pre/post refactor + 字面 content-lock 严格** (跟 REFACTOR-1 #611 必修条件承袭): helper 提取**只动调用形式**, 不动 (a) HTTP status code (b) error reason code 字面 (c) DM-gate 字面 (d) audit log 字段 (e) WS broadcast event 名 (f) admin god-mode 路径. 反约束: 既有错误码字面 grep count 等量 (helper 内承载相同字面); 既有 unit/e2e (≥80 test func) 全 PASS 不动.

2. **8 helper SSOT 一次全立** (跟 REFACTOR-1 4 helper / BPP-3 / TEST-FIX-3 fixture 同精神, **不准挑 top-N**):
   - **helper-1 `mustUser(w, r) (*User, bool)`** — 收 100+ 处 `user==nil → 401 Unauthorized` boilerplate (~400 行减), 落 `auth_helpers.go` 新
   - **helper-2 `decodeJSON(w, r, &v) bool`** — 收 30 处 JSON-decode → 400 boilerplate (~50 行减), 落 `request_helpers.go` 新; 顺手统一 error shape 为 `writeJSONErrorCode(w, 400, "request.invalid_json", "Invalid JSON body")` 单源
   - **helper-3 DM-gate 错码统一 → `layout.dm_not_grouped`** — 13 hits 三种错码 (`dm.edit_only_in_dm` / `"Forbidden"` 漂) 统一走 `layout.dm_not_grouped` 单源 (跟 chn-3 content-lock §1 ④ 5 源 byte-identical), 错码字面**减少**但 reason 文本扩为 `"DM 不参与个人分组"` 单源 (反约束: 反向 grep `dm.edit_only_in_dm` 0 hit + Forbidden 字面 DM context 0 hit)
   - **helper-4 ACL 双重 → 单源 `requireChannelAccess(w, r, chID, user)`** — `IsChannelMember || CanAccessChannel` drift 5 处统一 (artifact_comments / dm_4 / artifacts ×2 / 其他), 落 `channel_helpers.go` 既有文件 (REFACTOR-1 已挂); 立场: `CanAccessChannel` 是 superset (含 public/private + member), `IsChannelMember` 是 subset (仅 member); 统一走 `CanAccessChannel` (security correctness — fail-closed 真守, 反 member-only 漏 public)
   - **helper-5 `writeAdminListResponse(w, key, items)`** — 收 5+ admin-list endpoint shape (~30 行减), `{key: items}` wrap 单源, key 字面 caller 决定; 落 `admin_helpers.go` 新
   - **helper-6 `loadAgent(w, r) *Agent`** — 收 10 处 `id := PathValue + GetAgent + 404` (~30 行减), 落 `agent_helpers.go` 新
   - **helper-7 `pushCursorEnvelope(hub, ch, kind, payload, idempKey, createdAt)`** — 收 artifact_comments ↔ anchors 双 wrapper drift (RT-3 SSOT, ~10 行减), 落 `cursor_envelope_helpers.go` 新
   - **helper-8 `fanoutChannelStateChange(state string)`** — 收 fanoutArchive ↔ fanoutUnarchive (~20 行减, 字面 `"恢复于"` / `"关闭于"` 由 caller 传, content-lock 不破), 落 chn_5_archived.go 内 (跟 REFACTOR-1 chn_6 同 idiom)
   
   反约束: 反向 grep `func mustUser|decodeJSON|loadAgent|writeAdminListResponse|requireChannelAccess|pushCursorEnvelope` 单源各==1 hit (反第 9 个漂)

3. **0 endpoint 加 + 0 schema 改 + caller 列表锁** (refactor 立场, 跟 REFACTOR-1 / INFRA-3 / CV-15 wrapper 系列承袭): PR diff 仅 (a) 8 helper 新文件 + 既有文件追加 ~400 行 (b) caller 改 ~900 行净减 (c) 既有 test 不动 (d) 0 migrations / 0 routes.go / 0 schema 改 / 0 文件 rename (rename 留 NAMING-1). 反约束: 反向 grep `migrations/refactor_2_` 0 hit + caller 列表 audit (≥40 文件 touched 但仅 helper 调用替换, 0 行为分支 add).

## 1. 拆段实施 (3 段, 一 milestone 一 PR — 内顺序)

| 段 | 范围 |
|---|---|
| **R2.1 helper 抽出** | 8 helper 新建 (auth_helpers / request_helpers / admin_helpers / agent_helpers / cursor_envelope_helpers + channel_helpers 追加 + chn_5_archived 内 + cursor_envelope 内). 0 caller 改, 仅 helper 文件 + godoc + 单元 test. ~400 行加 |
| **R2.2 caller 跟随** | 全 caller (≥40 文件) 改走 helper, byte-identical 替换. 净减 ~900 行. 既有 test 不动全 PASS. |
| **R2.3 drift 统一 + closure** | helper-3 DM-gate 错码统一 (`dm.edit_only_in_dm` 7 处 + Forbidden DM context 漂 → `layout.dm_not_grouped` 单源) + helper-4 ACL drift 收口 (IsChannelMember → CanAccessChannel superset 统一). REG-REFACTOR2-001..010 (10 反向 grep + 行为不变量 + caller 锁 + 字面 content-lock 等量 + drift 净 0 + 8 helper 单源 + 既有 test PASS + 净减 LoC ≥500) + acceptance + content-lock 守 + 4 件套 |

## 2. 反向 grep 锚 (10 反约束)

```bash
# 1) 8 helper 单源各==1 hit
for h in mustUser decodeJSON loadAgent writeAdminListResponse requireChannelAccess pushCursorEnvelope fanoutChannelStateChange; do
  grep -cE "^func .*$h\(" packages/server-go/internal/api/  # ==1 per helper
done

# 2) user==nil → 401 boilerplate 全清 (反向断言 ≤5 处, 残留仅 helper 内 + 极少特殊路径)
git grep -cE 'if user == nil \{' packages/server-go/internal/api/*.go | grep -v _test.go | awk -F: '{s+=$NF}END{print s}'  # ≤5 (REFACTOR-2 前 ≥100)

# 3) DM-gate 错码 drift 0 hit (helper-3)
git grep -nE 'dm\.edit_only_in_dm' packages/server-go/internal/api/  # 0 hit (统一走 layout.dm_not_grouped)

# 4) ACL drift 0 hit (helper-4 单一 superset)
git grep -nE 'IsChannelMember.*\|\|.*CanAccessChannel|CanAccessChannel.*\|\|.*IsChannelMember' packages/server-go/internal/api/  # 0 hit (统一走 requireChannelAccess)

# 5) JSON-decode 400 boilerplate 全清 (反向断言)
git grep -cE 'json\.NewDecoder.*Decode|json\.Unmarshal' packages/server-go/internal/api/*.go | grep -v _test.go | awk -F: '{s+=$NF}END{print s}'  # ≤5 (helper 内 + 特殊 streaming 路径)

# 6) admin-list endpoint shape 单源 (helper-5)
grep -cE 'writeAdminListResponse\(' packages/server-go/internal/api/  # ≥5 hit (5+ caller)

# 7) agent path-id load 单源 (helper-6)
grep -cE 'loadAgent\(' packages/server-go/internal/api/  # ≥10 hit

# 8) DM-gate 字面 content-lock 等量 (跟 REFACTOR-1 必修条件承袭)
old=$(git show origin/main:docs/qa/regression-registry.md | grep -c 'DM 不参与个人分组')
new=$(grep -rcE 'DM 不参与个人分组' packages/server-go/internal/api/ docs/ | awk -F: '{s+=$NF}END{print s}')
[ "$new" -ge "$old" ]  # 字面在 helper 内承载, 总 count 不少 (允许扩到 dm_4 漂的 7 处 → 字面正源)

# 9) 0 schema / 0 endpoint / 0 migrations 加
ls packages/server-go/internal/migrations/ | grep -cE 'refactor_2_'  # 0 hit
git diff origin/main -- packages/server-go/internal/server/server.go | grep -cE '\+.*HandleFunc|\+.*Handle\('  # 0 hit (0 endpoint 加)

# 10) 既有 test 不动 (既有 *_test.go 行为不改, 仅 _test.go 字符串 match 调整 if 错码统一)
go test -tags 'sqlite_fts5' ./internal/api/... ./internal/auth/... ./internal/store/...  # ALL PASS
```

## 3. 不在范围 (留账)

- ❌ **文件 rename** — 留 NAMING-1 (REFACTOR-2 不动文件名, 只改 helper / boilerplate)
- ❌ **新功能 / 新 endpoint / 新 schema** — 0 行为改铁律
- ❌ **REFACTOR-3** (cursor envelope SSOT 进一步深化 / messages.go 长函数拆分 / store layer query helper 整合) — 留 v3+ 议程
- ❌ **生产配置改 / migration / DDL** — refactor 不动数据契约
- ✅ 飞马 audit #4-#13 9 处技术债 **全清**, 不留 v2 (用户铁律: 一次做干净)

## 4. 跨 milestone byte-identical 锁

- 复用 REFACTOR-1 #611 4 helper SSOT 模式 (8 helper 一次立, scope ≥REFACTOR-1)
- 复用 BPP-3 #489 / reasons.IsValid #496 / TEST-FIX-3 fixture SSOT 单源
- 复用 chn-3 content-lock §1 ④ DM-gate 字面跨 helper 不漂
- 复用 audit-forward-only / owner-only ACL 链 / admin god-mode 不挂红线
- 复用 RT-3 cursor envelope SSOT (helper-7)
- 0-行为-改 wrapper 决策树**变体**: 跟 REFACTOR-1 / INFRA-3 / INFRA-4 / CV-15 / TEST-FIX-3 同源

## 5. 派活 + 双签

派 **zhanma** (REFACTOR-1 #611 zhanma-d 主战熟手优先续作, 或 zhanma-c TEST-FIX-3 后空) + 飞马 review.

双签流程: spec brief → team-lead → 飞马自审 ✅ APPROVED → yema stance + liema acceptance → zhanma 起实施 (R2.1+R2.2+R2.3 三段一 PR, **teamlead 唯一开 PR**).

## 6. 飞马 (架构师) 自审表态

✅ **APPROVED with 2 必修条件**:

🟡 必修-1: **字面 content-lock 严格** (跟 REFACTOR-1 #611 必修条件 byte-identical 承袭) — 战马 PR body 必示 before/after grep count: `"DM 不参与个人分组"` 字面 ≥ baseline + `dm.edit_only_in_dm` 字面 0 hit + DM context 下 "Forbidden" 字面 0 hit.

🟡 必修-2: **ACL drift 统一方向** — `IsChannelMember || CanAccessChannel` 双重 → `requireChannelAccess` 走 **CanAccessChannel** (superset). 反约束: 反向 grep 收口后 `IsChannelMember` 仅在 helper 内 + 特殊 owner-only 路径 (e.g. chn_15 creator-only 不算 ACL drift), 不再出现在普通 channel-member 路径.

担忧 (1 项, 中度):
- 🟡 scope 大 (≥40 文件 touched, ~500-700 LoC 净减) — PR review 工作量大, 但 byte-identical 替换可机械验证 (10 反向 grep + 既有 test 全 PASS)

留账接受度: NAMING-1 / REFACTOR-3 (cursor envelope 深化 / messages.go 长函数拆) 全留账, 跟用户铁律 "本 milestone audit 全清" 不冲突 (NAMING-1 / REFACTOR-3 是新 audit 不在飞马 #4-#13 列表).

**ROI 拍**: REFACTOR-2 ⭐⭐⭐ — 一次性收口飞马 audit 9 处技术债 (correctness + mechanical), 净减 ~500-700 LoC, 8 helper SSOT 立后续 milestone 复用基座, 不留 v2.

## 7. 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-05-01 | 飞马 | v0 spec brief — REFACTOR-2 internal/api 重复收口剩余 9 处全清 (飞马 audit #4-#13). 3 立场 + 8 helper SSOT 一次立 + 3 段拆 + 10 反向 grep + 2 必修条件 (字面 content-lock + ACL 统一 CanAccessChannel superset). 留账: NAMING-1 (文件 rename) / REFACTOR-3 (cursor envelope 深化 / 长函数拆). 净减 ~500-700 LoC. zhanma-d (REFACTOR-1 续作) 或 zhanma-c (TEST-FIX-3 空) 主战 + 飞马 ✅ APPROVED 2 必修. teamlead 唯一开 PR. |
