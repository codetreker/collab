# Data Model — SQLite schema 与事件日志

代码位置：`packages/server-go/internal/store/`。
所有表定义在 `migrations.go`（幂等 `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN` 守卫），ORM 用 GORM 但只是薄包装，没有自动迁移。

## 1. 表清单

| 表 | 关键列 | 备注 |
|----|--------|------|
| `users` | `id`, `display_name`, `role` (`member` / `admin` / `agent`), `email`（可空，部分唯一索引：`WHERE email IS NOT NULL`）, `password_hash`, `api_key` UNIQUE, `owner_id` FK→users, `disabled`, `deleted_at` | agent 行 `role="agent"` 且必有 `owner_id`，软删 |
| `channels` | `id`, `name` UNIQUE, `type` (`channel` / `dm`), `visibility` (`public` / `private`), `topic`, `position` (LexoRank), `group_id` FK, `created_by`, `deleted_at` | DM name = `dm:<uid_low>_<uid_high>` |
| `channel_groups` | `id`, `name`, `position`, `created_by` | 侧边栏分组 |
| `channel_members` | PK (`channel_id`, `user_id`), `joined_at`, `last_read_at` | `last_read_at` 给未读计数用 |
| `messages` | `id`, `channel_id`, `sender_id`, `content`, `content_type` (默认 `text`), `reply_to_id`, `edited_at`, `deleted_at` | 软删 |
| `mentions` | `id`, `message_id`, `user_id`, `channel_id` | `CreateMessageFull` 解析 `@name` 时回填 |
| `events` | `cursor` AUTOINC PK, `kind`, `channel_id` NOT NULL, `payload` (JSON text), `created_at` | **事件日志唯一来源**，下文详述 |
| `user_permissions` | (`user_id`, `permission`, `scope`) UNIQUE | scope 例如 `*` 或 `channel:<id>` |
| `invite_codes` | `code`, `created_by`, `expires_at`, `used_by`, `used_at` | 邀请制注册 |
| `message_reactions` | `id`, `message_id`, `user_id`, `emoji`，UNIQUE(`message_id`,`user_id`,`emoji`) | 同一人对同一消息同 emoji 只能加一次 |
| `workspace_files` | `id`, `user_id`, `channel_id`, `parent_id`, `name`, `is_directory`, `mime_type`, `size_bytes`, `source` (`upload` / `message`), `source_message_id` | per-channel 文件树 |
| `remote_nodes` | `id`, `user_id`, `machine_name`, `connection_token` UNIQUE, `last_seen_at` | `remote-agent` 注册 |
| `remote_bindings` | `id`, `node_id`, `channel_id`, `path`, `label`，UNIQUE(`node_id`,`channel_id`,`path`) | channel ↔ 远端目录绑定 |
| `organizations` | `id`, `name`, `created_at` | Phase 1 / CM-1.1 (`schema_migrations` v2)。1 person = 1 org, UI 永不暴露; 数据层 first-class。见 `migrations.md §7.1`。 |
| `schema_migrations` | `version` PK, `applied_at`, `name` | Phase 0 / INFRA-1a。版本化迁移引擎状态表。 |

**`org_id` 列**: CM-1.1 给 `users / channels / messages / workspace_files / remote_nodes` 各加一列 `org_id TEXT NOT NULL DEFAULT ''` + 同名 `idx_*_org_id` 索引。v0 默认空串占位 (audit 表登记), CM-1.2 起注册流程开始写真值, CM-3 切到基于 `org_id` 直查。

## 2. 迁移策略

`store.Migrate()` 是幂等函数：

1. `PRAGMA foreign_keys = OFF`
2. `createSchema()` — 全部 `CREATE TABLE IF NOT EXISTS`
3. `applyColumnMigrations()` — 一个 `ALTER TABLE ADD COLUMN` 列表，每条用 `columnExists()` 守卫
4. `createSchemaIndexes()` — 索引
5. `PRAGMA foreign_keys = ON`
6. **回填**：默认权限（`channel.create / message.send / agent.manage`）、creator 的频道级权限、LexoRank 重平衡（默认 `"0|aaaaaa"` 的 channel）、DM 去重（按双方 id 排序检测重复）

**约束**：只允许加列，不允许改/删；要重命名或删列必须新建表 + 拷贝数据 + drop。没有版本表，因此每次启动跑全量幂等迁移。

## 3. 事件日志（`events` 表）

业务侧任何"会被订阅者看到"的状态变化都会写一行 `events`：

```
cursor       INTEGER PK AUTOINCREMENT
kind         TEXT      -- new_message / message_edited / channel_created / ...
channel_id   TEXT NOT NULL  -- 全局事件目前不写表，由 Hub 直接广播
payload      TEXT      -- JSON
created_at   TIMESTAMP
```

读路径（`GetEventsSinceWithChanges`）：

```sql
SELECT * FROM events
 WHERE cursor > ?
   AND (channel_id IN (?) OR kind IN (?))   -- 后者用于全局事件
 ORDER BY cursor ASC LIMIT 100
```

三个 push 通道（WS / SSE / 长轮询）共用这张表，配合 `Hub.SignalNewEvents` 唤醒等待者，实现：

- **断线续传**：客户端记 cursor，重连时 `Last-Event-ID` / poll body 带回。
- **多端一致**：同一用户在多端订阅，每端按自己 cursor 各自回放。

## 4. LexoRank

实现：`store/lexorank.go`，测试：`store/lexorank_test.go`。

- 字符串形如 `"0|<base26 6位>"`，例 `"0|hzzzzz"`。
- `GenerateRankBetween(before, after)` 计算 base-26 字典序中点；冲突时 `Rebalance(items)` 在 `[a, z]` 范围里均匀分配。
- 排序就是普通字符串比较 `ORDER BY position ASC`。
- 拖拽时只更新被移动那一项的 `position`，避免连锁写入。

## 5. 软删 vs 硬删

| 实体 | 默认 | 备注 |
|------|------|------|
| Message | 软删 (`deleted_at`) | 列表查询 `WHERE deleted_at IS NULL` |
| Channel | 软删 | admin 可硬删 `ForceDeleteChannel` |
| User | 软删 | `SoftDeleteUser`；其消息和频道**不会**级联 |
| Reaction / Mention / Member | 硬删 | 不需要历史保留 |

`ForceDeleteChannel`（admin only）按顺序删 messages → members → mentions → events → channel，是唯一的级联硬删路径。

## 6. DM 唯一性

DM channel 的 `name` 形如 `dm:<id_a>_<id_b>`。`normalizeDMName` 用 `sort.Strings` 对两个 user id 做**字典序**排序后拼接（不是数值大小），因此无论谁先发起，name 都一致；UNIQUE 约束保证重复创建会复用而不是新建。迁移时 `cleanupDuplicateDMs` 兜底处理历史数据中可能存在的乱序重复，`cleanupDMExtraMembers` 删除 DM 频道里非两位参与者的成员。

## 7. 与 PRD 的映射

| PRD 概念 | 数据库实现 |
|----------|------------|
| user / agent 三角色 | `users.role` + `users.owner_id` |
| admin = `*` | `user_permissions(user_id=admin, permission='*', scope='*')` |
| 频道归属 | `channels.created_by`（agent 创建的会归到 agent；通过 `users.owner_id` 反查到人类 owner） |
| 公开频道 24h 预览 | `GET /api/v1/channels/{id}/preview` 不写表，只在 handler 里限定时间窗 |
| 邀请制注册 | `invite_codes` 表 + `auth/register` 校验 `used_at IS NULL && expires_at > now()` |
