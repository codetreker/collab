# Acceptance Template — CS-3 (PWA install + Web Push UI + Playwright e2e v1)

> Spec brief `cs-3-spec.md` (飞马 v0). Owner: 战马D 实施 / 飞马 review / 烈马 验收. v0 wrapper PR #598 已 merge (REG-CS3-001..006 全 🟢, 17 vitest), 本 v1 batch 接 Playwright e2e 真测 + screenshot demo.
>
> **CS-3 v1 范围**: v0 client wrapper 落地 (PWA install user-gesture only + Web Push 三态 + DL-4 lib byte-identical + 0 server prod) 后, 接 Playwright e2e 真测 install prompt + Web Push subscription 三态 + ⭐ 2 screenshot demo. 立场承袭 CS-1/2/4 client-only Wrapper + DL-4 #485 pushSubscribe.ts byte-identical + post-#618 haystack gate. **0 server prod + 0 schema 改**.

## 验收清单

### §1 行为不变量 (PWA install user-gesture + Web Push 三态 + DL-4 byte-identical)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 1.1 PWA install user-gesture only (Chrome/Edge 防滥用红线) — `useInstallPrompt` 拦 `beforeinstallprompt` event + cache deferredPrompt + `prompt()` 必由 click handler 触发 (反 auto-prompt) | unit + grep | `useInstallPrompt.test.tsx` 三态 (installable/installed/unavailable) PASS + 反向 grep `auto.*prompt\(\)\|onMount.*requestPermission\|useEffect.*requestPermission` 0 hit (v0 已 🟢) |
| 1.2 Web Push 三态文案 byte-identical (granted `已开启通知` / denied `通知已被浏览器拒绝, 请到浏览器设置开启` / default `开启通知`) + unsupported→null + 反同义词漂 5 词 | vitest + grep | `cs3-permission-labels.test.ts::_PermissionLabels_LiteralByteIdentical` + `_NoSynonymDrift` PASS (v0 已 🟢) |
| 1.3 DL-4 #485 pushSubscribe.ts byte-identical 不改 + delegate `subscribeToPush()/unsubscribeFromPush()` (反 cs3 平行 PushHelper) | grep + vitest | `git diff main -- packages/client/src/lib/pushSubscribe.ts` = **0 行** + `_DelegatesToDL4` vi.spyOn PASS (v0 已 🟢) |

### §2 E2E (Playwright PWA install + Web Push subscription 真测)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 2.1 Playwright e2e 真测 PWA install — `cs-3-pwa-install.spec.ts` 4 case (installable click 真触发 prompt() + installed return null + appinstalled event 真接 + reject 用户 deferredPrompt 真清) | E2E | `packages/e2e/tests/cs-3-pwa-install.spec.ts` 4 case PASS |
| 2.2 Playwright e2e 真测 Web Push — `cs-3-web-push.spec.ts` 4 case (default click 真触发 Notification.requestPermission() + granted 渲染 + denied disabled + unsupported return null) | E2E | `cs-3-web-push.spec.ts` 4 case PASS |

### §3 closure (REG + cov gate + 2 screenshot)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 3.1 既有全包 unit + e2e + vitest 全绿不破 + post-#618 haystack gate 三轨过 (Func=50/Pkg=70/Total=85) | full test + CI | 17 vitest (v0) + 8 e2e (v1) PASS + go-test-cov SUCCESS |
| 3.2 0 server prod + 0 schema 改 (Wrapper 第 15 处) — `git diff main -- packages/server-go/` 0 行 | git diff | 0 行 ✅ (v0 已 🟢) |
| 3.3 ⭐ 2 Screenshot 真生成 (`docs/qa/screenshots/cs-3-install-prompt.png` + `cs-3-push-toggle-three-states.png`) — Playwright `await page.screenshot()` 真截图 ≥3000 bytes 各 | yema sign | 2 文件存在 + size verify |

### §4 反向断言 (反 admin god-mode + 反 mount auto requestPermission + 反平行)

| 验收项 | 实施方式 | 实施证据 |
|---|---|---|
| 4.1 反 mount-time auto `Notification.requestPermission()` (反 user-gesture only 红线漂) — body 0 hit in PushSubscribeToggle.tsx | grep | reverse grep test PASS (v0 已 🟢) |
| 4.2 反 admin god-mode 不挂 (ADM-0 §1.3 红线; 反向 grep `admin.*install\|admin.*push\|/admin-api.*push` 0 hit) + 反平行 cs3 PushHelper / cs3 newCursor (DL-4 单源) | grep | reverse grep tests PASS (v0 已 🟢) |

## REG-CS3-* (v0 #598 已 🟢 / v1 e2e + 2 screenshot 待翻)

- REG-CS3-001..006 🟢 (v0 PR #598 merged) — PWA install user-gesture + Web Push 三态 + DL-4 lib byte-identical + 0 server prod + 反 7 锚
- REG-CS3-007 ⚪ Playwright e2e 8 case (PWA install 4 + Web Push subscription 4) 真测 user-gesture 真触发 + 真注册 service worker (反 mock-only)
- REG-CS3-008 ⚪ ⭐ 2 screenshot 真生成 (install-prompt + push-toggle-three-states ≥3000 bytes 各) + post-#618 haystack gate

## 退出条件

- §1 (3) + §2 (2) + §3 (3) + §4 (2) 全绿 — 一票否决
- PWA install user-gesture only + Web Push 三态 byte-identical + DL-4 lib byte-identical
- Playwright e2e 8 case PASS (PWA 4 + Web Push 4) + 真触发 prompt + 真注册 service worker
- ⭐ 2 screenshot ≥3000 bytes 各 真生成
- 0 server prod + post-#618 haystack gate 三轨过
- 反 admin god-mode bypass + 反 mount auto requestPermission + 反平行 PushHelper
- 登记 REG-CS3-007..008

## 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-30 | 战马D / 飞马 / 烈马 / 野马 | v0 — wrapper acceptance (REG-CS3-001..006 全 🟢, PR #598 merged). |
| 2026-05-01 | 烈马 | v1 — 扩 4 段验收覆盖 Playwright e2e + 2 screenshot demo. REG-CS3-007..008 ⚪ 占号. 立场承袭 CS-1 #601 + CS-2 #595 + CS-4 #604 client-only Wrapper + DL-4 #485 pushSubscribe.ts byte-identical + 跨四 milestone audit 反转锁链 (RT-3 + REFACTOR-2 + DL-3 + AP-2 v1) e2e 真补 + post-#612 haystack gate + post-#614 NAMING-1 + ADM-0 §1.3 红线. **0 server prod 候选** (Wrapper 第 15 处). |
