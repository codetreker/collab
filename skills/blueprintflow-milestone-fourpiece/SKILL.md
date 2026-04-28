---
name: blueprintflow-milestone-fourpiece
description: Milestone 启动 4 件套并行模板 — spec brief / stance checklist / acceptance template / content lock。4 PR 互引 §X.Y, drift 跨 PR review 抓出。
---

# Milestone 4 件套

每个 milestone 实施前必须先落 4 个 docs PR 形成基线, 才开实施。**4 件套并行**, 不是串行 — 互引 §X.Y, drift 跨 PR review 抓出。

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

milestone 启动时 (Teamlead):

```
1. 派飞马: spec brief (临时 clone, ≤80 行)
2. 派野马: stance checklist (临时 clone, ≤80 行)
3. 派烈马: acceptance template (临时 clone, ≤50 行, 引飞马 spec + 野马 stance 锚)
4. (仅 client UI) 派野马: content lock (临时 clone, ≤40 行)

4 件套 ready 后 PR open, 派 review (走 blueprintflow:pr-review-flow)
```

## 拆段实施 (4 件套 merged 后)

战马按 §1 拆段顺序实施, 每段 ≤3 天 / ≤500 行:
- 1.1 schema (migration v=N + 表 + drift test)
- 1.2 server (API + 业务逻辑 + 反向断言 test)
- 1.3 client (SPA UI + e2e Playwright)

每段 PR 走 `blueprintflow:pr-review-flow`。

## Follow-up patch 模式

milestone PR merged 后, 单独开 patch PR 翻 🟢 (不在原 PR 加 commit, 历史干净):
- acceptance template 段翻 🟢 + 实施证据回填 (引 PR # + commit SHA)
- regression-registry 加 REG-* 行 (count 数学对账 + 留账标 ⚪/⏸️)

实例: CHN-1.3 #289 / RT-1 closure #298 / AL-3.1 #315 / AL-3.2 #320

## 反模式

- ❌ 跳过 4 件套直接实施 (立场漂移无法抓)
- ❌ 4 件套串行写 (拖慢 milestone 启动)
- ❌ 实施 PR 不引 spec § 锚点 (跨 PR drift 无法抓)
- ❌ 实施 PR 把 acceptance template ⚪→🟢 翻牌也写一起 (历史脏, 拆 follow-up PR)
- ❌ **文案锁早于实施太久, 不跟既有实施 cross-grep**

  **背景**: AL-3 #305 文案锁草稿期写 `"出错: {reason}"`, 但 AL-1a #249 既有实施 + REG-AL1A-005 是 `"故障 ({reason})"`, 文案锁字面没跟既有实施 cross-grep, 后续 AL-3 #324 跟 AL-1a 实施对齐 (合理), 文案锁文档变孤儿 (PR #336 fix).

  **如何应用**: 写文案锁 (任何 content-lock PR) 前必跑 grep 反查既有实施: `grep -rnE "<候选字面>" packages/{client,server-go}/`. 如有命中既有字面, 文案锁字面跟它对齐 (实施先于文案锁的情况下), 不要按草稿臆想字面写; 如既有实施跟立场冲突, 应同步开 patch 改实施 + 文案锁两边 byte-identical, 不能让文案锁字面孤儿留账.
