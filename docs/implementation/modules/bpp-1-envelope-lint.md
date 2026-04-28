# BPP-1 envelope CI lint — spec stub (Phase 4 占号)

> **状态**: 占号 stub (Phase 2 G2.6 留账行 PR 编号锁用), 实施留 Phase 4 BPP-1。
> **蓝图锚**: [`plugin-protocol.md`](../../blueprint/plugin-protocol.md) §2 (BPP 接口清单 v1 最小集) + §2.1 控制面 + §2.2 数据面; [`realtime.md`](../../blueprint/realtime.md) §2.3 (`/ws` ↔ BPP envelope schema 等同性, 飞马 R3 锁)。
> **关联**: PR #237 envelope 模板 (`agent_invitation_*` byte-identical) + PR #267 readiness review §5 (RT-1 ArtifactUpdated 套 #237 直到 BPP-1 CI lint 落) + PR #269 RT-1 spec §0 守门。

## 1. envelope schema 字段 (Phase 4 实施时锁)

```
{
  cursor:     int64    // server 单调发号 (RT-1.1)
  frame_kind: string   // agent_invitation_pending | _decided | artifact_updated | session.resume | ...
  payload:    object   // 与 ws/event_schemas.go 对应 frame byte-identical (字段名/顺序/类型)
}
```

字段名 / 顺序 / 类型与 `internal/ws/event_schemas.go` 同 frame_kind 行**byte-identical 或 type alias**, 任一分歧 CI fail。

## 2. CI lint workflow placeholder

- 文件: `.github/workflows/bpp-envelope-lint.yml` (Phase 4 实施时落)
- 触发: PR 改 `internal/bpp/frame_schemas.go` ∪ `internal/ws/event_schemas.go`
- 步骤: AST 对比同 frame_kind 字段名 / 顺序 / 类型 → 不一致 fail
- fail-closed: 缺 frame_kind 对应行也 fail (反向断言, 防 BPP frame 单方落地)

## 3. 范围 / 反约束

- ✅ 占号: G2.6 留账行 PR # 锁 (规则 6, Phase 2 announcement #268)
- ❌ 不在本 PR: BPP-1 协议骨架 / frame 实现 / 直连 flag / grep no-runtime / thinking subject (留 BPP-1 实施)
- 反约束: 此 stub merge 后 G2.6 行写本 PR #, **不**视作 lint 已落; lint 实际启用以 BPP-1 实施 PR 为准。

## Test plan

- BPP-1 CI lint workflow — **内容真做留 Phase 4 实施** (战马B BPP-1 PR 期间落 `.github/workflows/bpp-envelope-lint.yml`)
- 当前 PR 仅 spec stub + 占号; merge 后留账行锁本 PR # 即可

## 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-28 | 飞马 | v0 — 占号 stub, Phase 4 BPP-1 实施时升级 |
