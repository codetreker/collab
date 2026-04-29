# settings — 用户设置页 (ADM-1 起)

代码位置：`/workspace/borgee/packages/client/src/components/Settings/`

## 1. 入口

- Sidebar 底部 ⚙️ 按钮（`data-action="open-settings"`）→ `App.tsx::onSettingsOpen` → `App.tsx::showSettings` state。
- 跟 `showAgents` / `showInvitations` / `showWorkspaces` / `showNodes` 同模式（App-level state 切视图，无 react-router）。
- `closeAllViews()` 互斥重置。
- 视图渲染：`<SettingsPage onBack={() => setShowSettings(false)} />`。

> **路径分叉**（ADM-0 红线）：用户 SPA `components/Settings/SettingsPage.tsx` 跟 admin SPA `admin/pages/SettingsPage.tsx` 同名共存不混用 — admin SPA 走 `react-router` + `/admin-api/*` cookie；用户 SPA 走 App-level state + `/api/v1/*` cookie。两者 cookie 拆 + endpoint 拆，不会串扰（REG-ADM0-001/002 共享底线）。

## 2. SettingsPage 骨架

`SettingsPage.tsx`：

- header：`<` 返回按钮（`data-page="settings"` + `[data-action="open-settings"]` 反查锚）+ "设置" 标题。
- 导航：`<nav className="settings-tabs">` — v1 仅一个 tab "隐私"（`data-tab="privacy"` + `aria-current="page"`，默认 active）。
- 内容：`<main className="settings-page-content">` 渲染 `<PrivacyPromise/>`。

> **v1 反约束**：`activeTab: SettingsTab = 'privacy'` 是常量，不挂 `useState` — 后续 tab（账号 / 通知）加入时反开锁 disabled。注释字面 byte-identical。

## 3. PrivacyPromise 组件 (ADM-1 核心)

`PrivacyPromise.tsx` — 用户隐私承诺页，**默认展开不可折叠**（野马 R3，反 `<details>` 包裹）。

### 3.1 三承诺锁

`PRIVACY_PROMISES`：3 元组字面 byte-identical 跟 `docs/blueprint/admin-model.md §4.1 R3` 同源（drift test CI 拦）：

1. **Admin 是平台运维, 不是协作者** — 永不出现在 channel / DM / 团队列表里。
2. **Admin 看不到消息 / 文件 / artifact 内容** — 除非你主动授权 impersonate (24h 时窗, 顶部红色横幅常驻, 可随时撤销)。
3. **Admin 能看的是元数据** (用户名 / channel 名 / 条数 / 登录时间), **看不到正文**。

渲染走 `<ol className="privacy-promise-list">` + `<li className="privacy-promise-item" dangerouslySetInnerHTML={{ __html: renderMarkdown(promise) }} />`（marked + DOMPurify, 跟 system message bubble 同 stack — `**bold**` 加粗显眼）。

### 3.2 八行 ✅/❌ 表格 (三色锁)

`PRIVACY_TABLE_ROWS`：8 行 `{ category, mark, kind }`，三色锁 byte-identical：

| kind | className | mark | 颜色 token |
|---|---|---|---|
| `allow` | `privacy-row-allow` | ✅ | gray default（不加色）|
| `deny` | `privacy-row-deny` | ❌ | `#d33` 加粗 |
| `impersonate` | `privacy-row-impersonate` | ✅ (临时) | `#d97706` amber |

8 行（顺序锁，acceptance §1 "顺序不变"）：

1. 用户名 / 邮箱 → ✅ allow
2. channel 名 / 列表 → ✅ allow
3. 消息条数 / 登录时间 → ✅ allow
4. 消息正文 (channel / DM) → ❌ deny
5. artifact / 文件内容 → ❌ deny
6. 你和 owner-agent 内置 DM → ❌ deny
7. API key 原值 → ❌ deny
8. 授权 impersonate 后 24h 实时入站 → ✅ (临时) impersonate

DOM：`<tr className={'privacy-row-' + row.kind} data-row-kind={row.kind}>` — `data-row-kind` 属性是 e2e 反查锚，跟 `chn-3-3-sidebar-reorder.spec.ts` `data-collapsed` / `data-sortable-handle` 同模式。

### 3.3 drift test (doc-as-truth)

`__tests__/PrivacyPromise.drift.test.ts` 走 vite `?raw` import 读 `docs/blueprint/admin-model.md`，断言：

- heading anchor `### 4.1 用户侧隐私承诺页文案 (ADM-1 acceptance 硬标尺)` toContain
- 三条 numbered `${i+1}. ${promise}` toContain（每条字面跟 PRIVACY_PROMISES 1:1）

任何一边漂移 CI 红，跟 CM-onboarding `TestWelcomeConstantsMirrorMigrations` 同模式（`docs/current/server-go.md` 已述同精神）。

## 4. 反约束 (野马 R3 + ADM-0)

源码层强制：

- `<details>` 元素：源码 0 hit（`SettingsPage.test.tsx::querySelectorAll('details')` count==0 + e2e `page.locator('details').count()` count==0）。
- 折叠 / collapse / 展开收起 同义词：`PrivacyPromise.tsx` 字面 0 hit（注释里的反约束说明不计 — 字面用全角逗号或换写避碰 grep）。
- admin/user 路径分叉：用户 cookie 调 `/admin-api/auth/me` → 401/403（e2e `adm-1-privacy-promise.spec.ts::§4` 反向断言, 跟 REG-ADM0-001/002 共享底线）。

## 5. 测试

- vitest（242/242 全过 +14 新）：
  - `PrivacyPromise.test.tsx` 9 cases — 三承诺字面 + 八行 byte-identical + 三色锁 + 反约束
  - `PrivacyPromise.drift.test.ts` — doc-as-truth (vite `?raw` import)
  - `SettingsPage.test.tsx` 4 cases — privacy tab 默认 active + back button + 反 `<details>`
- e2e（`packages/e2e/tests/adm-1-privacy-promise.spec.ts`，3 passed in 5.8s chromium）：
  - §1+§2: 三承诺 6 fragment + 八行 byte-identical + 三色锁 + G4.1 双截屏（`docs/qa/screenshots/g4.1-adm1-{privacy-promise,privacy-table}.png`）
  - §2 反约束: details count==0
  - §4 反向断言: admin/user 路径分叉

## 6. 锚

- 蓝图：`docs/blueprint/admin-model.md` §4.1 (3 条承诺) + §1.3 (Admin 看 / 看不到 边界)
- spec：`docs/qa/adm-1-implementation-spec.md` (#228) + checklist `docs/qa/adm-1-privacy-promise-checklist.md` (#211)
- acceptance：`docs/qa/acceptance-templates/adm-1.md` (11 验收项，9/11 ✅ + 2/11 ⏸️ ADM-2 留账)
- registry：`docs/qa/regression-registry.md` REG-ADM1-001..006 (6 🟢)
- PR 串：#455 实施 + #459 e2e + 双截屏 + #464 closure
