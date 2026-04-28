---
name: blueprintflow-brainstorm
description: 概念层多轮讨论 driver — Teamlead 主持 PM + Architect 锁立场 + 概念 + 反约束。新模块 / 新立场 / 蓝图改动前必走。
---

# Brainstorm

模糊产品 idea → 可写蓝图的核心立场 + 概念模型 + 反约束。Teamlead 主持 PM + Architect (按需 + Designer / Security), 多轮讨论, 每轮锁 1-2 个概念。

## 何时用

- 新产品起步 (跟 `blueprintflow:blueprint-write` 配套)
- 新模块加入 (e.g. CV-2 加 anchor 对话)
- 现有立场冲突 (实施暴露立场没拍清楚)
- 蓝图改动 (大改之前必经)

## 不用的场景

- 实施细节技术选型 (e.g. SQLite vs Postgres) — 这是 spec brief 的事, 不是 brainstorm
- 已锁立场的 milestone 实施 (跟 `blueprintflow:milestone-fourpiece` 走)

## 多轮讨论结构

### 轮 1: 范围划定
Teamlead 抛 3 题, PM + Architect 各答 ≤ 200 字:
- Q1: 这模块的**一等概念**是什么? (≤ 3 个)
- Q2: 跟现有概念 (org / agent / channel) 关系?
- Q3: 反向边界 — 什么**不是**这模块的事?

### 轮 2-N: 立场争论
每轮挑 1-2 个具体立场展开, PM 给用户视角, Architect 给可行性, Teamlead 仲裁:
- 立场 X 写得清吗? (能否写出 "X 是, Y 不是" 反约束)
- 跟其他立场冲突? 选哪个?
- v0 / v1 边界拍清楚吗?

每轮产出 ≤ 5 行立场草稿, 入下轮基线。

### 末轮: 立场 freeze
Teamlead 总结 5-7 立场 + 反约束, PM + Architect 双签字, 进 `blueprintflow:blueprint-write` 落地。

实例: Borgee 跑了 11 轮 brainstorm, 锁 14 条核心立场。

## Teamlead 主持原则

### 不替别人答
- 派活给 PM/Architect, 自己只仲裁
- 仲裁基准: 跟现有立场冲突? v0/v1 边界? 反约束写不写得出?

### 推动落地
- 每轮强制产出 ≤ 5 行立场草稿 (写不出 = 不成立, 退轮)
- 不允许 "等更多信息" 拖延 (信息永远不够, 拍立场)

### 收敛 5-7 立场
- 不要无限扩展 (太多立场记不住, 实施漂)
- 14 立场是产品级总数, 单模块 5-7 立场已够

## 立场写法 (强约束)

每条立场必须含:
- **一句话主张** (≤ 30 字, 用户能复述)
- **反约束** (X 是, Y 不是, 防漂移)
- **关键场景** (一个 demo 能跑出来的例子)
- **v0/v1 边界** (现在做到哪, 以后做到哪)

实例 (Borgee §11 沉默胜于假 loading):
- 主张: 不显示 spinner / 进度条 / "正在思考..."
- 反约束: agent 处理时 UI 静止, 不 fake 进度; 真完成才显示结果
- 场景: agent 编辑 artifact, 用户看不到中间态, 直到 commit
- v0: 全静默; v1 视用户反馈考虑加 "thinking" subject 提示 (但仍不 fake)

## 多轮讨论的反模式

- ❌ 第一轮就想锁全部立场 (不收敛, 拖死)
- ❌ Teamlead 替 PM 答用户立场 (没经过用户视角讨论, 实施侧立场漂)
- ❌ 每轮不出立场草稿 (空谈)
- ❌ 立场写抽象空话 (反约束写不出 → 退轮重写)
- ❌ 实施细节抢戏 (e.g. 讨论用 SQLite 还是 Postgres) — Teamlead 必须打断, 拉回立场

## 产出 checklist

brainstorm 完结时:
- [ ] 5-7 立场全有 "主张 + 反约束 + 场景 + v0/v1 边界"
- [ ] 反约束能机器化 (反向 grep / 反向断言)
- [ ] PM + Architect 双签字
- [ ] 入 `blueprintflow:blueprint-write` 写蓝图

## 调用方式

新模块 / 新立场:
```
follow skill blueprintflow-brainstorm
开始多轮讨论 (Teamlead + PM + Architect)
```

讨论收敛后接 `blueprintflow:blueprint-write`。
