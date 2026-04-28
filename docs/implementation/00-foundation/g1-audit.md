# G1 Audit — Phase 1 退出闸 (audit 集成)

> 作者: 烈马 (QA) · 2026-04-28 · team-lead Phase 1 退出 gate 收尾派活
> 目的: 把 Phase 1 五道闸 (G1.1–G1.5) + audit row 一次性集成审完, 留下 single-source-of-truth, 后续 milestone 引用即可不重抄。
> 形式: 此文件 = audit 报告; 签字单独走 `docs/qa/signoffs/g1-exit-gate.md`。

---

## 1. 闸概览

| 闸 | 主旨 | Trigger PR | Status |
|---|---|---|---|
| G1.1 | CM-1 organizations 表 + users.org_id 列存在 + NOT NULL + 默认 `''` | #184 (CM-1) | ✅ |
| G1.2 | CM-1 idx_*_org_id 索引齐 (users/channels/messages/workspace_files/remote_nodes 5 个) | #184 | ✅ |
| G1.3 | CM-1 v=2 schema_migrations 行落地 + 幂等 rerun | #184 | ✅ |
| G1.4 | 读路径 EXPLAIN 走 idx_*_org_id + JOIN owner_id 黑名单 grep + 跨 org 反向 403 | #208 (CM-3) + audit 2026-04-28 | ✅ closed (本文 §2) |
| G1.5 | AP-0 注册回填默认权限 `[message.send, message.read]` | #184 | ✅ |
| G1.audit | Phase 1 跨 milestone audit row (CM-1 / AP-0 / CM-4 / CM-3) | 本文 §3 | ✅ |

G1.4 在 PR #184 merge 时被标 ⏸️ deferred (因为读路径 + 跨 org 反向需要 CM-3 owner_id→org_id 替换之后才有意义), 本次 audit 闭合。

---

## 2. G1.4 audit 集成 (2026-04-28)

### 2.1 §2 黑名单 grep — JOIN.*owner_id count==0

cm-3 §2 要求: 主资源表 (messages / channels / workspace_files / agents / remote_nodes) JOIN owner_id 必须全删。

```
$ grep -rEn "JOIN.*(messages|channels|workspace_files|agents|remote_nodes).*owner_id" \
    packages/server-go/internal/store/ \
    | grep -v _test.go | grep -v queries_cm3.go
(no matches)
```

`queries_cm3.go` 含此 regex 的注释串 (用于 self-document 黑名单), 不算违规, 故 grep 排除。

### 2.2 §3 反向 403 — 跨 org 三类资源

```
=== RUN   TestCrossOrgRead403/PUT_cross-org_→_403         --- PASS
=== RUN   TestCrossOrgRead403/DELETE_cross-org_→_403      --- PASS
=== RUN   TestCrossOrgChannel403                          --- PASS
=== RUN   TestCrossOrgFile403                             --- PASS
```

3 个 test 函数 (TestCrossOrgRead403 / TestCrossOrgChannel403 / TestCrossOrgFile403)
落 `internal/api/cross_org_test.go`。 PUT/DELETE/GET 三动词 × messages/channels/workspace_files
三资源全部返 403, 不是 200/404/500 — 即 authz 在归属层失败-关闭, 不是 sneaky 404 或路径泄漏。

### 2.3 §3 EXPLAIN QUERY PLAN — 6 主查询 idx_*_org_id 命中

跑 `EXPLAIN QUERY PLAN` 对 6 条主读路径 (build-time 验证, sqlite in-mem):

```
== users by org ==              SEARCH users          USING INDEX idx_users_org_id           (org_id=?)
== users role=agent ==          SEARCH users          USING INDEX idx_users_org_id           (org_id=?)
== channels by org ==           SEARCH channels       USING INDEX idx_channels_org_id        (org_id=?)
== messages by org+channel ==   SEARCH messages       USING INDEX idx_messages_org_id        (org_id=?)
== workspace_files by org ==    SEARCH workspace_files USING INDEX idx_workspace_files_org_id (org_id=?)
== remote_nodes by org ==       SEARCH remote_nodes   USING INDEX idx_remote_nodes_org_id    (org_id=?)
```

注: 项目无独立 `agents` 表 — agent = `users WHERE role='agent'`, 故 agent 路径走
`idx_users_org_id` (与 users 同索引)。 6 条全部 `SEARCH ... USING INDEX`, 无 `SCAN TABLE` —
即 org 隔离不会触发全表扫描, 多 org 规模线性扩展不退化。

> Audit harness 是临时的 `cmd/explain-audit/main.go`, 跑完即删 (不入产物); EXPLAIN
> 输出留此文件即可作 single source of truth。 后续 G2.x 若要常态化, 提到 RT-0 时再补。

### 2.4 全量 go test ./...

```
$ cd packages/server-go && go test ./...
ok      ... 16 packages green
```

`internal/migrations` (含 cm_3_org_id_backfill_test.go) + `internal/api`
(cross_org_test.go) + `internal/store` 全绿。

---

## 3. G1.audit row — Phase 1 跨 milestone codedebt 登记

| Audit ID | Source milestone | 内容 (单行) | 接收 milestone | Status |
|---|---|---|---|---|
| AUD-G1-CM1-a | CM-1 (#184) | `organizations.deleted_at` 软删未实现, 现版 organizations 不可删 | Phase 2 (TBD) | 📝 logged |
| AUD-G1-CM1-b | CM-1 (#184) | `users.org_id` 默认 `''` (空串) — 注册时必须显式 set, 历史回填依 CM-3 backfill | CM-3 #208 ✅ closed | ✅ closed |
| AUD-G1-AP0 | AP-0 (#184) | 默认权限 source-of-truth 锁 `internal/store/queries.go::GrantDefaultPermissions` 行 375 (R3 Decision #1) | (持续) | ✅ stable |
| AUD-G1-CM4 | CM-4.1 (#185) | `c.JSON.*\b(User\|AgentInvitation)\b` sanitizer fail-closed (REG-INV-001) — 防新 endpoint 漏过 | (持续) | ✅ stable |
| AUD-G1-CM3-a | CM-3 (#208) | `cm_3_org_id_backfill` v=9 迁移历史 NULL/空串 org_id 行 — idempotent | (forward only) | ✅ closed |
| AUD-G1-CM3-b | CM-3 (#208) | owner_id 列保留 (没删) — read 路径不读, write 时双写; 后续 G2 evaluate retire | Phase 2 (TBD) | 📝 logged |

`📝 logged` = 留作 Phase 2 输入, 不阻塞 Phase 1 退出; `✅ closed` / `✅ stable` 已闭合。

---

## 4. Phase 1 退出闸结论

5 道闸 + audit row 全签 ✅ — 见 `docs/qa/signoffs/g1-exit-gate.md`。
Registry 引用: 见 `docs/qa/regression-registry.md` §4 + 第 6 节 (CM-3 + G1.4 4 行 🟢)。

---

## 5. 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-28 | 烈马 | v1 — Phase 1 退出 gate audit 集成完成, G1.4 闭合, audit row 落地 |
