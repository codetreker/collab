# Acceptance Template — ADM-1 PrivacyPromise (用户隐私承诺页)

> 蓝图: `docs/blueprint/admin-model.md` §4.1 (3 条承诺锁) + §1.3 (Admin 看 / 看不到 边界)
> 反查表: `docs/qa/adm-1-privacy-promise-checklist.md` (野马 #211/#228 spec) · 实施 spec: `docs/qa/adm-1-implementation-spec.md`
> 前置: ADM-0.1/0.2/0.3 ✅ · Owner: 战马B (实施) / 烈马 (验收) / 野马 (文案 + 闸 4 demo 签字)

## 验收清单

### 文案 1:1 锁 (野马 §1 三条 + §2 表格, 一字不漏)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| §1 三条承诺字面 1:1 渲染 (admin-model §4.1 R3) | `PrivacyPromise.test.tsx::TestPromiseLiteral` snapshot | 战马B / 野马 | _(待填)_ |
| §2 八行 ✅/❌ 表格字面 1:1 + 顺序不变 | vitest grep 8 行 | 战马B / 野马 | _(待填)_ |
| drift test: doc §4.1 ↔ `PrivacyPromise.tsx` 常量 (doc-as-truth, CI 拦) | `PrivacyPromise.drift.test.ts` (CM-onboarding `TestWelcomeConstantsMirrorMigrations` 同模式) | 战马B / 烈马 | _(待填)_ |

### DOM / 视觉锁

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| `/settings?tab=privacy` 默认展开不可折叠, 不得 `<details>` 包裹 (野马 R3) | vitest `expect(section).toBeVisible()` + grep `<details` count==0 | 战马B / 烈马 | _(待填)_ |
| 三色锁: ❌ 行 `.privacy-row-deny` `#d33` 加粗 / ✅ 行 `.privacy-row-allow` 灰 / impersonate `.privacy-row-impersonate` `#d97706` amber | vitest CSS token 反查 | 战马B / 野马 | _(待填)_ |
| 反向 grep "折叠" / "collapse" / "展开/收起" 在 `PrivacyPromise.tsx` count==0 | CI grep | 烈马 | _(待填)_ |

### 联签 (ADM-0 §1.4 admin 写动作)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| admin 写动作 (重置 API key 等) → 业主 system DM 含 `admin_name` 非 raw UUID | `internal/api/admin_audit_test.go::TestAdminWriteEmitsNamedDM` (ADM-0 反查 ③ 共享) | 战马B / 烈马 | _(待填)_ |
| DM body 字面 "你的 API key 被 admin {admin_name} 重置, 请重新生成" | grep snapshot | 战马B / 野马 | _(待填)_ |

### 闸 4 demo (野马签字必备)

| 验收项 | 实施方式 | Owner | 实施证据 |
|---|---|---|---|
| 截屏 1: 设置页 "隐私承诺" 全屏 (3 条 + 8 行表格) → `docs/evidence/adm-1/1-promise.png` | Playwright | 烈马 / 野马 | _(待填)_ |
| 截屏 2: admin 重置 → 业主 system DM `admin_name` 非 UUID → `docs/evidence/adm-1/2-system-dm.png` | Playwright | 烈马 / 野马 | _(待填)_ |

## 退出条件

- 上表 11 项全绿 + ADM-0 REG-ADM0-001/002 回归不破 + drift CI 拦实测
- 野马 `docs/qa/signoffs/adm-1-yema-signoff.md` 签 (cm-4/adm-0 同格式) + REG-ADM1-001..006 落 6 行 ⚪→🟢
- G2.4 demo #6 闸 → 5/6 → 6/6 (#257 §2 留账闭)

## 更新日志

| 日期 | 作者 | 变化 |
|---|---|---|
| 2026-04-28 | 烈马 | v0 — Phase 4 ADM-1 11 验收项 (al-1b.md 同模板) |
