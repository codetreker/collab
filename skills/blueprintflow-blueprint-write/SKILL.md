---
name: blueprintflow-blueprint-write
description: 概念锁定后, Architect + PM 落蓝图模板 — 核心立场 / 概念模型 / 反约束 / v0/v1 边界。docs/blueprint/*.md 是产品形状的 source of truth。
---

# Blueprint Write

`docs/blueprint/*.md` 是产品形状的 source of truth, 后续 PR 必引 §X.Y 锚点。蓝图 freeze 后, 实施跟着蓝图走, 不反向。

## 蓝图结构

`docs/blueprint/` 目录下:

- **README.md** — 14 条核心立场清单 (产品立场最权威表达)
- **concept-model.md** — 一等概念 (e.g. org / human / agent / channel) + 关系
- **<module>.md** — 每模块产品形状 (e.g. admin-model / channel-model / agent-lifecycle / canvas-vision / plugin-protocol / realtime / auth-permissions / data-layer / client-shape)
- **onboarding-journey.md** — 用户首次使用旅程

Borgee 实例: 11 篇蓝图 + 14 条核心立场。

## 单篇蓝图模板

```markdown
# <Module Name> (产品形状)

## §1 核心概念

### §1.1 <一等概念>
一句话定义 + 跟其他概念的关系 + 反约束 (X 是, Y 不是)。

### §1.2 ...

## §2 不变量 / 红线

5-10 条产品级红线, 任意实施都不能违反:
- 红线 ①: ... (反约束写明)
- 红线 ②: ...

## §3 v0/v1 边界

### v0 (无外部用户)
- 允许删库重建 / 不写 backfill / 直接换协议
- 实施侧自由度高

### v1 (第一个外部用户后)
- forward-only schema / backup / 灰度
- 不再删库

## §4 反约束 (留 v2+)
明确不在 v1 范围 (e.g. CRDT / 多端协作 / 锚点对话扩展)

## §5 验收挂钩
跟 acceptance template / stance checklist 怎么对接 (引锚)
```

## 14 条核心立场示例 (Borgee README §核心)

每条一句话 + 反约束 + 关键场景:

1. **一个组织 = 一个人 + 多个 agent** (UI 隐藏 org 概念, 用户视角是"我和我的 agent")
2. **Agent 代表自己** (不是工具 / 不是 owner 的代理 / agent ↔ agent 协作允许有边界)
3. **沉默胜于假 loading** (§11 — 不显示 spinner, 不显示"正在思考...")
4. **workspace + chat 双支柱** (artifact 不在聊天里, channel 协作不挤入 workspace)
5. **Borgee 不带 runtime** (§7 — agent runtime 是 plugin 自己事, Borgee 只挂 process descriptor)
6. **管控元数据 OK, 读你内容必须授权** (§13 — admin god-mode 边界)
7-14: ...

每条立场必须能写出 5-7 项反查 (`blueprintflow:milestone-fourpiece` stance checklist 用)。

## 立场写不出反约束 = 立场不成立

实战检查: 每条立场必须能写出"X 是, Y 不是"双向。

- ✅ "Agent 代表自己" → 反约束: "agent 不是 owner 的代理 / agent ↔ agent 协作允许跨 owner / mention agent ≠ mention owner"
- ❌ "用户体验好" → 反约束写不出 → 立场太虚, 不入蓝图

## 流程

### 1. 概念多轮讨论
跟 `blueprintflow:brainstorm` 配套 — Teamlead 主持 PM + Architect 多轮 (Borgee 跑了 11 轮), 每轮锁 1-2 个概念 + 立场。

### 2. 落蓝图 (PR)
Architect + PM 配对落 docs/blueprint/<module>.md, 走 PR review (战马 + QA 也参与, 立场必须 dev/QA 也认同, 否则实施漂)。

### 3. 14 立场清单出炉
所有模块蓝图 review 完, 提炼 14 立场到 README.md, 标注 ⭐ 重要立场 (后续 acceptance 必查)。

### 4. 蓝图 freeze
freeze 后修改走 PR + 4 角色 review (跟实施 PR 同审格)。修改原因写 changelog, 影响 milestone 全部回查。

## 反模式

- ❌ 立场写抽象空话 (反约束写不出 = 立场不成立)
- ❌ 跳过反查表只写主张 (立场漂 acceptance 抓不出)
- ❌ 蓝图频繁改不 freeze (实施跟着抖, 立场失焦)
- ❌ 蓝图 §X.Y 锚点不规范 (PR 引用 grep 不出)

## 调用方式

概念多轮讨论锁定后:
```
follow skill blueprintflow-blueprint-write
落 docs/blueprint/<module>.md
```
