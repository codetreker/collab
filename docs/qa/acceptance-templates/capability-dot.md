# Acceptance Template — CAPABILITY-DOT (capability dot UI 立场层 + AP-2 v1 follow-up)

> Spec brief `capability-dot-spec.md` (飞马 v0). Owner: 战马D 实施 / 飞马 review / 烈马 验收.
>
> **CAPABILITY-DOT 范围**: AP-2 v1 #620 capability 透明 UI 落地后接 capability dot 视觉层 — `<CapabilityDot capability={token}>` 小圆点 UI (data-attr `data-capability-dot` + size 6×6 + 蓝/灰 byte-identical) 给 channel header / message reply input 显 user-has-capability 状态. 立场承袭 AP-2 v1 #620 14-capability const SSOT + AP-1 #493 ABAC + 反 RBAC 双语 + ADM-0 §1.3 admin god-mode 红线. **0 server prod + 0 schema 改**.

## 验收清单

### §1 行为不变量 (CapabilityDot 单源 + 复用 AP-2 v1)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 1.1 `components/CapabilityDot.tsx` 单源 (反向 grep `^export.*CapabilityDot` 在 client/src/components/ ==1 hit) — props `{capability: CapabilityToken, className?: string}` byte-identical 跟 AP-2 v1 14-capability const SSOT | unit + grep | `CapabilityDot.test.tsx::_PropsByteIdentical` PASS |
| 1.2 渲染状态 — `has` (蓝色) / `not_has` (灰色) / `unknown_token` forward-compat (灰色 data-capability-known='false') | vitest | 3 case PASS |
| 1.3 反 RBAC 双语 0 hit (英 4 词 admin/editor/viewer/owner + 中 3 词 管理员/编辑者/查看者) — 立场承袭 AP-2 v1 #620 反 role bleed | grep | reverse grep test PASS |

### §2 数据契约 (0 server prod + 反 hardcode bundle 漂)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 2.1 0 server prod diff — `git diff main -- packages/server-go/` 0 行 (Wrapper 第 16 处, 跟 CS-1..4 / DM-9..12 / CHN-11..15 同模式) | git diff | 0 行 ✅ |
| 2.2 复用 AP-2 v1 #620 14-capability const SSOT (反平行实施) — 反向 grep `^export.*CAPABILITY_TOKENS\|^export.*LABEL_MAP` 在 client/src/lib/ 仅 capabilities.ts 单源 | grep | reverse grep test PASS |

### §3 E2E (Playwright + DOM 锚 byte-identical)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 3.1 `capability-dot.spec.ts` 4 case PASS (has 蓝 + not_has 灰 + unknown_token forward-compat + admin god-mode 不挂) | E2E | `packages/e2e/tests/capability-dot.spec.ts` PASS |
| 3.2 ⭐ screenshot 真生成 `docs/qa/screenshots/capability-dot-states.png` ≥3000 bytes (4 状态横排 demo) | E2E + screenshot | 文件存在 + size verify |

### §4 closure (REG + cov gate + 跨 milestone 锁)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 4.1 既有全包 unit + e2e + vitest 全绿不破 + post-#621 haystack gate 三轨过 | full test + CI | go-test-cov SUCCESS |
| 4.2 反 admin god-mode bypass + 反平行 CapabilityDot 实施 — 反向 grep `admin.*CapabilityDot\|CapabilityDotV2\|CapabilityDotLegacy` 0 hit (ADM-0 §1.3 红线) | grep | reverse grep test PASS |

## REG-CAPDOT-* 占号 (initial ⚪)

- REG-CAPDOT-001 ⚪ CapabilityDot 单源 (^export 反向 grep ==1 hit) + props byte-identical 跟 AP-2 v1 14-capability const SSOT
- REG-CAPDOT-002 ⚪ 3 渲染状态 (has 蓝 / not_has 灰 / unknown forward-compat) + 反 RBAC 双语 0 hit
- REG-CAPDOT-003 ⚪ 0 server prod + 复用 AP-2 v1 #620 14-capability const SSOT (反平行 CAPABILITY_TOKENS / LABEL_MAP)
- REG-CAPDOT-004 ⚪ Playwright 4 case PASS + ⭐ screenshot ≥3000 bytes 真生成
- REG-CAPDOT-005 ⚪ 全包 PASS + post-#621 haystack gate 三轨过
- REG-CAPDOT-006 ⚪ 反 admin god-mode bypass + 反平行 CapabilityDot + 立场承袭跨十六 milestone const SSOT 锁链 (BPP-2 + REFACTOR-REASONS + DM-9 + CHN-15 + AP-4-enum + DL-1 + REFACTOR-1 + REFACTOR-2 + NAMING-1 + DL-2 + DL-3 + ADM-3 v1 + AP-2 v1 + CS v1 + WIRE-1 + CAPABILITY-DOT)

## 退出条件

- §1 (3) + §2 (2) + §3 (2) + §4 (2) 全绿 — 一票否决
- CapabilityDot 单源 + 复用 AP-2 v1 14 const SSOT (反平行实施)
- Playwright 4 case + ⭐ screenshot ≥3000 bytes
- 反 RBAC 双语 0 hit + 反 admin god-mode bypass (ADM-0 §1.3)
- 0 server prod + post-#621 haystack gate 三轨过
- 登记 REG-CAPDOT-001..006

## 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-05-01 | 烈马 | v0 — acceptance template. 立场承袭 AP-2 v1 #620 14-capability const SSOT + AP-1 #493 ABAC + 反 RBAC 双语 + ADM-0 §1.3 红线 + post-#614 NAMING-1 codebase-wide 命名规范 + 跨四 milestone audit 反转锁链 e2e 真补. |
