# Acceptance Template — CHN-2: DM 概念独立 (UI/UX 视觉拆 channel + DM 没 workspace + DM 永远 2 人)

> 蓝图: `channel-model.md` §1.2 (DM 概念独立, 底层可复用) + §1.1 (channel = 协作场, 跟 DM 拆) + §3.2 (现状差距 — UI 混淆 + DM workspace 入口需禁用) + §2 不变量 "DM 永远 2 人 / Workspace per channel, DM 无 workspace"
> Implementation: `docs/implementation/modules/chn-2-spec.md` (飞马 spec **TBD**)
> 拆 PR (拟, 等飞马 spec 确定): **CHN-2.1** server-side DM 路径反约束 (workspace API 拒 DM type / 加人 API 拒 DM type) + **CHN-2.2** client SPA 视觉拆 (DM 不渲染 workspace tab + 侧栏分区 + DM 列表 UI) + **CHN-2.3** 反向 grep / e2e 兜底
> Owner: 战马 实施 (待 spawn, 跟 DM-2 战马B 路径不冲突) / 烈马 验收
> Status: ⚪ skeleton (跟 #318 AL-4 + #293 DM-2 acceptance skeleton 同模式, 三件套并行 — spec 飞马 / 文案锁 野马 / acceptance 烈马 / 战马等三件套到位实施)

---

## §0 关键约束 (蓝图立场, 实施 PR 不可绕)

> 锚: `channel-model.md` §1.2 + §2 不变量

| # | 立场 | 反约束 | 蓝图源 |
|---|---|---|---|
| ① | DM 复用 channel 表底层 (`type='dm'`) — 数据层不裂 | ❌ 不新建 `direct_messages` 表; 不引入新 PK 命名空间 | §1.2 "底层可复用" |
| ② | DM 永远 2 人 — 不可加人 | ❌ POST /channels/:id/members 对 `type='dm'` 路径 → 403 (反向断言); ❌ DM 不可升级到 channel (升级走"创建新 channel 把双方拉进去") | §2 不变量行 + §1.2 ❌ 加人 |
| ③ | DM 没 workspace — 不可访问 artifact 路径 | ❌ GET /channels/:id/artifacts 对 `type='dm'` → 403; ❌ POST /channels/:id/artifacts 对 `type='dm'` → 403; ❌ DM 侧栏不渲染 Canvas tab (DOM 反查 count==0) | §1.2 ❌ workspace + §2 不变量 "Workspace per channel; DM 没 workspace" + §3.2 "DM workspace 入口需禁用" |
| ④ | DM 没 topic — UI 不渲染 topic 字段 | ❌ DM channel 详情面板不显示 topic input; ❌ system message 不渲染 "topic 已更新" | §1.2 ❌ topic |
| ⑤ | UI 视觉与交互跟 channel **明确不同** — 防混淆 | ❌ DM 列表 UI 不复用 channel 列表组件原样渲染 (data-kind="dm" 字面锁); ❌ DM header 不显示 "#" 频道前缀 | §1.2 + §3.2 "UI 上 DM 与 channel 视觉差异不够大" |
| ⑥ | DM channel-scoped 路由仍走 channel id (反约束 raw UUID) — 不暴露 owner_id 走 sender_id | ❌ DM message DOM 不漏 raw `<uuid>` 文本 (跟 DM-2 §3.1 同模式); ❌ system DM 文案不抄送 owner (跟 concept-model §4 一致) | `concept-model.md` §4 + DM-2 acceptance §3.1 |

---

## 验收清单

### §1 server schema + 反约束 (CHN-2.1) — DM type 路径分流 + 工资 path 反约束

> 锚: 飞马 spec §1 (TBD) + CHN-1 #276 schema 模板 + 立场 ①②③

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 1.1 [TBD] DM type='dm' INSERT 必带 exactly 2 members (CHECK 或 trigger) — 立场 ② | migration test | 战马 / 烈马 | _(待 CHN-2.1 PR + 飞马 spec)_ |
| 1.2 [TBD] DM 路径 POST /channels/:id/members → 403 (server enforce, 立场 ②) | unit + e2e 反向 | 战马 / 烈马 | _(待 CHN-2.1 PR)_ |
| 1.3 [TBD] DM 路径 GET/POST /channels/:id/artifacts → 403 (server enforce, 立场 ③) — `cv-1.md` §2.1 cross-channel 模式延伸到 cross-type | unit + e2e | 战马 / 烈马 | _(待 CHN-2.1 PR)_ — 复用 CV-1.2 #342 `TestArtifactCrossChannel403` 反向模式 |
| 1.4 [TBD] DM topic 字段 nullable 且 server 默认 NULL (立场 ④) — `UPDATE channels SET topic=...` WHERE type='dm' → 400 | unit | 战马 / 烈马 | _(待 CHN-2.1 PR)_ |
| 1.5 [TBD] migration 兼容 (CHN-2 不引入 schema break, 复用 channel 表) — 跟 CHN-1 #276 v=11 forward-only 一致, 不新增 v=N | migration drift test | 战马 / 烈马 | _(待 CHN-2.1 PR)_ |
| 1.6 反向 grep — 不应有 `direct_messages` 表 / `dm_messages` 路径 (立场 ① 底层复用) | CI grep | 飞马 / 烈马 | `grep -rnE 'direct_messages\|dm_messages\|CREATE TABLE direct' packages/server-go/internal/migrations/ packages/server-go/internal/store/` count==0 |

### §2 行为不变量 (CHN-2.1) — 立场 ②③④ 反向断言

> 锚: 立场 ②③④ + `channel-model.md` §2 不变量

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 2.1 [TBD] DM 创建 — 必传 `target_user_id`, server 反查 (sender, target) 已存在 DM 则返回原 channel id (idempotent, 不创新行) | unit (table-driven) | 战马 / 烈马 | _(待 CHN-2.1 PR)_ |
| 2.2 [TBD] DM 反向 — 升级到 channel 路径不存在 (无 `POST /channels/:id/upgrade-to-channel` endpoint) | grep + 反向 | 飞马 / 烈马 | `grep -rnE 'upgrade.*channel\|dm.*to.*channel' packages/server-go/internal/api/` count==0 |
| 2.3 [TBD] DM workspace 入口 server 禁用 (立场 ③ 反约束) — `cv-1.md` §0 立场 ① channel-scoped artifact 在 type='dm' channel 时 server 拒 | unit + e2e | 战马 / 烈马 | _(待 CHN-2.1 PR)_; `grep -nE 'channel\.type.*==.*"dm"\|IsDirectMessage' packages/server-go/internal/api/artifacts.go` count≥1 |
| 2.4 [TBD] DM mention 路由 — 跟 DM-2 §2.x 一致, mention 走 sender_id 不展开 owner (DM 内 @user 仅 ping 目标人) | e2e | 战马 / 烈马 | _(待 CHN-2.1 PR + DM-2.2 联动)_ |
| 2.5 反向 grep — DM message 不应触发 channel-only 系统消息 (`#{channel} 已归档` / agent silent join 等) | CI grep | 飞马 / 烈马 | `grep -nE '"#%s.*已归档"\|silent.*join.*dm' packages/server-go/internal/api/channels.go` count==0 在 DM type 分支 |

### §3 用户感知 (CHN-2.2 client SPA) — 视觉拆 + 反 UUID 漏

> 锚: 立场 ⑤⑥ + DM-2 §3.x 跨 PR 联动 + `channel-model.md` §3.2

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 3.1 [TBD] DM 列表 UI 跟 channel 列表 **视觉显著不同** (字面锁: DM 列表 DOM `data-kind="dm"`, channel 列表 `data-kind="channel"`); DM 列表项不显示 "#" 频道前缀, 仅显示对方 display name | e2e + DOM grep | 战马 / 烈马 | _(待 CHN-2.2 PR)_; `grep -n 'data-kind="dm"' packages/client/src/components/Sidebar.tsx` count≥1 + e2e DOM 反查 channel-prefix `#` 不出现在 DM 列表 |
| 3.2 [TBD] DM 视图 **不渲染 Canvas tab** (立场 ③ DOM 反约束) — DM 进入后 tab bar `.channel-view-tab` count==1 (仅 chat), channel 进入后 count==2 (chat + Canvas) | e2e + DOM | 战马 / 烈马 | _(待 CHN-2.2 PR)_ — 跟 CV-1.3 #346 ArtifactPanel 文件头 7 立场 ① channel-scoped 一致, DM 不入此路径 |
| 3.3 [TBD] DM 详情面板 **不渲染 topic input** (立场 ④); **不渲染 "添加成员" 按钮** (立场 ②) | e2e + DOM | 战马 / 烈马 | _(待 CHN-2.2 PR)_; `grep -n 'data-channel-type="dm"' packages/client/src/components/ChannelDetailsPanel.tsx` 路径分流条件渲染 |
| 3.4 [TBD] DM header **不显示 #** 频道前缀 (立场 ⑤); 显示对方头像 + display name + presence dot (跟 AL-3 #324 PresenceDot 复用, `data-role="user"` 反查仅有非 agent 的 DM 出现) | e2e | 战马 / 烈马 | _(待 CHN-2.2 PR)_ |
| 3.5 [TBD] DM message 文案 **不漏 raw UUID** (反约束 ⑥, 跟 DM-2 §3.1 同模式) — DOM grep 不含 `<uuid>` 文本 (`data-mention-id` attr 可有, 文本节点不可有) | e2e + DOM grep | 战马 / 烈马 | _(待 CHN-2.2 PR)_ |

### §4 反向 grep / e2e 兜底 (CHN-2.3) — 蓝图行为对照, 每 PR 必带

> 锚: 立场 ①②③④⑤⑥ 反约束横切

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 4.a 反向 grep — 不应新建 `direct_messages` / `dm_messages` 表 (立场 ① 底层复用) | CI grep | 飞马 / 烈马 | `grep -rnE 'direct_messages\|dm_messages\|CREATE TABLE.*dm_' packages/server-go/internal/migrations/ packages/server-go/internal/store/` count==0 |
| 4.b 反向 grep — DM 路径不应出现 channel-only 字符串 ("workspace" / "topic" / "添加成员" / "归档") 在 DM 视图条件渲染分支外 (立场 ③④⑤) | CI grep | 飞马 / 烈马 | `grep -nE 'workspace.*type.*"dm"\|topic.*type.*"dm"\|"添加成员".*type.*"dm"' packages/client/src/components/` 命中行需带 `// CHN-2: DM 反约束` 注释或 `unsupported` 闸 |
| 4.c 反向 grep — DM 不应触发 system message "#{channel} 已归档" (立场 ⑤ DM 视觉拆) | CI grep | 飞马 / 烈马 | _(待 CHN-2.3 PR)_; 跟 CHN-1 #288 client `system DM 'channel #{name} 已被'` 模式镜像反向 |
| 4.d e2e — 双窗口 DM 创建 + 加人 attempt → 403 双断 (立场 ② 兜底) | e2e | 战马 / 烈马 | _(待 CHN-2.3 PR)_ — 跟 `cv-1-3-canvas.spec.ts` 同模式 (REST + DOM 双断) |
| 4.e e2e — DM 视图反查 Canvas tab count==0 + topic input count==0 + 添加成员 button count==0 (立场 ②③④ 三反约束兜底) | e2e | 战马 / 烈马 | _(待 CHN-2.3 PR)_ |

---

## 退出条件

- §0 关键约束 6 立场入册 (跟 cv-1.md §0 立场反查 + dm-2.md 数据契约 同模式)
- §1 server 6 项 (5 TBD + 1 反向 grep) 全绿
- §2 行为不变量 5 项 (4 TBD + 1 反向 grep) 全绿
- §3 用户感知 5 项 (5 TBD client SPA) 全绿
- §4 反向 grep / e2e 兜底 5 项 (3 grep + 2 e2e) 全绿
- 登记 `docs/qa/regression-registry.md` REG-CHN2-001..N (server + 行为 + client + 反向 兜底)
- 蓝图引用区 `channel-model.md` §1.2 / §2 / §3.2 翻 ✅ #CHN-2 closure

## 跟其他 milestone 的边界

| Milestone | 关系 | 备注 |
|---|---|---|
| **CHN-1** ✅ closed | 同表 (`channels.type`), CHN-2 在 CHN-1 schema 上加 `type='dm'` 路径分流 | CHN-1 #276 v=11 已落 type 列, CHN-2 仅强 type='dm' 反约束 |
| **CV-1** ✅ closed | CV-1.2 cross-channel 403 反约束模式 → CHN-2 cross-type (DM ≠ channel) 复用 | `cv-1.md` §2.1 立场 ① channel-scoped → CHN-2 §1.3 server 拒 DM 走 artifact 路径 |
| **DM-2** in-flight | DM-2 是 mention 路由 (`@user/@agent/@channel`), CHN-2 是 DM 容器分流 | 两者解耦 — CHN-2 锁 DM ≠ channel 视觉/路径; DM-2 锁 mention 路由按 sender_id (concept-model §4) |
| **CV-2** TBD (Phase 3 章程未启) | 锚点对话依赖 CV-1 闭, CHN-2 不挡 CV-2 | CV-2 spec 飞马 TBD |

## 5. 更新日志

| 日期 | 作者 | 变化 |
|------|------|------|
| 2026-04-29 | 烈马 | v0 skeleton — §0 6 立场 + §1-§4 验收清单 (TBD 占位等飞马 spec) + 边界表 (CHN-1/CV-1/DM-2/CV-2 关系); 跟 #318 AL-4 + #293 DM-2 acceptance skeleton 同模式 4 件套并行 (spec 飞马 / 文案锁 野马 / acceptance 烈马 / 战马等三件套到位) |
