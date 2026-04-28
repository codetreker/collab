# Phase 2 闸进度看板 v2 — 实时翻牌

> 飞马 · 2026-04-28 · 整合 #221 (gate matrix) + #227 (decision) + #231 (G2.audit 草稿) + #236 (G2.3 ✅) + #237 (RT-0 server)
> 用法: 每条 G2.X PR merge / 闸闭合后**当天**翻牌; 全 ✅ 时建军 + 野马联签宣布 Phase 2 退出

## 1. 6+1 闸看板

| 闸 | 状态 | 闭合 PR | owner | 备注 |
|---|---|---|---|---|
| G2.0 ADM-0 cookie 串扰反向 | ✅ | #197 + #201 + #223 | 飞马 / 战马A | 4.1.a/b/c/d 全闭 (v=10 backfill 后 `users WHERE role='admin'` count=0) |
| G2.1 邀请审批 E2E | 🟡 partial | #195 + #198 + #237 | 战马A / 烈马 | server push 落 (#237); e2e cm-4-realtime.spec.ts 解 `.skip` 后真闭 |
| G2.2 离线 fallback E2E | 🟡 partial | #237 | 战马A | RT-0 server 落; presence stub + e2e 跑后真闭 |
| G2.3 节流不变量单测 (B.1) | ✅ | #236 | 烈马 | T1-T5 全过, 5min const + 二维 key + clock 注入 + 边界 `>=` 测好 |
| G2.4 用户感知签字 ⭐ | 🟡 2/5 | #213 + #230 + #232 + #233 | 野马 | partial 2/5 ✅ (#1 #5); #2 等 AL-1b, #3/#4 等 e2e |
| G2.5 presence 接口契约 | 🟡 partial | #237 | 飞马 / 战马A | RT-0 server 已落 push 通路; `internal/presence/contract.go` 路径下 PR 锁 |
| G2.6 /ws ↔ BPP schema lint | 🟡 partial | #237 | 飞马 | typed `event_schemas.go` 已字面对齐 #218 client; CI lint `bpp/frame_schemas.go` ↔ `ws/event_schemas.go` 待 Phase 4 准备 PR |
| G2.audit | 🟡 草稿 | #212 + #231 | 烈马 | RT-0 落地后填具体 audit row (presence/节流/CHECK enforcement) |

## 2. 通过判据 (锁 #221)

Phase 2 全过 ⇔ G2.0/2.1/2.2/2.3/2.5/2.6 ✅ + G2.4 ≥ 4/5 ✅ (野马签条件性接受) + G2.audit 6 项齐 → 建军 + 野马联签宣布

## 3. 剩余动作 (3 天路线, 锁 #227)

1. e2e `cm-4-realtime.spec.ts` 解 `.skip` (战马B 1-line) → G2.1 / G2.2 真闭
2. `internal/presence/contract.go` 路径锁 PR (飞马 + 战马) → G2.5 真闭
3. G2.audit 补 presence / 节流 / CHECK enforcement 三行 (烈马, RT-0 落后)
4. 野马 G2.4 demo 跑剩余 #3 / #4 截屏 (AL-1b 后置) → G2.4 升 4/5
5. G2.6 CI lint PR (飞马, Phase 4 准备同 PR 一起落)

## 4. 翻牌红线

❌ 任一闸 partial 不能跳 ✅ 不补证据 · ❌ G2.6 CI lint 必须真挂, 不接受口头"等 Phase 4" · ❌ G2.audit 留账行不可"等以后", 规则 6 锁
