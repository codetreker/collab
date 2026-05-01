# G4.audit — 野马 (PM) 交叉核验 (zhanma-c + 第三方抓的 3 项)

> 2026-05-01 · 野马 (yema PM) · 交叉核验 zhanma-c dev / 第三方抓的 3 项 (我之前没抓到). 判 (a) 真漏应做 / (b) PM 立场可接受 / (c) v2+ 留账. ≤80 行.

---

## 项 1. DL-2 cold stream / DL-3 offloader / RT-3 AgentTaskNotifier 三处 production 未 wire

**现状**: zhanma-c 抓到三处生产代码 milestone 已合但 wire-up 死代码 (实施在但 server.go boot 未注册 / interface 未注入).

**蓝图立场对照**:
- DL-2 cold stream → 蓝图 `data-layer.md` §3 retention + `concept-model.md §0 用户主权` (用户数据保留/归档透明)
- DL-3 offloader → 蓝图 `data-layer.md` §4 events_archive 阈值
- RT-3 AgentTaskNotifier → 蓝图 `realtime.md §3.4 隐私契约 多端推`+ `§1.4 多端 fanout`

**真兑现率影响**:
- DL-2 cold stream 未 wire → events 双流"hot live"已活, "cold archive"实施完但**用户数据真未归档**, 蓝图 §3 retention 立场承袭率 **50% (实施 ✅ + wire ❌)**
- DL-3 offloader 未 wire → 阈值哨告警代码在但**永不触发**, 蓝图 §4 立场承袭率 **50%**
- RT-3 AgentTaskNotifier 未 wire → 多端 fanout server 派生 hook (DL-4 #485 + RT-3 #588) 已建但**任务事件真不推**, 蓝图 §1.4 + §3.4 多端推 + 隐私契约真兑现率 **50%**

**判定**: **(a) 真漏 P0 — 应立即做**. 三处实施已落 + 测试已绿但 production wire-up 缺 = 用户视角"没真做". 跟 user memory `progress_must_be_accurate` 铁律命中 (做完 ≠ wire-up, wire-up 才算真做完). 建议: REFACTOR-3 类 milestone 1 PR 收三处 wire (跟 BPP-3 #489 wire-up 同模式 server.go boot 注入).

---

## 项 2. Capability 命名 dot-notation 蓝图字面 vs 代码 snake_case 14 const

**现状**:
- 蓝图 `auth-permissions.md` §3 明示 `<domain>.<verb>` 风格 (例: `message.send` / `artifact.create` / `channel.invite_agent`)
- 代码 `internal/auth/capabilities.go` 14 const 全 snake_case (例: `read_channel` / `commit_artifact` / `manage_members`)
- 不仅命名风格漂, **clauses 都不一一对应** — 蓝图 ~16 cap (按 domain 分组 messaging/workspace/channel/org), 代码 14 cap (按 scope 分组 channel/artifact/messaging/channel admin)

**真漂程度**: 这不只是命名风格漂, 是**整套 capability 字面表都重新定义了** (字面值 + 数量 + 分组 + 域名都不同).

**判定**: **(a) 真漏应做** — 蓝图字面是 v1 起步 cap 真值锚 (蓝图 §3 一句话 "v1 起步所需的 capability, 命名遵循 `<domain>.<verb>` 风格"), 代码偏离这是 spec drift 真血账. PM 立场不能接受 byte-identical 不破托底, 因为:
1. 蓝图字面 = 用户主权红线 (capability 影响真权限决策)
2. AP-4-enum #591 14-cap reflect-lint **守的是代码 const 而非蓝图** — 守错了源头
3. 字典分立锁链第 4 处守 14 个数, 但**字面值跟蓝图全不同**, 锁链是假的

**修法**: 真做 NAMING-2 类 milestone (跟 NAMING-1 #614 milestone-prefix 全清同精神) 把 14 const 改 dot-notation byte-identical 跟蓝图 §3 + 补全 ~16 cap. **优先级 🔴 P0** (蓝图字面是用户主权红线锚源头).

---

## 项 3. install-butler sudo installer (.pkg/MSI/deb-rpm) 蓝图 v1 scope?

**现状**:
- HB-1 #589 server endpoint ✅ + HB-2 v0(C) #606 daemon Go 框架 ✅ 都有
- 真 native installer binary (.pkg / MSI / deb-rpm sudo installer) 完全没做

**蓝图立场对照** (`host-bridge.md`):
- §1.1 install-butler "需 sudo（首次）下载/安装/卸载 runtime 二进制"
- §1.2 "**一键完全卸载**（信任底线）" — "二进制文件 / 配置 / 状态 / runtime / Borgee server 端注册 / OS user/group / launchd / systemd unit"
- §1.4 "Linux: systemd unit + cgroups / macOS: launchd unit + sandbox-exec / Windows: v2 才支持"
- 蓝图明示 **Linux + macOS 是 v1 / Windows v2**

**判定**: **(a) Linux + macOS installer 真漏 P0 应做 + Windows installer (c) v2 留账蓝图明示**.

蓝图明示真 v1 scope (Linux systemd + macOS launchd 必做), Windows 蓝图明示 v2. 但当前 0 installer = 真没真接 sudo 路径 = HB-1 endpoint + HB-2 daemon **都不能装** (没 installer 用户怎么装 daemon?). PM 必修 #10 #599 HB stack Go 路径锚 "borgee.cloud 一键安装" 真兑现路径必须有 installer 才闭环.

跟项 1 三处 wire-up 同精神 — 实施 + spec ✅ 但**用户真装不上**. 这是 HB stack 4 步路径 (#599 → #605 → #606 → HB-3 → HB-2 v0(D)) 之外的第 5 步: HB-installer (Linux .deb + macOS .pkg).

---

## 总结 + G4.audit 真闭路径补充

我之前 PM 三联签字 (commit 233119b9) + 独立 audit (commit 7161a25a) **遗漏 3 项**, zhanma-c + 第三方真抓到. 跟 P0 真漏补充:

| 项 | 判定 | 优先级 | 真闭路径 |
|---|---|---|---|
| DL-2/DL-3/RT-3 wire-up 死代码 | (a) 真漏 | 🔴 P0 | REFACTOR-3 类 1 PR 收三处 server.go boot 注入 |
| Capability dot-notation 字面 drift | (a) 真漏 | 🔴 P0 | NAMING-2 类 milestone 14 const → dot-notation + 补全跟蓝图 §3 byte-identical |
| install-butler installer (Linux+macOS) | (a) 真漏 | 🔴 P0 | HB-installer 类 milestone (蓝图 §1.4 v1 scope 明示) |
| Windows installer | (c) 留账 | v2 | 蓝图 §1.4 明示 |

**修订 G4.audit 真闭路径**:
- 原 P0 (5 截屏 / PROGRESS stale / 蓝图 §0.1 e2e) + 项 1+2+3 = **6 项 P0 真漏**
- Phase 4 真完率: ⚠️ **更不真完** — 真兑现 wire-up + 蓝图字面承袭 + installer 真装路径全有 gap

PM 视角: 我感谢 zhanma-c + 第三方真抓到. 我 PM stance review 局限在 spec / content-lock / 立场字面层, 没下沉到 wire-up / 命名 spec drift / installer 落地层 — 这是我 PM audit 视野盲区, 真 lesson 学习. 跟 user memory `teamlead_executes_dont_ask` 真承担: 不推卸, 真补.

— 野马 (Yema PM) 2026-05-01
