---
name: blueprintflow-pr-review-flow
description: PR open 后 review + merge 流程 — 双 review 路径 / LGTM 模板 / 标准 squash merge / **永久禁** admin bypass + ruleset disable。
---

# PR Review Flow

PR open 后到 merged 的标准流程.

## 🚫 永久禁 (硬红线 — 不可商量)

以下手段**永远禁用**, 任何场景任何理由都不允许. 这是用户 2026-04-29 拍板的硬红线, 不接受 "临时" / "兜底" / "flaky" / "急" 任何借口:

1. **`gh pr merge --admin`** — 任何形式的 admin bypass flag
2. **Ruleset disable / restore** — 哪怕 "≤10s 暴露" 也不行
3. **任何绕过 required CI checks 的方式** — 改 ruleset 移除 check / 改 branch protection / 关 required reviewers / 给自己加 admin role 等等

**为什么是硬红线**:
- admin bypass 掩盖 bug — flaky 后面是真 bug 的概率比表面看高
- 让 "CI 真过" 协议失效, 团队信号噪音化
- 历史血账: e2e fail bypass 进 main 多次, 每次都得 hotfix 善后

**真 flaky / 真误报怎么办**:
- 真 flaky → 真修根因 (e.g. RT-1.2 #300 修 e2e harness setOffline 不关握手 WS)
- lint 误报 → 修 lint regex (e.g. #446 lint 改 `gh api` 读 body 修 stale event payload)
- coverage 卡线 → 真补 test 提覆盖率
- e2e 真 fail → 退给 author 修 bug
- 任何场景下, **"等我修完再合"** 是唯一答案, 不存在 "先合进去再说" 选项

**反模式 (永久)**:
- ❌ `gh pr merge --admin` 任何场景
- ❌ `gh api -X PUT /rulesets/<id> -f enforcement=disabled` 任何场景
- ❌ 派 "admin merge agent" / "batch admin merge agent" — agent 名字本身已弃用
- ❌ "ruleset 兜底" / "临时过渡" 这类话术 — 不存在临时, 临时就是永久的开始

## PR template 必备

顶部 4 行裸 metadata + 2 段 H2:

```
Blueprint: blueprint/<file>.md §X.Y
Touches: <packages or docs>
Current 同步: <说明 or N/A — 理由>
Stage: v0|v1

## Summary
...

## Acceptance
- [x] ...

## Test plan
- [x] ...
```

PR template lint 5 字段缺任一 → 红, 走 lint patch 流程修 (修 body / 修 lint regex, **不绕**).

## 双 review 路径

每 PR ≥30 min 内派双 review:

| PR 类型 | reviewer 1 | reviewer 2 | reviewer 3 (可选) |
|---|---|---|---|
| 战马实施 PR | 飞马 (架构) | 烈马 (acceptance) | — |
| 飞马 spec brief PR | 战马 (实施视角) | 烈马 (acceptance 可机器化) | 野马 (立场) |
| 野马 stance / content-lock PR | 飞马 (架构) | 烈马 (acceptance) | — |
| 烈马 acceptance template / 翻牌 PR | 飞马 (架构) | 野马 (立场, 仅 v0 立场相关时) | — |
| 涉敏感写动作 (auth/admin) PR | + 矮马 (security) | | |

LGTM 命令 (author 不能 self-approve):
```
gh pr comment <num> --body "LGTM (理由 ≤30字)"
```

review 内容必须包含锚 (跟 spec/stance/acceptance 字面 cross-check):
- 跟 #<other-PR> 字面对得上吗?
- §X.Y 反约束守住吗?
- 跟 byte-identical 模板 (e.g. #237 envelope) 一致吗?

**Merge 三联签** (CI + LGTM + 任务完成度):
- ① CI 真过 (statusCheckRollup 全 SUCCESS, 永远不 admin/ruleset bypass)
- ② ≥1 non-author LGTM (gh pr review --approve OR LGTM 评论 from 不同 reviewer 身份)
- ③ **teamlead 审 PR body Acceptance + Test plan 全勾** (`gh pr view <N> --json body | jq -r .body | grep -cE "^- \[ \]"` 必须 == 0)

三联签全过 → 标准 squash merge. 任一缺 → 不合.

详细 merge gate 协议见 `blueprintflow-teamlead-fast-cron-checkin §5`. 任务完成度判据 (一 milestone 一 PR 协议下) 在那里展开.

### Review subagent 并行模式 (加速 — 推荐)

不派 SendMessage 给 persistent 角色 (飞马/烈马/野马) 而是 spawn fresh review subagent. 三个收益:

1. **不打断**: persistent 角色继续手头工作 (写 spec / acceptance / 文案锁), 不切回来 review
2. **context 干净**: subagent 只读 PR + spec + 几个 cross-ref 锚, 没 inbox 噪音
3. **可并行**: 同时派 N 个 subagent (架构 + 立场 + 文案 各一), 一波出多 LGTM

**实测**: #384 CV-4 acceptance 双 review subagent (架构 36s + 立场 62s 并行) ≈ 62s 总耗时, vs persistent 角色串行 6-10min. **8x 速度提升**.

#### 派 review subagent 模板

```
Agent({
  description: "Parallel <视角> review #<N>",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: `
你是 codetreker/<repo> 项目的临时 reviewer (subagent, fresh context, 不是 persistent 角色).

任务: review **PR #<N> <题目>** (<author> author).
视角: **<架构 | 立场 + 文案 | acceptance + 反查锚>** 角度.

## 必读锚
1. \`gh pr view <N>\` — PR body + diff
2. \`gh pr diff <N>\` — 看具体改动
3. <spec brief / 文案锁 / acceptance template / 既有 cross-ref PR>
4. (可选) PR # 既有 LGTM 评论 — 已覆盖角度你不重复

## review 检查清单 (机器化反查)
- [ ] 拆段 1:1 跟 spec brief 对齐
- [ ] count 数学正确 (e.g. 26 项 = 5+7+7+7)
- [ ] byte-identical 锚跟 N 源对齐 (列出具体 PR # / commit SHA)
- [ ] 反约束 grep N 行强类型 (列出具体 grep pattern)

## 输出
- 全过: \`gh pr comment <N> --body "LGTM (<视角> review subagent). [一句话总结校验点]"\` — 落 GitHub
- NOT-LGTM: 不 comment, 报回具体问题点 + 引文 + 建议改法.

报告 ≤200 字.
`
})
```

#### 适用 vs 不适用

| 适用 | 不适用 |
|---|---|
| 4 件套例行 review (byte-identical / 反约束 grep / 拆段 1:1) | 架构判断 / drift 综合仲裁 (e.g. envelope 9 vs 10 字段算不算 drift) |
| acceptance template / stance / 文案锁 review | spec brief 真写 (创造性工作) |
| count 数学对账 / REG 占号翻牌 | NOT-LGTM 仲裁 (升级 persistent 角色) |

#### 混合模式协议

1. PR open → 派 review subagent (N 角度并行) 跑机器化校验
2. 全 LGTM + CI 真过 → 标准 merge (见下方 Merge 段, **永远不 admin/ruleset bypass**)
3. NOT-LGTM 或跨 PR drift 嫌疑 → 升级给 persistent 角色仲裁
4. persistent 角色保留: spec brief / stance / acceptance / 文案锁 author 工作 + drift 仲裁 + 跨 milestone 综合判断

#### 反模式

- ❌ subagent review 替 persistent 角色 author 工作 (subagent 只读不写 spec brief / 文案锁)
- ❌ NOT-LGTM 由 subagent 自己仲裁 (升级 persistent)
- ❌ subagent prompt 不带具体 cross-ref PR # / commit SHA (review 失去 byte-identical 验证能力)

## Merge (标准 squash, 永远不 admin)

派 general-purpose agent (background) 跑. **绝对不 admin / 不 ruleset disable / 不 bypass 任何 required check**:

```
Merge PR #<N>:

1. gh pr view <N> --json statusCheckRollup,mergeStateStatus,reviews,body
2. 检查 ≥1 non-author LGTM (gh pr review --approve OR LGTM 评论 from 不同 agent role)
3. 如 PR template lint 缺字段:
   patch body via gh api -X PATCH /repos/<owner>/<repo>/pulls/<N> --input <(jq ...)
   close+reopen 触发 lint rerun (修 body, **不**修 lint enforcement)
4. CI 真过 (statusCheckRollup 全 SUCCESS) + mergeable=CLEAN + ≥1 non-author LGTM
   → gh pr merge <N> --squash --delete-branch
   (注意: 命令里**不允许**带 --admin)
5. 任何 fail 场景退给 author 修, 不 bypass:
   - go-test/client-vitest/e2e/bpp-envelope-lint/coverage/build/typecheck FAILURE → author 修
   - PR template lint regex 误报 → 修 lint regex 让真合规 body 过, 不 bypass
   - DIRTY → author rebase main
   - 真 flaky → 重 trigger CI 重跑, 仍 fail 退 author 修根因
6. 报 merge time + SHA. 报告里**禁止**出现 "admin" / "ruleset disable" / "bypass" 任何字眼
```

注: `gh pr edit --body` 在某些环境不生效, 用 `gh api PATCH` 直 patch JSON.

### Batch 模式 (加速 — 多 PR 一波, 仍标准 squash)

不派 1 merge agent / 1 PR, 而是 1 agent 接 N 个 PR. 共享 lint/PR template 知识, 不重复检查. **batch 也是标准 squash, 不 admin / 不 ruleset disable**.

**实测**: 8 PR 一波 5min, vs 单 PR 单 agent ~5min × 8 = 40min. **8x 速度提升**.

#### 派 batch merge agent 模板

```
Agent({
  description: "Batch merge N PRs (squash, 不 admin)",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: `
repo: codetreker/<repo>. batch merge 多个 PR (顺序无关并发):

| PR | 内容 | LGTM |
|---|---|---|
| #N1 | <内容> | <reviewer1> + <reviewer2> ✅ |
| #N2 | <内容> | <reviewer1> ✅ (待 <reviewer2>, 报回不 merge) |
...

**协议硬红线**:
- 绝对不 \`--admin\` flag
- 绝对不 ruleset disable / PUT enforcement=disabled
- CI 任何 fail → 不合, 退 author 修

执行顺序:
1. 先处理已 ≥1 non-author LGTM + CI 真全绿 + mergeable=CLEAN 的
2. 不达标的报回, 不强 merge

每个:
- \`gh pr view <N> --json statusCheckRollup,mergeStateStatus,reviews\`
- PR template lint fail → patch body via gh api PATCH + close+reopen (不 bypass lint)
- CI 全绿 + CLEAN + ≥1 non-author LGTM → \`gh pr merge <N> --squash --delete-branch\`
- 报回 SHA + 时间 ≤80 字 each

总报告 ≤300 字, 列每个 PR 状态 (merged 或待 LGTM/CI 跳过). 报告里禁止出现 admin/ruleset/bypass 字眼.
`
})
```

#### 触发信号

- reviewer 一波给多 PR LGTM (e.g. "**双批 LGTM 信号**: #380 + #382") → batch agent
- 4 件套 acceptance 一波交多 PR (e.g. CV-3 + CHN-3 #376) → batch agent

#### 反模式

- ❌ batch 含 NOT-LGTM 的 PR (混 review 状态, agent 不知该停还是跳过)
- ❌ batch 含跨 base 互相依赖的 stacked PR (顺序锁需 sequential, 不能并发)
- ❌ batch agent 数 > 5 (一个 agent 跟踪多 PR 错乱风险)
- ❌ batch agent prompt 含 `--admin` / ruleset disable 任何指令 — **永久禁**

## 跨 review 例子: 立场漂移抓出

烈马 review #302 al-3 acceptance 时自检, 发现 acceptance template 字段名跟飞马 #301 spec brief 不一致 (Track vs TrackOnline / last_seen_at vs last_heartbeat_at), 当场 patch 5065e59 修齐, 不等审完。

这就是双轨 review 起作用 — spec 写 A 形态, acceptance 自然按 A 写, drift 可以发现。

## 反模式 (汇总)

**永久禁 (硬红线, 已在文首单列)**:
- ❌ `gh pr merge --admin` 任何场景
- ❌ ruleset disable/restore 任何场景
- ❌ 任何绕过 required CI check 的方式
- ❌ "ruleset 兜底" / "admin merge agent" / "临时过渡" 话术

**操作反模式**:
- ❌ LGTM 不读 PR 内容, 模板字面套话 (失去 cross-check 价值)
- ❌ 实施 PR 把 acceptance template ⚪→🟢 翻牌写一起 (按 一 milestone 一 PR 协议, 翻牌跟实施同 PR; 不开 follow-up 翻牌 PR)
- ❌ 跳过 PR template 5 字段 (lint 拒, 不要走 ## H2 重复 metadata 绕过)
- ❌ merge agent 报告里出现 admin/ruleset/bypass 字眼 (透明度 + 红线警报)
- ❌ self-LGTM 算双批 (同 GH 账号多 agent 评论 LGTM 不算 ≥1 non-author, 必须真 reviewer 不同身份)

## 调用方式

PR open 后:
```
follow skill blueprintflow-pr-review-flow
派 review for PR #<N>
```
