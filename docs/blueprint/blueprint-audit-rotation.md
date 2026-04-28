# Blueprint / Implementation / docs/current Audit Rotation

> 飞马 · 2026-04-28 · 防 R3 重排后 doc-vs-code 再脱节
> Case study: #212 audit 一次性抓出 PROGRESS.md 落后 9 行 + migrations.md §7 4 个 v 缺 → 说明无固定节律就会漂。

## 1. 三层 audit 节律

| Trigger | 谁干 | 看什么 | 命令 / grep |
|---|---|---|---|
| **每周一 (固定)** | 飞马 | PROGRESS.md vs `gh pr list --state merged --search "merged:>=$(date -d '7 days ago' +%F)"` | diff merged PR # 是否在 PROGRESS log 出现 |
| **每 milestone ✅** | 该 milestone owner (战马/野马) | docs/current/server/{migrations.md, data-model.md, http-api.md} | `grep -n 'v=[0-9]' registry.go` 对 migrations.md §7 行数; `git diff main -- internal/store/models.go` 对 data-model.md |
| **每 Phase 退出 gate** | 飞马 + 烈马 | 三层全量对账 (blueprint § ↔ implementation/modules/*.md ↔ docs/current/) | 落 `docs/implementation/00-foundation/phase-N-N+1-transition-audit.md` (#212 模板) |
| **每 PR merge 前** | reviewer (飞马) | PR body `## Current 同步` 段是否填 (规则 6 lint) | CI lint 已盯, reviewer 复核非 N/A 时点开 docs/current/ diff |

## 2. Audit checklist (Phase 退出 gate 用)

- [ ] PROGRESS.md 概览行 ↔ 实际 merged milestone PR # (per Phase)
- [ ] blueprint §X.Y ↔ implementation/modules/<m>.md milestone 状态行 (Status marker)
- [ ] docs/current/server/migrations.md §7 v 行数 == registry.go `All` 长度
- [ ] docs/current/server/data-model.md 表/列 == `internal/store/models.go` GORM struct
- [ ] docs/current/server/http-api.md 路由 == `cmd/server/main.go` mux 注册
- [ ] obsolete milestone (如 ADM-3) 标 `obsolete` 不删行 (review 追溯)

## 3. 红线

❌ Phase 退出无 audit doc · ❌ PROGRESS log 跳周 · ❌ docs/current diff 空但 PR 改 schema · ❌ milestone PR merge 后 owner 不补 docs/current
