---
name: blueprintflow-milestone-fourpiece
description: Milestone 启动 4 件套 (spec/stance/acceptance/content-lock), 跟实施代码一起在**一个 PR** 里落 — 不再拆多个 docs PR。
---

# Milestone 4 件套

每个 milestone **一个 PR 一次合**: 4 件套 + 三段实施 + e2e + docs/current sync + REG flip + acceptance ⚪→✅ + PROGRESS [x] **全在同一 PR** 内. 不再拆 spec/acceptance/文案锁/stance 4 个独立 docs PR, 也不拆 schema/server/client 三个实施 PR.

**git workflow 配套** (见 `blueprintflow-git-workflow`):
- teamlead 创建 `.worktrees/<milestone>` + branch `feat/<milestone>`
- 4 件套作者 (飞马/烈马/野马) **不单独开 PR** — 全员在同一 worktree 叠 commit
- 全员 commit 完 → teamlead 唯一开 PR

**反例 (旧做法)**: 一个 milestone 拆 8-10 PR, 每个双 review + CI + rebase + §5 totals 串行写竞争 + closure follow-up 拖尾. 实际比"一 PR 整 milestone"慢得多.

## 4 件套

### 1. 飞马 spec brief
**Path**: `docs/implementation/modules/<milestone>-spec.md` (≤80 行)

结构:
- §0 关键约束 (3 立场)
- §1 拆段 ≤3 PR (schema / server / client)
- §2 留账边界 (跟其他 milestone 接口)
- §3 反查 grep 锚 (含反约束)
- §4 不在范围 (留 v2+)

实例参考: RT-1 #269 / CHN-1 #283 / AL-3 #301 / CV-1 #306 / AL-4 #313

### 2. 野马 stance checklist
**Path**: `docs/qa/<milestone>-stance-checklist.md` (≤80 行)

结构:
- 5-7 项立场, 每项一句话锚 §X.Y + 反约束 (X 是, Y 不是) + v0/v1
- 黑名单 grep + 不在范围 + 验收挂钩
- v0/v1 transition criteria (如需要, 跟 #295 v1 transition 同模式 PR # 锁规则)

实例参考: CV-1 #282/#295/#307 / AL-3 #303 / AL-4 #319

### 3. 烈马 acceptance template
**Path**: `docs/qa/acceptance-templates/<milestone>.md` (≤50 行)

结构:
- 跟拆段 1:1 对齐 (§1 schema / §2 server / §3 client)
- 验收四选一: E2E / 蓝图行为对照 / 数据契约 / 行为不变量
- REG-* 寄存器 占号 (留 ⚪ 等实施翻 🟢)
- 反查锚 + 退出条件

实例参考: CHN-1 #287 / RT-1 #291 / AL-3 #302 / CV-1 #311 / AL-4 #318

### 4. 野马 content lock (仅 client UI milestone 必备)
**Path**: `docs/qa/<milestone>-content-lock.md` (≤40 行)

结构:
- DOM 字面锁 (data-* attr / 文案 byte-identical)
- 反约束: 同义词禁词 + 反向 grep
- G2.x demo 截屏路径预备

实例参考: AL-3 #305 / DM-2 #314 / AL-4 #321

如 milestone 涉及视觉新组件, 跟斑马 design system 联动 (未来扩展)。

## 4 件套间字面一致硬条件

spec / stance / acceptance / content-lock 互相引 §X.Y 锚点, 任一漂移其他 review 时抓出 (跨 PR drift 抓得到)。

**实战例子**: 烈马 #302 sync patch 5065e59 — 自检发现 al-3.md 字段名 (Track→TrackOnline/TrackOffline, last_seen_at→last_heartbeat_at, session_id PK→UNIQUE) 跟飞马 #301 spec brief drift, 当场 patch 修齐 (双轨 review 起作用)。

## 派活模板

milestone 启动时 (**Teamlead 唯一**创建 worktree + 派活):

```bash
# 1. teamlead 创建 worktree (一 milestone 一 worktree)
cd /workspace/borgee
git worktree add .worktrees/<milestone> -b feat/<milestone> origin/main
```

```
2. 派飞马 (在 .worktrees/<milestone> 里): spec brief, commit + push, 不开 PR
3. 派野马 (同 worktree): stance checklist + content lock, commit + push, 不开 PR
4. 派烈马 (同 worktree): acceptance template, commit + push, 不开 PR
5. 派战马 (同 worktree): 三段实施 + e2e + docs/current sync + REG/acceptance/PROGRESS 翻牌, commit + push, 不开 PR
6. 全员就绪 → teamlead 唯一开 PR (gh pr create)
7. PR merged → teamlead 删 worktree
```

详细 git 协议见 `blueprintflow-git-workflow` (角色不开 PR / teamlead 唯一开 PR / 一 worktree 一 milestone).

## 拆段实施 (在同一 PR 内顺序提交)

全员在**同一 worktree + 同一 branch** 内叠 commit (角色都不开 PR, teamlead 最后开):
- 1.1 schema (migration v=N + 表 + drift test) — 战马
- 1.2 server (API + 业务逻辑 + 反向断言 test) — 战马
- 1.3 client (SPA UI + e2e Playwright) — 战马
- 1.4 docs/current sync (server / client docs) — 战马
- 1.5 REG-* 翻 🟢 + acceptance template ⚪→✅ + PROGRESS [x] — 烈马 / 战马
- (并行) spec brief — 飞马
- (并行) stance + content lock — 野马
- (并行) acceptance template — 烈马

worktree 协议:

```bash
# teamlead 创建 (唯一)
cd /workspace/borgee
git worktree add .worktrees/<milestone> -b feat/<milestone> origin/main

# 角色干活 (多人多 commit OK, 全员 push 同一 branch)
cd .worktrees/<milestone>
# ... 干活 ...
git push origin feat/<milestone>

# teamlead 唯一开 PR (所有角色就绪后)
gh pr create --title "feat(<milestone>): ..." --body "..."

# PR merge 后 teamlead 删 worktree (唯一)
cd /workspace/borgee
git worktree remove .worktrees/<milestone>
```

## Closure 在 PR 内一次落, 不开 follow-up

acceptance ⚪→✅ + REG-* + PROGRESS [x] 都在实施 PR 内同 commit 落. **不开 closure follow-up PR**.

## 反模式

- ❌ 跳过 4 件套直接实施 (立场漂移无法抓)
- ❌ 拆成多 PR (spec/schema/server/client/closure 各自一个 PR, 反而慢)
- ❌ 实施 PR 不引 spec § 锚点 (跨 PR drift 无法抓)
- ❌ 用 `/tmp/<work>` 临时 clone (改用 `.worktrees/<milestone>`)
- ❌ 一个 milestone 多个 branch (撞车 + 历史脏)
- ❌ **文案锁早于实施太久, 不跟既有实施 cross-grep**

  **背景**: AL-3 #305 文案锁草稿期写 `"出错: {reason}"`, 但 AL-1a #249 既有实施 + REG-AL1A-005 是 `"故障 ({reason})"`, 文案锁字面没跟既有实施 cross-grep, 后续 AL-3 #324 跟 AL-1a 实施对齐 (合理), 文案锁文档变孤儿 (PR #336 fix).

  **如何应用**: 写文案锁前必跑 grep 反查既有实施: `grep -rnE "<候选字面>" packages/{client,server-go}/`. 如有命中既有字面, 文案锁字面跟它对齐, 不要按草稿臆想字面写; 如既有实施跟立场冲突, 应同步改实施 + 文案锁两边 byte-identical.
