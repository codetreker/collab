# Acceptance Template — CS-2 (故障三态 banner + 4 层 UX + Playwright e2e v1)

> Spec brief `cs-2-spec.md` (飞马 v0). Owner: 战马D 实施 / 飞马 review / 烈马 验收. v0 wrapper PR #595 已 merge (REG-CS2-001..006 全 🟢), 本 v1 batch 接 Playwright e2e 真测 + screenshot demo.
>
> **CS-2 v1 范围**: v0 client wrapper 落地 (故障三态 enum + 4 层 UX `OutageBanner` + 0 server prod) 后, 接 Playwright e2e 真测 outage banner 三态切换 + 4 层降级 UX + ⭐ screenshot demo. 立场承袭 CS-1/3/4 client-only Wrapper + post-#618 haystack gate. **0 server prod + 0 schema 改**.

## 验收清单

### §1 行为不变量 (故障三态 enum + 4 层 UX byte-identical)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 1.1 故障三态 enum byte-identical (`healthy` / `degraded` / `outage`) const SSOT (反向 grep 字面在 client/src/components 除 const 单源 + _test 0 hit) | unit + grep | `cs2-outage-state.test.ts::TestCS2_OutageStateEnum_ByteIdentical` PASS + reverse grep test PASS (v0 已 🟢) |
| 1.2 4 层 UX 文案 byte-identical 跟蓝图 client-shape.md §1.5 同源 (`服务正常` / `连接抖动, 仍可写入` / `离线模式, 草稿暂存本地` / `服务故障, 请稍后重试`) — 反同义词漂 5 词 (`服务降级 / 网络异常 / 离线 / 重连中 / 加载中`) | grep | `_LayerLabels_ByteIdentical` + `_NoSynonymDrift` PASS (v0 已 🟢) |
| 1.3 OutageBanner 4 层渲染 + healthy 时 return null (反 banner 常驻漂) | vitest | `OutageBanner.test.tsx` 4 case (healthy null / degraded yellow / offline blue / outage red) PASS (v0 已 🟢) |

### §2 E2E (Playwright outage banner 三态切换 + 4 层降级)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 2.1 Playwright e2e 真测 outage banner 三态切换 — `cs-2-outage-banner.spec.ts` 4 case (healthy 不渲染 + degraded yellow + offline blue + outage red) | E2E | `packages/e2e/tests/cs-2-outage-banner.spec.ts` 4 case PASS (Playwright `--timeout=30000`) |
| 2.2 4 层降级 UX 真切换 — server 真触发 503 / WS disconnect → client 真接 → banner 真切换 三态 (反 mock-only) | E2E | `_RealStateTransition_ServerSide503` + `_RealStateTransition_WSDisconnect` 2 case PASS |

### §3 closure (REG + cov gate + screenshot)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 3.1 既有全包 unit + e2e + vitest 全绿不破 + post-#618 haystack gate 三轨过 (Func=50/Pkg=70/Total=85) | full test + CI | go-test-cov SUCCESS |
| 3.2 0 server prod + 0 schema 改 (Wrapper 第 14 处) — `git diff main -- packages/server-go/` 0 行 | git diff | 0 行 ✅ (v0 已 🟢) |
| 3.3 ⭐ Screenshot 真生成 — `docs/qa/screenshots/cs-2-outage-banner.png` (Playwright 真截图 ≥3000 bytes) | yema sign | 文件存在 + size verify |

### §4 反向断言 (反 admin god-mode + 反平行)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 4.1 反 admin god-mode 不挂 OutageBanner (ADM-0 §1.3 红线; 反向 grep `admin.*OutageBanner\|admin.*outage_state` 0 hit) | grep | reverse grep test PASS |
| 4.2 反平行 outage state 实施 — 反向 grep `OutageState\|useOutageState` 在 client/src/ 除 lib/cs2-* + _test 0 hit (单源 SSOT) + 反 OutageBannerV2 / OutageBannerLegacy 平行漂 | grep | reverse grep tests PASS |

## REG-CS2-* (v0 #595 已 🟢 / v1 e2e + screenshot 待翻)

- REG-CS2-001..006 🟢 (v0 PR #595 merged) — 故障三态 + 4 层 UX + 0 server prod + 反同义词漂
- REG-CS2-007 ⚪ Playwright e2e 4 case 真测 三态切换 + 4 层降级 (反 mock-only)
- REG-CS2-008 ⚪ ⭐ screenshot 真生成 + 反 admin god-mode + 反平行 + post-#618 haystack gate

## 退出条件

- §1 (3) + §2 (2) + §3 (3) + §4 (2) 全绿 — 一票否决
- Playwright e2e 4 case PASS + 真触发 503 / WS disconnect (反 mock-only)
- ⭐ screenshot ≥3000 bytes 真生成
- 0 server prod + post-#618 haystack gate 三轨过
- 反 admin god-mode bypass + 反平行 + 反同义词漂 5 词
- 登记 REG-CS2-007..008

## 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-30 | 战马D / 烈马 | v0 — wrapper acceptance (REG-CS2-001..006 全 🟢, PR #595 merged). |
| 2026-05-01 | 烈马 | v1 — 扩 4 段验收覆盖 Playwright e2e + screenshot demo. REG-CS2-007..008 ⚪ 占号. 立场承袭 CS-1/3/4 client-only Wrapper + 跨四 milestone audit 反转锁链 (RT-3 + REFACTOR-2 + DL-3 + AP-2 v1) e2e 真补 + post-#612 haystack gate + post-#614 NAMING-1 + ADM-0 §1.3 红线. **0 server prod 候选** (Wrapper 第 14 处). |
