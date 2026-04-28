# schema_migrations 框架 — 现状

> Phase 0 / INFRA-1a 引入。Blueprint: data-layer §3.2 forward-only versioned migrations。

## 1. 两套并行机制 (v0 过渡期)

server-go 启动时按以下顺序跑数据库初始化:

```
store.Open(cfg.DatabasePath)        # 打开 sqlite + WAL + FK ON
store.Migrate()                     # 旧的 big-bang: createSchema + applyColumnMigrations + backfill*
migrations.Default(db).Run(0)       # INFRA-1a: 版本化迁移引擎, 跑所有 Pending
```

**为什么并行**: v0 不删旧 schema, 但 Phase 1+ 所有新 schema 改动都进 `internal/migrations/registry.go` 的 `All` 列表, 不再继续往 `createSchema` 里塞 DDL。这给了 v1 切换时一个清晰的"形迁分裂点"。

## 2. 表结构

```sql
CREATE TABLE schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL,
  name       TEXT NOT NULL
);
```

每条已 apply 的迁移留一行。Engine 启动时读这张表算出 Pending。

## 3. 编写约束

- `Version` 严格递增正整数, 不可重用 / 不可重排。
- 一旦 migration 进 main, **body 不可再编辑**, 改 schema = 追加新 migration。
- 没有 `Down()`。v0 出错"删库重建"; v1 靠 backup restore (见 README §阶段策略)。
- 每条 migration 跑在独立 transaction 内。失败回滚, **不会**写 `schema_migrations` 行。

## 4. CLI

```
borgee-migrate up                # 跑全部 pending
borgee-migrate up --target 5     # 跑到 version 5 为止
borgee-migrate status            # applied vs pending
```

代码: `cmd/migrate/main.go`。

## 5. Phase 0 验收 (G0.1)

- 数据契约: `schema_migrations(version INT PK, applied_at INT, name TEXT)` 存在。
- E2E: 跑一条 `_migrations_marker` 假迁移 (registry.go version=1), `schema_migrations` 多 1 行。
- 单测: `internal/migrations/migrations_test.go` (≥80%, 覆盖 ascending / 幂等 / target / rollback / 重复版本 / 校验)。
- Seed 契约: `internal/migrations/testdata/infra-1a/seed.sql` (Phase 0 留空, Phase 1+ 按需填)。

## 6. 与旧 Store.Migrate() 的迁移路径

Phase 1 CM-1 (organizations 表) **必须** 走新引擎, 不进 `createSchema`。`Store.Migrate()` 内部 backfill 函数在 v1 切换前评估迁出。

## 7. 已注册迁移清单

| version | name | 来源 | 备注 |
|---|---|---|---|
| 1 | `infra_1a_dummy_marker` | Phase 0 / INFRA-1a | 建 `_migrations_marker(version, note)`, 端到端验证引擎。 |
| 2 | `cm_1_1_organizations` | Phase 1 / CM-1.1 | 见下节。 |
| 3 | `cm_4_0_agent_invitations` | Phase 2 / CM-4.0 | `agent_invitations` 表 + 状态机, 见 internal/store/agent_invitation.go。 |
| 4 | `adm_0_1_admins` | Phase 2 / ADM-0.1 | 见下节 (admin 独立表 + env bootstrap)。 |
| 5 | `adm_0_2_admin_sessions` | Phase 2 / ADM-0.2 | 见下节 (server-side admin session token 表)。 |
| 7 | `cm_onboarding_welcome` | Phase 2 / CM-onboarding | 见下节 (messages.quick_action + system user seed + #welcome backfill)。 |
| 8 | `ap_0_bis_message_read` | Phase 2 / AP-0-bis | 见下节 (legacy agent message.read 默认权限回填)。 |
| 9 | `cm_3_org_id_backfill` | Phase 1 / CM-3 后置 | 4 资源表 org_id 回填 (PR #208)。 |
| 10 | `adm_0_3_users_role_collapse` | Phase 2 / ADM-0.3 | `users.role` enum 收 → {member, agent} + 4 步 admin backfill 顺序锁。 |

### 7.1 v2 — `cm_1_1_organizations`

Blueprint: concept-model.md §1.1 + §2 (1 person = 1 org, UI 永久不暴露; 数据层 org first-class)。

DDL:

```sql
CREATE TABLE IF NOT EXISTS organizations (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

ALTER TABLE users           ADD COLUMN org_id TEXT NOT NULL DEFAULT '';
ALTER TABLE channels        ADD COLUMN org_id TEXT NOT NULL DEFAULT '';
ALTER TABLE messages        ADD COLUMN org_id TEXT NOT NULL DEFAULT '';
ALTER TABLE workspace_files ADD COLUMN org_id TEXT NOT NULL DEFAULT '';
ALTER TABLE remote_nodes    ADD COLUMN org_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_users_org_id           ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_channels_org_id        ON channels(org_id);
CREATE INDEX IF NOT EXISTS idx_messages_org_id        ON messages(org_id);
CREATE INDEX IF NOT EXISTS idx_workspace_files_org_id ON workspace_files(org_id);
CREATE INDEX IF NOT EXISTS idx_remote_nodes_org_id    ON remote_nodes(org_id);
```

**v0 stance — `NOT NULL DEFAULT ''`**: 现有行直接拿到空串, 不做 backfill。CM-1.2 会让注册流程开始写真值; v0 dev DB 可"删库重建", 不再回填历史空串行。这条 v0 债已在 `docs/implementation/README.md` audit 表登记 (`organizations 表` + `users.org_id NOT NULL`)。

**v1 切换路径**: 单独 PR — 先一次性 backfill `org_id`, 再追加新 migration 把 default 拿掉 (forward-only, 不改 v2 body)。

**资源表覆盖**: CM-3 将开始基于 `org_id` 直查这五张表 (channels / messages / workspace_files / remote_nodes), 故索引在 CM-1.1 一并落地, 避免 Phase 2 切流时再补索引。`users.org_id` 用于 CM-1.3 admin stats GROUP BY 与 CM-1.2 注册流程 owner→org 关联。

### 7.2 v4 — `adm_0_1_admins`

Blueprint: admin-model.md §1.2 (B env bootstrap, 无 promote) + §3 (admins 独立表)。R3 PR #188 / implementation R3 PR #189 锁定。

DDL (4 字段, 不准多, 锁死):

```sql
CREATE TABLE IF NOT EXISTS admins (
  id            TEXT PRIMARY KEY,
  login         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_login ON admins(login);
```

**红线 (review checklist §ADM-0.1)**: `admins` 表**不准**多 `org_id` / `role` / `is_admin` / `email` 字段。admin 不在任何 org, 不通过 promote 产生 (与 user/org 模型完全分裂)。

**Bootstrap 路径**: `cmd/collab/main.go` 启动时调 `internal/admin.Bootstrap(db)`, 读 env `BORGEE_ADMIN_LOGIN` / `BORGEE_ADMIN_PASSWORD_HASH` (字面锁), 走 `INSERT … ON CONFLICT(login) DO NOTHING` 落第一个 admin。env 缺任一 → fail-loud panic。bcrypt cost < 10 / 非 bcrypt 串 → fail-loud panic。

**Cookie name (字面锁)**: `borgee_admin_session` — 见 `internal/admin/auth.go::CookieName` const。改名 = 红线。

**Auth path 隔离**: `internal/admin/` 包**禁止 import** `internal/auth/`。grep 命中 0, 单测 (`internal/admin/auth_test.go::TestLogin_1E_ConstantTimeCompare`) 自动 enforce。

**双轨并存 (ADM-0.1 阶段)**: 老的 `users.role='admin'` 仍可经由 `internal/api/admin_auth.go` (旧 `borgee_admin_token` cookie) 走 `/admin-api/v1/*`。新路径走 `/admin-api/auth/login` + `borgee_admin_session` cookie。两路 cookie 名互不识别, ADM-0.2 切 cookie 时单边收尾。

### 7.3 v5 — `adm_0_2_admin_sessions`

Blueprint: review checklist §ADM-0.2 §1 (cookie 值不能是 admin id, 必须服务端反查的不可猜 token)。

DDL:

```sql
CREATE TABLE IF NOT EXISTS admin_sessions (
  token      TEXT PRIMARY KEY,
  admin_id   TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id  ON admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);
```

**红线**:
- `token` = 32 字节 `crypto/rand` hex (64 hex chars), **不可**是 admin id / email / login / 任何可枚举值。
- `internal/admin/auth.go::ResolveSession` 是 cookie → admin 的唯一通路。改字段名 = 红线。
- ADM-0.2 同时砍掉 `RegisterAppRoutes` (旧 `/api/v1/admin/*` god-mode 挂载) 与 `auth.RequirePermission` 里的 `users.role == "admin"` 短路 — 双轨彻底分离。

**ADM-0.2 收尾后还活着的 admin code**:
`internal/admin/{auth.go, middleware.go, handlers.go, bootstrap.go}` + 本迁移。`internal/api/admin_auth.go` / `admin_e2e_test.go` 被删除, `internal/api/admin.go::RegisterAppRoutes` 移除。

> v=6 originally reserved for ADM-0.3 — slot skipped after CM-onboarding (v=7) / AP-0-bis (v=8) / CM-3 (v=9) landed sequentially. ADM-0.3 took v=10 to keep the registry strictly increasing.

### 7.4 v7 — `cm_onboarding_welcome`

Blueprint: concept-model.md §10 + onboarding-journey.md §4 (野马 v1, R2 merged).

DDL + seed + backfill (跑在单事务):

```sql
ALTER TABLE messages ADD COLUMN quick_action TEXT;  -- JSON {kind,label,action}, NULL by default

-- system user seed (FK target for sender_id='system'); idempotent
INSERT OR IGNORE INTO users (id, display_name, role, created_at, disabled, require_mention, org_id)
VALUES ('system', 'System', 'system', strftime('%s','now')*1000, 1, 0, '');

-- per-user #welcome backfill (existing users 无 welcome → 建 channel + member + system message)
-- 实现见 internal/migrations/cm_onboarding_welcome.go (含 hasColumns 探针, 单测 scaffold 安全)
```

**红线**:
- `quick_action` JSON schema v0 锁 `{"kind":"button","label":string,"action":string}` — 改 schema = 追加 v=N+1 而非改 v=7。
- `system` user disabled=1, role='system' (非 'admin' 非 'agent') — 不会进 RequirePermission gate, 不计 admin stats。
- 后续 register / admin createUser 由 handler 自动调 `store.CreateWelcomeChannelForUser` 建 #welcome (见 api/auth.go + api/admin.go)。

**bug-030 后置 fix (PR #203 commit 22ed221)**: `ListChannelsWithUnread` WHERE 子句加 `c.type IN ('channel','system')` + `channel_members` LEFT JOIN gate, 确保本人能看 #welcome 但其他人看不到。回归 row REG-INV-003。

### 7.5 v8 — `ap_0_bis_message_read`

Blueprint: ap-0-bis.md §数据契约 + R3 Decision #1 (default capability set 锁 `[message.send, message.read]`).

DDL + backfill:

```sql
INSERT INTO user_permissions (user_id, permission, scope, granted_at)
SELECT u.id, 'message.read', '*', CAST(strftime('%s','now') AS INTEGER) * 1000
FROM users u
WHERE u.role = 'agent'
  AND u.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_permissions p
    WHERE p.user_id = u.id
      AND p.permission = 'message.read'
      AND (p.scope = '*' OR p.scope = '*')
  );
```

**红线**:
- 范围严格: `role='agent' AND deleted_at IS NULL` — 不污染 member / admin / 软删 agent (回归 row REG-AP0B-002 + 单测 `TestAP0Bis_SkipsNonAgentRoles` / `_SkipsSoftDeletedAgents`)。
- 幂等: `NOT EXISTS` 子句保护重复跑不再插 (`TestAP0Bis_Idempotent`); v0 forward-only 契约下替代 Down 回滚断言。
- 新 agent 走 `store.GrantDefaultPermissions` (queries.go:375), 默认两行 `(message.send, *) + (message.read, *)`; 历史 agent 走本迁移 backfill。两条路径合流 = 全 agent 默认含 `message.read`。

**配套测试 (生效证据)**:
- `internal/api/messages_perm_test.go::TestGetMessages_LegacyAgentNoReadPerm_403` — 反向 (SeedLegacyAgent 只授 message.send → GET messages 403)
- `internal/api/messages_perm_test.go::TestGetMessages_AgentWithReadPerm_200` — 正向 (默认 agent 含 read → 200)
- EXPLAIN: hot-path `WHERE user_id=?` 走 `idx_user_permissions_lookup`, 无 SCAN (见 docs/implementation/00-foundation/g1-audit.md §3.5)。

### 7.6 v9 — `cm_3_org_id_backfill`

Blueprint: `docs/qa/cm-3-resource-ownership-checklist.md` (PR #200, 野马). CM-1.1 (v=2) added the `org_id` columns + indexes; v=9 backfills legacy rows on 4 resource tables (`channels`, `messages`, `workspace_files`, `remote_nodes`) via `org_id <- users.org_id` joined on creator/sender/uploader FK. Idempotent + trimmed-schema tolerant via `hasTable`/`hasColumn` PRAGMA introspection. v0 leaves un-stampable rows at `org_id=''` (CrossOrg returns false → falls through to membership checks); v1 will hard-flip NOT NULL.

### 7.7 v10 — `adm_0_3_users_role_collapse`

Blueprint: `docs/implementation/modules/adm-0-review-checklist.md` §ADM-0.3. Collapses `users.role` enum to `{'member', 'agent'}` and seals user-rail / admin-rail split. **4-step admin backfill 顺序锁** in single transaction:
1. `INSERT INTO admins (login, …) SELECT … FROM users WHERE role='admin' ON CONFLICT(login) DO NOTHING`
2. `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role='admin')`
3. `DELETE FROM user_permissions WHERE user_id IN (…)` (ADM-0.2 wildcard sweep)
4. `DELETE FROM users WHERE role='admin'`

SQLite cannot `ADD CHECK` post-create — covered by data-invariant + 5 reverse-assertion tests (§3.A–§3.G); v1 hard-flip via `CREATE+RENAME` deferred. Post-migration, admin authority lives exclusively on `/admin-api/*` behind `borgee_admin_session`; AP-0 default `(*, *)` carries human-member authority on the user rail.

### 7.8 ADM-0.3 红线

- **4 步顺序锁** (单事务, 顺序不可调): admins INSERT → sessions DELETE → user_permissions DELETE → users DELETE。任意 step 失败整条回滚, 不得插入"半 admin"中间态。
- **ON CONFLICT(login) DO NOTHING**: bootstrap (`internal/admin/bootstrap.go`) 已先建过相同 login 的 admin → 迁移不得覆盖, 跳过即可。改成 DO UPDATE = 红线。
- **`users.role` enum 收紧**: 字面只剩 `{'member', 'agent'}`。v0 用数据 invariant + 反向单测兜; **v1 hard-flip via `CREATE TABLE ... CHECK + RENAME`** 留 backlog (SQLite 不支持 post-create ADD CONSTRAINT)。
- **Regression registry**: `internal/testutil/regression_suite/` 已注册 5 反向断言 (§3.A–§3.G), 任意未来迁移破坏 admin 拆表 invariant 立即红。

### 7.9 v11 — `chn_1_1_channels_org_scoped`

Blueprint: `docs/blueprint/channel-model.md` §1.1 (Channel = 协作场) + §2 关键不变量 (Channel 跨 org 共享 / 创建者归属) + `concept-model.md` §1.2 (agent = 同事, 默认沉默)。Phase 3 第一波, PR 拆分文档 #265。

**What changes**:
1. **Pre-flight dup detection**: `SELECT COUNT(*) GROUP BY (org_id, name) HAVING cnt > 1`. Cross-org historic dup → hard-fail with row list, **no auto-rename** (CHN-1 spec: 历史行人工 audit, 防丢历史)。
2. **channels rebuild**: drop inline `UNIQUE(name)` via `CREATE channels_new + COPY + DROP + RENAME` (SQLite 不支持 DROP CONSTRAINT)。captured user indexes via `sqlite_master.sql IS NOT NULL` reapplied (autoindex 不回填)。
3. `channels.archived_at INTEGER NULL` 加列 (蓝图反约束: archive 不删)。
4. `CREATE UNIQUE INDEX idx_channels_org_id_name ON channels(org_id, name) WHERE deleted_at IS NULL` — 跨 org 同名合法, 同 org 同名拒, 软删行不占名。
5. `channel_members.silent INTEGER NOT NULL DEFAULT 0` + `channel_members.org_id_at_join TEXT NOT NULL DEFAULT ''` (audit snapshot)。
6. **Backfill**: `silent = 1 WHERE user_id IN (SELECT id FROM users WHERE role='agent')` — agent 默认沉默 (蓝图 §1.2 立场); `org_id_at_join = users.org_id` snapshot for audit-only join queries.
7. `CREATE INDEX idx_channel_members_org_at_join`。

**红线**:
- **不自动 rename 历史 dup**: pre-flight 失败硬停 + 报 row 列出。任何"自动 rename + 加后缀"补丁 = 红线 (野马 R2 立场: 历史名是用户认知锚, 自动改名 = 丢历史)。
- **rebuild 步骤完整性**: PRAGMA 抓 cols + indexes → COPY → DROP → RENAME → reapply。autoindex (来自 inline UNIQUE) 不回填; 用户索引 (idx_channels_org_id, idx_channels_position, idx_channels_group) 必须保留。
- **silent=0 default**: column-level default 是 0 (人), backfill UPDATE 把 agent 行翻 1。任何"channel 创建即给 silent flag" = 走代码路径不走迁移。

**Trimmed-schema tolerance**: `hasTable("channels"/"channel_members")` + `hasColumn` 双 guard, 与 cm_3 / cm_onboarding 同模式; 仅 channels(id) + created_by 的 trimmed scaffold (TestDefaultRegistryRunsClean 覆盖) 跳过 rebuild + 跳过 backfill。

**配套测试**:
- `chn_1_1_channels_org_scoped_test.go::TestCHN11_AddsArchivedAtAndSilentColumns` — schema 列 + 默认值断言
- `…::TestCHN11_DropsGlobalNameUniqueAndAddsPerOrgIndex` — 跨 org 同名 INSERT 合法 / 同 org dup INSERT 拒 / idx_channels_org_id 幸存
- `…::TestCHN11_HardFailsOnHistoricDuplicateNoAutoRename` — pre-flight 报 dup 硬停 + 不写 schema_migrations (PR #265 CHN-1.1 spec drift 行)
- `…::TestCHN11_BackfillsAgentSilentAndOrgIDAtJoin` — agent silent=1 / human silent=0 / org_id_at_join 双方 snapshot
- `…::TestCHN11_IsIdempotentOnRerun` + `_ToleratesTrimmedSchema`
