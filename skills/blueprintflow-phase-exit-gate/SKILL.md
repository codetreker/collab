---
name: blueprintflow-phase-exit-gate
description: Phase 收尾 — 4 角色联签 PR + closure announcement + 留账 PR # 锁规则 6。条件性 ✅ SIGNED 模式允许 partial signoff。
---

# Phase Exit Gate

Phase 退出 = 严格闸 ✅ + 留账挂 Phase N+1 PR # + 4 角色联签 + closure announcement。

## 退出条件

### 1. 严格闸全 ✅
机器化条件 (e.g. G2.0/G2.3/G2.audit/G2.6) 全 SIGNED, 走 commit SHA 锚点。

### 2. 留账挂 Phase N+1 PR # 编号锁 (规则 6)
partial 闸 (e.g. G2.5/G2.6 留账) 挂占号 PR # — 不是空头措辞, 必须真 PR 号 (跟 #274 BPP-1 / #277 AL-3 stub 同模式)。

实例: Phase 2 #268 announcement G2.5 留账行 → 锁 #277 AL-3 占号 PR; G2.6 留账行 → 锁 #274 BPP-1 spec stub。

### 3. 条件性 ✅ SIGNED 模式 (允许 partial)
不强制全闸严格 ✅, 允许:
- N 闸严格 ✅
- M 闸 PARTIAL (按 condition signoff 形式挂闭合路径)
- K 闸 DEFERRED (留 Phase N+1 PR # 锁)

公告 title 锁 "条件性全过", 不写"全过" (诚实工程)。

实例: Phase 2 退出 #268 5 SIGNED + 3 PARTIAL + 2 DEFERRED → "条件性全过"。

### 4. 4 角色联签
每个角色独立 PR signoff (跟 #271/#272/#273/#279 同模式):
- Architect (飞马): readiness review 拍 ✅, 引 PR 锚点
- QA (烈马): acceptance + REG count 数学对账, 引 acceptance-templates 锚
- PM (野马): 立场 OK + 反约束守住, 引立场反查表锚
- Dev (战马): 实施侧 acceptance 全挂闸, 引实施 PR 锚

每个 signoff PR ≤ 5 行修改 (在 announcement §7 表格加一行)。

## 流程

### Step 1: Architect readiness review
- 落 `docs/qa/phase-N-readiness-review.md` (≤100 行)
- 5 闸 SIGNED 状态汇总 + PR 锚点
- 拍 ✅ ready / ⚠️ blockers
- Phase N+1 entry 前置依赖 + 唯一冲突点

实例: #267 Phase 2 readiness review 拍 ✅ READY (条件性全过 4 闸 + 2 留账)。

### Step 2: closure announcement skeleton
- 落 `docs/qa/phase-N-exit-announcement.md` (≤80 行)
- §1 SIGNED / PARTIAL / DEFERRED 三段
- §2-§5 各闸引 PR # / commit SHA + acceptance-templates 锚
- §7 4 角色联签位 placeholder
- §8 changelog v1.0

实例: #268 Phase 2 exit announcement v1。

### Step 3: 4 角色联签 (每个独立 PR)
每角色拉新 branch `docs/<role>-phase-N-cosign`, edit announcement §7 自己那行加 ✅ + 日期 + 锚点。

### Step 4: 占号 PR 全 merged 后再合联签 4 PR
留账闸 PR # 锁的占号 PR 必须先 merged (e.g. #274 BPP-1 stub / #277 AL-3 stub), 然后联签 4 PR 一波 admin merge。

### Step 5: closure announcement v2 + Phase N+1 启动
- patch announcement 加 §9 关闭宣布段 (date + 留账明细 + Phase N+1 entry 解封信号)
- PR title `docs(qa): Phase N closure announcement (建军 <date>)`

实例: Phase 2 #284 closure announcement (建军 2026-04-28) — 4 联签齐 + 留账 PR # 锁 + Phase 3 entry 解封 (CHN-1 / CV-1 / RT-1 三主线 ready)。

## 反模式

- ❌ 留账闸不挂 PR # 用空头措辞 ("BPP-1 同 PR" 而不是 "BPP-1 #274")
- ❌ 强制全闸严格 ✅ 拖延 Phase 退出 (条件性 ✅ SIGNED 是诚实, 不是妥协)
- ❌ 4 联签合一 PR (历史脏, 责任不清)
- ❌ 占号 PR 还没 merged 就合联签 (锚 PR 不存在, 逻辑断)

## 调用方式

Phase 进入收尾期 (严格闸全 ✅, 留账挂占号 PR):
```
follow skill blueprintflow-phase-exit-gate
派 readiness review → announcement skeleton → 4 联签 → closure
```
