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
