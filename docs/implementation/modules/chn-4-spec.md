# CHN-4 spec brief — channel 协作场骨架 demo (G3.4 退出公告硬约束)

> 飞马 · 2026-04-29 · ≤80 行 spec lock (实施视角 3 段拆 PR 由战马 落; 跟既有 5 spec 全闭后写, 锚最干净)
> **蓝图锚**: [`channel-model.md`](../../blueprint/channel-model.md) §1.1 (Channel = 协作场: 聊天流 + workspace 双支柱) + §3.1 (channel "协作场"现状; 下一步 workspace 升级为协作场另一支柱) + [`canvas-vision.md`](../../blueprint/canvas-vision.md) §1.3 (workspace 内置 channel 自带, 权限继承)
> **关联**: 已闭/进行中前置 — CV-1 ✅ (markdown artifact + 版本) / CV-2 server ✅ (#359+#360 anchor) / CV-3 spec ✅ (#363 D-lite kind 扩 + #370 文案锁) / CV-4 spec ✅ (#365 iterate) / CHN-1 ✅ (#276+#286+#288 channel + group) / CHN-2 spec ✅ (#357 DM 拆死) / CHN-3 spec ✅ (#371 个人偏好) / RT-1 ✅ (#290+#292+#296 ArtifactUpdated frame) / CM-4 ✅ (presence + welcome onboarding) / DM-2.2 ✅ #372 (mention)
> **章程闸**: **G3.4 协作场骨架 demo E2E + 双 tab 截屏 — Phase 3 退出公告硬约束** (execution-plan.md line 168 字面: "新建 channel → 默认 workspace → 邀 agent → 放 artifact; 双 tab 各 1 张截屏")

> ⚠️ 锚说明: CHN-4 是**集成 demo + e2e**, 不开新数据表 / 不开新 server endpoint / 不开新 client 组件 — **复用** CV-1/CV-2/CV-3/CHN-1/CHN-2/CHN-3 + RT-1 + DM-2 既有路径串成端到端协作场流; 反约束: 不引入新 schema (跟 v=20 sequencing 锁字面一致 — CHN-4.1 不抢号, 留账)

## 0. 关键约束 (3 条立场, 蓝图字面 + 5 spec 边界对齐)

1. **CHN-4 = 集成 e2e + 演示, 反"再造轮子"** (蓝图 §1.1 双支柱字面落地): 协作场骨架 = chat tab (CHN-1 既有 messages 路径) + workspace tab (CV-1.3 ArtifactPanel 既有) 双 tab 在同一 channel 视图并存; agent 邀请走 CHN-1 既有 `POST /channels/:id/members` (CV-2 #347 立场 ① agent default 加入); artifact 创/编走 CV-1.2 既有 `POST /channels/:id/artifacts` 路径; **反约束**: 不开新 endpoint / 新表 / 新 frame, 仅 wiring + e2e + 截屏归档
2. **双 tab 视觉 byte-identical 跟既有 SPA + 文案锁** (野马 R2 双 tab 截屏字面): chat tab 显示 channel.name + member 列表 (含 agent 🤖 角标 #347 立场 ⑥ 二元 byte-identical); workspace tab 显示 artifact 列表 (CV-1.3 #346 既有), agent 创 artifact 走 CV-2 #347 立场 ⑤ "agent default 允许写"; **反约束**: 双 tab 不交叉 (chat 不渲染 artifact body, workspace 不渲染 message; mention `@artifact` 在 chat 流内走 CV-3 #370 ⑥ preview 三模式独立路径)
3. **e2e 走真 server-go(4901) + vite(5174), 跟 G3.1 #348 / G3.3 同模式** (跟 phase-3-readiness #345 audit 模式): e2e 测试链 = 创 channel (private kind) → invite agent (CHN-1 既有 endpoint) → switch chat tab 发 message + agent reply → switch workspace tab 创 markdown artifact (CV-1.2) → agent iterate (CV-4 stub fail-closed 接口前 mock 直接 commit) → anchor comment (CV-2.2 #360 既有) → resolve thread; 双 tab 各 ≥1 张截屏入 `docs/qa/screenshots/g3.4-chn4-{chat,workspace}.png` (Playwright `page.screenshot()`); **反约束**: 不 mock server 路径, 走真 4901 端 — Phase 3 章程严守 demo 真路径

## 1. 拆段实施 (CHN-4.1 / 4.2 / 4.3, ≤ 3 PR)

| 段 | 范围 | 闭锁 | owner |
|---|---|---|---|
| **CHN-4.1** wiring + 双 tab 切换 client SPA | `<ChannelView>` 加 tab switcher (`chat` / `workspace`) — 复用 CV-1.3 #346 ArtifactPanel 路径无新组件; tab state 走 URL `?tab=chat\|workspace` (deep-link 支持 + 跟 CV-4.3 `?diff=` 同模式); 默认进入 `chat`; DM 视图无 workspace tab (跟 CHN-2 #357 立场 ② byte-identical, `if channel.type==='dm' return null`); 反约束: 不新建数据表 (CHN-4.1 **不抢 v=20**, 留账) | 待 PR (战马) | 战马 |
| **CHN-4.2** server 边界小修 (协作场骨架闭包) | 仅 1 处微调 — `GET /api/v1/channels/:id` 返 body 加 `default_tab="chat"` 字段 (新建 channel 默认 chat tab, server 端语义); 反约束: 不动 channels 表 schema (default_tab 是 server 端固定常量返回, 不入库 — 个人偏好覆盖走 CHN-3 user_channel_layout); 反约束: 不开 `PUT /channels/:id/default_tab` (作者级偏好留 v3+, 当前 server 端常量足够) | 待 PR (战马) | 战马 |
| **CHN-4.3** e2e + G3.4 demo 双 tab 截屏 + execution-plan 退出闸 | `packages/e2e/tests/chn-4-collab-skeleton.spec.ts` 写 e2e 链 (创 channel → invite agent → chat tab message + agent reply → workspace tab markdown artifact + iterate stub → anchor + resolve); 双 tab 各 ≥1 张截屏 `docs/qa/screenshots/g3.4-chn4-{chat,workspace}.png` Playwright `page.screenshot()`; 跟 CV-1.3 #348 §3.3 e2e 同模式 (真 4901 server-go + 5174 vite); **G3.4 退出闸**: chat e2e ≤3s 真过 + workspace e2e ≤3s 真过 + 双截屏归档完成 → 战马 / 烈马 + 野马 (双 tab 截屏) 联签 | 待 PR (战马) | 战马 + 烈马 + 野马 |

## 2. 与 CV-1/2/3/4 + CHN-1/2/3 + RT-1 + DM-2 + AL-3 留账冲突点

- **CV-1.3 ArtifactPanel 复用** (核心非冲突): workspace tab 走 #346 既有路径不新建; CHN-4.1 仅在 ChannelView 上加 tab switcher 包裹既有组件
- **CV-2.2 anchor 路径** (e2e 集成): chat tab 不出现 anchor (anchor 仅 workspace tab artifact body 上挂); CV-2 立场 ① owner-only / 立场 ② version pin 跟既有 #360 一致, e2e 不破
- **CV-3 D-lite kind 扩展** (G3.4 demo 价值): workspace tab e2e 含 markdown / code / image_link 三 kind 各 1 个 artifact (跟 #363 三 renderer + #370 文案锁 byte-identical demo 撑章程退出公告 截屏价值)
- **CV-4 iterate 接口前 stub** (非阻塞): CHN-4.3 e2e 中 agent iterate 路径走 mock direct commit (CV-4.2 IterationStateChangedFrame 未落则 stub fail-closed reason='runtime_not_registered' 跟 #365 spec §2 一致); CHN-4 e2e 不强 require CV-4 落地 — 走 owner 直接 commit 路径就够 demo 价值
- **CHN-1 channel API 复用** (核心): 创 channel + invite agent 走 #286 既有 endpoint, 不动
- **CHN-2 DM 拆死** (反约束): DM 视图无 workspace tab 跟 CHN-2 #357 立场 ② byte-identical (e2e 反向断言 `data-tab="workspace"` 0 hit on DM view)
- **CHN-3 个人偏好** (非冲突): 双 tab 切换是 channel-level 不进个人 layout 表; CHN-3 user_channel_layout 不挂 default_tab 字段 (留 v3+ 作者级偏好)
- **RT-1 ArtifactUpdated** (e2e 集成): workspace tab WS push artifact 更新走 #290 既有路径不动
- **DM-2.2 mention** (集成): chat tab 内 `@<agent_id>` mention 走 #372 既有路径; system DM fallback 文案锁 byte-identical (#314 + #372 三源齐)
- **AL-3 presence** (非冲突): chat tab member 列表显示在线徽标走 #310 SessionsTracker; agent 离线显示徽标按 §1.5 + AL-1a 状态字面一致
- **v=14-19 sequencing 锁延续 + CHN-4 不抢号**: CV-2.1 v=14 ✅ / DM-2.1 v=15 ✅ / AL-4.1 待 v=16 / CV-3.1 待 v=17 / CV-4.1 待 v=18 / CHN-3.1 待 v=19; **CHN-4.1 实际 0 schema 改动, v=20 留账给后续 milestone (本 spec 字面写明不抢号)**

## 3. 反查 grep 锚 (G3.4 退出闸验收)

```
git grep -nE 'data-tab="(chat|workspace)"'                packages/client/src/components/ChannelView.tsx   # ≥ 2 hit (双 tab DOM 锚)
git grep -nE 'default_tab.*=.*"chat"|defaultTab.*=.*"chat"' packages/server-go/internal/api/                 # ≥ 1 hit (CHN-4.2 server 默认值)
git grep -nE 'g3\.4-chn4-(chat|workspace)\.png|page\.screenshot.*g3\.4-chn4' packages/e2e/tests/chn-4*.spec.ts # ≥ 2 hit (双 tab 截屏归档)
git grep -nE 'chn-4-collab-skeleton\.spec\.ts'             packages/e2e/tests/                              # ≥ 1 hit (e2e 文件存在)
# 反约束 (5 条 0 hit)
git grep -nE 'CREATE TABLE.*chn_4|ALTER TABLE channels.*ADD.*tab' packages/server-go/internal/migrations/   # 0 hit (CHN-4 不抢 v=20)
git grep -nE 'data-tab="workspace".*type.*"dm"|dm.*workspace.*tab' packages/client/src/components/         # 0 hit (CHN-2 立场 ② DM 无 workspace)
git grep -nE 'PUT /api/v1/channels/.*/default_tab|POST.*channel.*tab.*config' packages/server-go/internal/api/   # 0 hit (作者级偏好留 v3+)
git grep -nE 'mock.*4901|jest\.mock.*server-go|fakeServer.*4901' packages/e2e/tests/chn-4*.spec.ts          # 0 hit (反 mock server, 走真 4901)
git grep -nE 'NewChannelTabFrame|ChannelTabChanged' packages/server-go/internal/ws/                        # 0 hit (反约束: 不新起 frame, tab 切换是 client 端 URL state)
```

任一 0 hit (除反约束行) → CI fail.

## 4. 不在本轮范围 (反约束)

- ❌ 新数据表 / schema 改动 (CHN-4 集成 demo, 不抢 v=20 留账后续)
- ❌ 新 WS frame (tab 切换是 client URL state, 不上 server)
- ❌ 作者级 default_tab 偏好 (server 端常量 "chat" 足够 v1, PUT endpoint 留 v3+)
- ❌ 多 channel 视图 / channel 切换器 (留 CHN-3 后续 UX, 蓝图 §3.1 v1 不做)
- ❌ chat tab 渲染 artifact body 内联 (mention preview 走 CV-3 #370 ⑥ 三模式独立路径, 不交叉)
- ❌ workspace tab 渲染 message (双 tab 不交叉, 立场 ②)
- ❌ DM 视图加 workspace (CHN-2 立场 ② 永久锁)
- ❌ admin SPA 看 channel chat + workspace (admin god-mode 不入业务路径, ADM-0 §1.3 红线; admin 仅看元数据)

## 5. Test plan (实施 PR 各自带, 此 spec 不带)

- CHN-4.1: vitest ChannelView tab switcher 渲染 (URL `?tab=chat\|workspace` deep-link) + DM 视图反向断言无 workspace tab DOM (跟 CHN-2 #357 立场 ② 同源)
- CHN-4.2: server `GET /channels/:id` 返 body 含 `default_tab="chat"` 字面 + 反向断言无 schema 改动 (channels 表 PRAGMA 列不变)
- CHN-4.3: e2e 链跟 CV-1.3 #348 §3.3 同模式 (真 4901 + 5174) — 创 channel / invite agent / chat tab 消息往返 / workspace tab 三 kind artifact / anchor + resolve / 双 tab 截屏 ≤3s 各; **G3.4 退出闸联签**: 战马 (e2e 真过) + 烈马 (acceptance 模板对齐) + 野马 (双 tab 截屏文案锁验)

## 6. 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-29 | 飞马 | v0 — CHN-4 spec lock Phase 3 章程严守收尾 (G3.4 协作场骨架 demo + 双 tab 截屏 退出公告硬约束); 3 立场 (集成 e2e 反再造 / 双 tab 视觉跟既有 SPA byte-identical / 走真 4901+5174 不 mock); 3 拆段 (client tab switcher / server default_tab="chat" 常量 / e2e + 双 tab 截屏); 9 grep 反查 (含 5 反约束) + 8 反约束; 跟 CV-1/2/3/4 + CHN-1/2/3 + RT-1/DM-2/AL-3 留账边界字面对齐; v=14-19 sequencing 锁延续, CHN-4.1 不抢 v=20 留账后续 milestone |
