---
name: borgee-phase-plan
description: 蓝图 ready 后, 把项目拆成 Phase + 退出 gate + 4 道防偏离闸门。落地 PROGRESS.md + execution-plan + roadmap。
---

# Phase Plan

蓝图 ready 后, Architect 主, 把项目拆成 Phase 序列, 每 Phase 锚一个**价值闭环** (端到端用户能用), 不是按层拆。

## Phase 拆分原则

按**价值闭环**拆, 不按技术层:

- ❌ 错: Phase 1 schema / Phase 2 server / Phase 3 client (技术层, 没价值)
- ✅ 对: Phase 1 身份闭环 / Phase 2 协作闭环 / Phase 3 第二维度产品 / Phase 4+ 剩余 (每 Phase 独立可演示)

**Borgee 实例**:
- Phase 0 基建 (INFRA-1)
- Phase 1 身份闭环 (CM-1 + AP-0 + CM-3) — 一人一 org, 注册即用
- Phase 2 协作闭环 ⭐ (CM-4 邀请 + 通知) — 多人多 agent 协作
- Phase 3 第二维度产品 (CHN + CV) — channel + canvas
- Phase 4+ 剩余模块

## 退出 gate 设计

每 Phase 必须有**机器化** + **用户感知**双轨退出条件:

### 严格闸 (机器化)
- e.g. G2.0 cookie 串扰反向断言 / G2.3 节流单测 / G2.6 lint 通过

### 用户感知闸 (signoff)
- 标志性 milestone 跑 demo + 野马签字 + 关键截屏
- 跨 Phase 不能省 (Phase 2 退出 = 真人能用 + 野马拍 ✅)

### 留账闸 (允许 partial signoff)
- 不阻塞 Phase 退出, 但必须挂 Phase N+1 PR # 编号锁 (规则 6)
- e.g. G2.5 留 Phase 4 AL-3 + G2.6 留 Phase 4 BPP-1 lint

实例: Phase 2 退出 announcement (#268) 5 SIGNED + 3 PARTIAL + 2 DEFERRED, 全挂 Phase 4 PR # 编号锁。

## 4 道防偏离闸门

每 milestone 实施前必须挂 4 道闸:

1. **闸 1 模板自检** (Architect): spec brief 用模板写, 验通用性
2. **闸 2 grep §X.Y 锚点** (Architect): 每 milestone 有蓝图锚点
3. **闸 3 反查表** (PM + Architect): 每模块文档末尾, 立场一句话写不出 = 漂移
4. **闸 4 标志性 milestone 签字 + 关键截屏** (PM, AI 团队不录视频)

闸 1+2 在 spec brief PR 走 (`borgee:milestone-fourpiece`), 闸 3 在 stance + acceptance 走, 闸 4 在 demo signoff 走 (`borgee:phase-exit-gate` 收尾)。

## 落地清单

**Path**: `docs/implementation/`

- **PROGRESS.md** — 单一进度真相, 每 PR / Phase gate 状态变化更新
- **00-foundation/execution-plan.md** — 5 Phase + 退出 gate + 4 道闸门
- **00-foundation/roadmap.md** — 缩略图 + 首波 demo 路径
- **00-foundation/how-to-write-milestone.md** — milestone 模板 + acceptance 四选一
- **modules/** — 11 模块大纲, 每 milestone 拆到 PR 级 (≤ 3 天 / ≤ 500 行)

## PROGRESS.md 模板

```
| Phase | 状态 | 退出条件 | 备注 |
|-------|------|---------|------|
| Phase 0 基建闭环 | ✅ DONE | G0.x 全过 | 起步 |
| Phase 1 身份闭环 | ✅ DONE | G1.x 全过 | CM-1+AP-0+CM-3 |
| Phase 2 协作闭环 ⭐ | 🔄/✅ | 严格 N + 留账挂 Phase 4 PR # | CM-4 ⭐ |
| Phase 3 第二维度 | TODO | G3.x + 野马签字 | 等 Phase 2 |
| Phase 4+ 剩余 | TODO | G4.audit | 等 Phase 3 |
```

每 PR merged 立即更新对应 milestone 行 ⚪→✅ (走 follow-up 翻牌 PR, 跟 `borgee:pr-review-flow`)。

## 反模式

- ❌ 按技术层拆 Phase (没价值闭环)
- ❌ 退出 gate 只靠机器化 (漏用户感知)
- ❌ 留账闸不挂 Phase N+1 PR # (规则 6 强制)
- ❌ PROGRESS.md 不及时更新 (slow-cron audit 抓出会派活补)

## 调用方式

蓝图 ready 后:
```
follow skill borgee-phase-plan
落 PROGRESS.md + execution-plan + roadmap
```
