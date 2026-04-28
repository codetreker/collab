---
name: blueprintflow-pr-review-flow
description: PR open 后 review + admin merge 流程 — 双 review 路径 / LGTM 模板 / lint patch / admin merge agent / ruleset 兜底。
---

# PR Review Flow

PR open 后到 merged 的标准流程, 含双 review 路径 + admin merge agent + ruleset 兜底协议。

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

PR template lint 5 字段缺任一 → 红, 走 lint patch 流程修。

## 双 review 路径

每 PR ≥30 min 内派双 review:

| PR 类型 | reviewer 1 | reviewer 2 | reviewer 3 (可选) |
|---|---|---|---|
| 战马实施 PR | 飞马 (架构) | 烈马 (acceptance) | — |
| 飞马 spec brief PR | 战马 (实施视角) | 烈马 (acceptance 可机器化) | 野马 (立场) |
| 野马 stance / content-lock PR | 飞马 (架构) | 烈马 (acceptance) | — |
| 烈马 acceptance template / 翻牌 PR | 飞马 (架构) | 野马 (立场, 仅 v0 立场相关时) | — |
| 涉敏感写动作 (auth/admin) PR | + 矮马 (security) | | |

LGTM 命令 (author=lead-agent 不能 self-approve):
```
gh pr comment <num> --body "LGTM (理由 ≤30字)"
```

review 内容必须包含锚 (跟 spec/stance/acceptance 字面 cross-check):
- 跟 #<other-PR> 字面对得上吗?
- §X.Y 反约束守住吗?
- 跟 byte-identical 模板 (e.g. #237 envelope) 一致吗?

双 LGTM + CI 全绿 → 派 admin merge agent。

## Admin merge agent

派 general-purpose agent (background) 跑:

```
Admin merge PR #<N>:

1. gh pr view <N> --json statusCheckRollup,mergeStateStatus,body
2. 如 PR template lint 缺字段 (常见 5 项: Blueprint / Touches / Current 同步 / Acceptance / Stage):
   patch body via gh api -X PATCH /repos/<owner>/<repo>/pulls/<N> --input <(jq ...)
   close+reopen 触发 lint rerun
3. CI 全绿 + mergeable=CLEAN → gh pr merge <N> --squash --admin
4. 报 merge time + SHA + lint 修没 + 用没 ruleset 兜底
```

注: `gh pr edit --body` 在某些环境不生效, 用 `gh api PATCH` 直 patch JSON。

## Ruleset 兜底协议 (谨慎用)

ruleset 拦 e2e flake 时:

### 第一步: 真假 flake 判定
- ≥2 次 retry 都 fail 同样错误 → **真 bug, 退给 dev**, 不要 ruleset 兜底 (掩盖 bug)
- 重新 trigger CI 后绿 → 真 flake, 可走兜底

### 第二步: disable/restore 兜底 (一窗口处理多 PR 减少暴露)

```bash
# 1. 备份 ruleset
gh api /repos/<owner>/<repo>/rulesets/<id> > /tmp/ruleset_backup.json

# 2. disable
gh api -X PUT /repos/<owner>/<repo>/rulesets/<id> -f enforcement=disabled ...

# 3. merge (一窗口可合多个 PR)
gh pr merge <N1> --squash --admin
gh pr merge <N2> --squash --admin

# 4. 立即 restore (≤10s 暴露)
gh api -X PUT /repos/<owner>/<repo>/rulesets/<id> -f enforcement=active ...
```

实战案例: Borgee ruleset 15323733 (e2e required check 无 admin bypass), RT-1.2 backfill spec flake 期间多 PR 用 disable/restore 兜底。

注意: ruleset 兜底是**临时过渡**, 真 flake 必须修 (e.g. RT-1.2 #300 修了 e2e harness Playwright setOffline 不关握手 WS 的根因)。

## Follow-up 翻牌 PR (跟原实施 PR 拆开)

实施 PR merged 后, 单独开 patch PR (历史干净):
- acceptance template 段 ⚪→🟢 + 实施证据回填 (test 函数名 + commit SHA)
- regression-registry 加 REG-* 行 (count 数学对账)
- docs/current 留账补丁 (如原 PR 用 N/A opt-out, follow-up 真实补)

实例: CHN-1.3 patch #289 / AL-3.1 翻牌 #315 / AL-3.2 flip #320

## 跨 review 例子: 立场漂移抓出

烈马 review #302 al-3 acceptance 时自检, 发现 acceptance template 字段名跟飞马 #301 spec brief 不一致 (Track vs TrackOnline / last_seen_at vs last_heartbeat_at), 当场 patch 5065e59 修齐, 不等审完。

这就是双轨 review 起作用 — spec 写 A 形态, acceptance 自然按 A 写, drift 可以发现。

## 反模式

- ❌ ruleset 兜底跑 e2e 真 fail PR (掩盖 bug)
- ❌ LGTM 不读 PR 内容, 模板字面套话 (失去 cross-check 价值)
- ❌ 实施 PR 把 acceptance template ⚪→🟢 翻牌写一起 (历史脏, 拆 follow-up)
- ❌ 跳过 PR template 5 字段 (lint 拒, 不要走 ## H2 重复 metadata 绕过)
- ❌ admin merge agent 不报 ruleset 兜底用没用 (透明度差)

## 调用方式

PR open 后:
```
follow skill blueprintflow-pr-review-flow
派 review for PR #<N>
```
