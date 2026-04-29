---
name: blueprintflow-teamlead-slow-cron-checkin
description: Teamlead 慢节奏巡检 (2-4h) — 偏差 audit + 文档/代码一致性 + 翻牌延迟纠正。fast-cron 推派活, slow-cron 推漂移修复。
---

# Teamlead 慢节奏巡检 (slow cron)

`blueprintflow:teamlead-fast-cron-checkin` 推 idle 派活, slow-cron 推漂移纠正。两个不重叠。

## 4 类 audit (按优先级)

### 1. PROGRESS.md 时效性
- 读 `docs/implementation/PROGRESS.md`, 看 Phase / milestone 行 ✅/⚪/🔄 状态
- 跟最近 24h merged PR 对账, 有 PR merged 但 PROGRESS 没翻 → 派架构师补 (≤30 LOC doc PR)
- Phase 概览行特别盯 (容易漂)

### 2. Blueprint 偏差扫描
- `git log --since="4 hours ago" --name-only` 列代码改动文件
- 关键词 (admin/auth/message/channel/agent) 文件改但蓝图同期 0 改动 — 正常 (蓝图变 → 代码变, 不反向)
- **但**代码引入新概念 (PR title 含 "新增" / "扩展" / "feat:" 但描述没引蓝图段) → 派架构师 audit, 看是否需回写蓝图

### 3. docs/current 跨 PR 累积偏差
- `git diff main HEAD docs/current/ packages/server-go/internal/ packages/client/src/`
- 规则 6 在 PR 级别强制, slow-cron 看跨 PR 累积
- 有 server/client 改但 docs/current 没跟上 → 派 QA 补
- 留账 N/A — <reason> 形式 opt-out 算正常 (跟规则 6 lint 一致), 但要看 reason 真的合理

### 4. 翻牌延迟
- merged PR > 24h, acceptance template 还 ⚪ — 漏翻
- 派 QA 翻牌 PR (跟 #287 / #289 / #315 / #320 同模式)
- regression-registry count 数学 audit (active + pending = 总计)

### 5. 已开 PR 任务完成度 audit (不只看 CI)

新协议下一 milestone 一 PR — PR 早开, 全员往里叠 commit. slow-cron 看每个 open PR 的 Acceptance/Test plan 还剩多少 `[ ]`:

- `gh pr view <N> --json body | jq -r .body | grep -E "^- \\[ \\]"` 列还没勾的项
- 多 `[ ]` 项 + 长时间无 commit (≥4h) → 派对应角色 commit 进 worktree
- **不要急着 merge**: CI 绿 + LGTM 齐 但 Acceptance 还有 `[ ]` → 留 PR comment "等 X 角色补 Y", 不 merge

**典型卡点**:
- 战马代码进了 + e2e 进了, 但 acceptance template 还 ⚪ → 烈马没 commit
- 实施全有, 但 docs/current sync 没补 → 派战马补
- 4 件套 spec 在 main 旧 PR, 没 cherry-pick 进 milestone worktree → 派飞马 commit 进 worktree

## out-of-date 红线 (兜底)
- 任一蓝图文件 mtime > 7 天且对应 milestone 在最近 PR 推进 → 派架构师在该蓝图文件加 "Last reviewed: <date>" 行
- 防"蓝图躺坟"式漂移

## 输出格式

- 一切同步: "文档同步, 无偏差"
- 发现偏差: 列具体 PR # / 文件 / 派活给谁
- 派活遵循 fast-cron 同优先级 (unblock > follow-up > forward > maintenance)

## 反模式

- ❌ 把 audit 当推进 (audit 必须派活, 否则无效)
- ❌ 4 类全跑一遍才输出 (任一发现立即派, 不等其他)
- ❌ 跟 fast-cron idle 派活混 (slow-cron 专 audit, fast-cron 专 idle)

## 调用方式

cron prompt 改成:
```
[偏差 audit · 2 小时]
follow skill blueprintflow-teamlead-slow-cron-checkin
```

## 配套

- 快节奏 idle 派活走 `blueprintflow:teamlead-fast-cron-checkin`, 不重叠
