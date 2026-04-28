# RT-1 Spec — realtime push protocol (artifact 推送 + cursor 单调)

> **范围**: blueprint [`realtime.md`](../../blueprint/realtime.md) §1.3 (人/agent 拆 replay) + §1.4 (多端全推 + cursor 去重) + §2.3 (`/ws` ↔ BPP schema 等同性) + §2.1 BPP `artifact.commit/progress` frame。
> **不在本文件**: artifact 表 / 版本 (CV-1) / channel schema (CHN-1) / WS hub 现状 (#218 + #237 锚) / BPP CI lint (BPP-1)。
> **依赖**: Phase 2 闸 4 ✅ + CHN-1 (channel) merged + CV-1.1 (artifact 表落) merged。
> **总工期**: server 4-5 天 + client 2-3 天; 拆 ≤ 3 PR, 每 PR ≤ 3 天。

## 0. 关键约束 (飞马硬约束, readiness review §5 锁)

| 约束 | 锚点 | 反约束 |
|---|---|---|
| **`ArtifactUpdated` frame envelope = #237 同款** (字段名/顺序 byte-identical, server cursor 单调 + client dedup by cursor) | realtime §2.3 + #237 `agent_invitation_*` 模板 | ❌ 自造 envelope; ❌ 用 client timestamp 排序 |
| **BPP-1 envelope CI lint 必须先落 (战马B 的活)**, 否则 RT-1 frame 不合规, 强行先落 RT-1 → BPP-1 上线整片 RT-* 翻车 | readiness review §5 §3 RT-1 row | ❌ "等 BPP-1 后再补 lint"; ❌ 先发 RT-1 再 retrofit schema |
| **人 / agent 两路 replay 拆死** (人 full replay + 端上虚拟列表; agent BPP `session.resume` 三 hint 由 runtime 自决) | realtime §1.3 ⭐ | ❌ 一套 replay 走天下; ❌ agent 默认 full (烧 token) |

## 1. 拆 PR 顺序

```
RT-1.1 (server cursor + dedup, 2d) ──→ RT-1.2 (client backfill, 2d)
                                  ╲
                                   ╲──→ RT-1.3 (agent session.resume, 2d, 可与 1.2 并行)
```

### RT-1.1 — server cursor 单调发号 + dedup 不变量

- **Blueprint**: §1.4 (cursor 唯一去重) + §2.3 (envelope 等同 #237)
- **Touches**: `internal/ws/cursor.go` (新, 单调发号器) + `internal/ws/event_schemas.go` 加 `artifact_updated` payload + handler 改写 + cursor unit test
- **范围**:
  1. Cursor 单调器 (atomic int64, persist via `events.cursor` 列, restart 续号不回退)
  2. `ArtifactUpdated` frame schema lock — 字段 `{cursor, artifact_id, version, channel_id, updated_at, kind}`, 与 #237 envelope 同序
  3. server 端发送路径: artifact commit (CV-1) → hub.Broadcast(ArtifactUpdated{cursor: next()}) → 全推
  4. dedup 不变量: 同 artifact_id + version 重发 → 同 cursor (idempotent), 不发新 cursor
- **Acceptance (四选一)**: **行为不变量** (4.1) + **cursor 单调单测**
  - 4.1.a 100 并发 commit → cursor 严格单调递增 + 无重复 (单测 race detector)
  - 4.1.b 重复 commit 同 (artifact_id, version) → 同 cursor (idempotent, fail-closed)
  - 4.1.c restart server → cursor 不回退 (persist 验证, fake clock + 重启 fixture)
  - 4.1.d frame schema 反向断言: grep `internal/ws/event_schemas.go` 中 `artifact_updated` 字段顺序 byte-identical 于 #237 模板; 不一致 CI fail (人工 lint 直到 BPP-1)
- **工期**: 2 天
- **Owner**: 战马A 实施 / 飞马 review (envelope 守门) / 烈马 不变量

### RT-1.2 — client backfill on reconnect (cursor diff)

- **Blueprint**: §1.3 人 full replay + §1.4 端上去重
- **Touches**: `packages/client/src/realtime/wsClient.ts` (cursor 缓冲 + 缺洞检测) + `pages/Channel/ArtifactList.tsx` (订阅 ArtifactUpdated) + `api/events.ts` (新 GET `/api/events?since=N`) + e2e
- **范围**:
  1. client 维护 `last_seen_cursor` (per user, localStorage); WS open 时带 `?since=N`
  2. 收 cursor=N+2 但缺 N+1 → 触发 `GET /api/events?since=N` backfill 拉, 按 cursor 排序后渲染
  3. dedup: 已渲染 cursor set, 重复 cursor 丢弃 (多端全推必 dup, §1.4 锁端上去重)
  4. ArtifactList 订阅 ArtifactUpdated → 局部刷新 artifact row (不全 reload)
- **Acceptance (四选一)**: **e2e 断言** (Playwright)
  - (1) 新 commit → 在线 client ≤ 3s 看到 (latency stopwatch 截屏, 复用 G2.4 模板)
  - (2) 离线 30s 期间 5 次 commit → reconnect 后 backfill 拉 5 行齐, 顺序按 cursor
  - (3) 多端 (2 tab) 同时在线 → 各端各看一份不重复 (cursor dedup 验证)
- **工期**: 2 天
- **Owner**: 战马A / 烈马 e2e

### RT-1.3 — agent BPP `session.resume` hint 拆出

- **Blueprint**: §1.3 ⭐ (人/agent 截然分) + §2.2 控制面
- **Touches**: `internal/bpp/session_resume.go` (新, 三 hint 路由) + `internal/bpp/frame_schemas.go` (CHN: 与 RT-1.1 envelope 一致) + 单测
- **范围**:
  1. server 接 BPP `session.resume{replay_mode, since_cursor}` → 按 hint 路由:
     - `full`: 推 since_cursor 之后所有 events (小 channel)
     - `summary`: 推一条 `{missed_count: N}` 让 runtime 自拉
     - `latest_n`: 推最近 N 条
  2. **不**走 client backfill 路径 (RT-1.2 是人路, 这是 agent 路, §1.3 锁拆)
  3. runtime 端 hint 选择由 runtime 自决 (Borgee 不强 default; 反约束: 不准 hardcode `full`)
- **Acceptance (四选一)**: **行为不变量**
  - 4.1.a 三 hint 路径单测 (table-driven, 每 hint 一行)
  - 4.1.b 反向断言: grep `replay_mode.*full.*default|hardcode` count==0 (runtime 自决, 不准 server 默认 full)
  - 4.1.c BPP frame envelope 与 RT-1.1 ws event schema byte-identical (CI grep 直到 BPP-1 lint 落)
- **工期**: 2 天
- **Owner**: 战马A / 飞马 review / 烈马 单测

## 2. 与 Phase 2 留账冲突点

| 冲突点 | Phase 2 现状 | RT-1 立场 |
|---|---|---|
| **G2.6 BPP envelope CI lint** 留账 (Phase 4 BPP-1) | #237 client/server schema 注释锁, 无 CI grep | RT-1.1 / RT-1.3 envelope 守门**人工 lint** (飞马 review 闸位) 直到 BPP-1 落; 不接受"等以后" |
| **G2.5 presence/contract.go** 留账 (AL-3) | RT-0 server stub | RT-1 不碰 presence; ArtifactUpdated 不带 presence 字段 (拆干净) |
| **#237 invitation envelope** 已落 | `ws/event_schemas.go` `agent_invitation_*` | RT-1.1 `artifact_updated` 套同模板, 字段顺序对齐 (反向 grep 验) |

## 3. 反查锚 (lint-able, 每 PR 必带)

```bash
# RT-1.1: ws frame envelope 必须用 cursor 字段 (反向: 不准用 timestamp 排序)
grep -rnE "artifact_updated.*timestamp|sort.*ArtifactUpdated.*time" packages/server-go/internal/ws/ | grep -v _test.go
# RT-1.2: client 不准本地 timestamp 排序 events
grep -rnE "events\.sort\(.*createdAt|sort.*events.*timestamp" packages/client/src/realtime/ | grep -v _test.
# RT-1.3: agent session.resume 不准 server 端 hardcode full default
grep -rnE "replay_mode.*=.*\"full\"|defaultReplayMode" packages/server-go/internal/bpp/ | grep -v _test.go
```

预期全部 0 命中。

## 4. 不在 RT-1 范围

- ❌ BPP-1 envelope CI lint (战马B 的 BPP-1 活, RT-1 反过来吃它)
- ❌ §1.4 (B) 智能推 active client (v1 末优化)
- ❌ §1.4 (C) per-device 推送配置 (v2 power user)
- ❌ artifact 表 / 版本 (CV-1) / 锚点对话 (CV-2)
- ❌ presence 表 / contract.go (AL-3)

## 5. 验收挂钩

- 三 PR 全 merge + §3 grep 0 命中 + #237 envelope byte-identical 反向断言绿
- registry: REG-RT1-001..009 (PR merge 后 24h 内翻 ⚪ → 🟢)
- Phase 3 G3.1 闸位 (artifact 创建 + 推送 E2E) 接 RT-1.2 e2e 三用例

## 6. 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-28 | 飞马 | v0 — RT-1 拆 3 PR + envelope 守门 + Phase 2 留账冲突点 + grep 反查锚 |
