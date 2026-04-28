// tests/g2.4-adm-0-stance.spec.ts — G2.4 第 6 张截屏: ADM-0 立场 demo
//
// 计划锚: docs/qa/g2.4-screenshot-plan.md (PR #199, 5+1=6) + signoff §5 解封路径
// 立场锚: docs/qa/adm-0-stance-checklist.md §1 ① + ② (admin 不入 channel + 红横幅)
// 解封: ADM-0.3 已 merged (08:03Z), admin SPA 实际部署后翻 .skip → active
//
// 第 6 张内容: admin 不入 channel 反向断言 + admin SPA 红色横幅 (ADM-1 实施时填文案锁)
//   - admin god-mode list channel → 看到 channel name (✅ 元数据) 但不能进入
//   - admin cookie GET /api/v1/channels/<id>/messages → 401 (不是 200, ADM-0.2 cookie 拆已锁)
//   - admin SPA 顶部红色横幅 #d33 常驻 (留 ADM-1 实施 PrivacyPromise + AdminBanner 后填)
//
// .skip 占位形 (admin SPA 还未部署 e2e fixture); 翻 active 条件:
//   1. ADM-1 PR (PrivacyPromise.tsx + AdminBanner.tsx) merged
//   2. e2e fixture 加 admin 登录 + impersonation grant happy path
import { test, expect } from '@playwright/test';

test.describe('G2.4 第 6 张 — ADM-0 立场 demo (admin 不入 channel + 红横幅)', () => {
  // 翻 active 条件: ADM-1 PR merged + admin e2e fixture 就位
  test.skip('admin god-mode 看 channel 元数据但不能进入 + 红色横幅常驻', async () => {
    // TODO(ADM-1): 实施时填:
    //  1. user A 注册 → 创建 channel "#design"
    //  2. admin 登录 admin SPA → GET /admin-api/channels → 含 #design 元数据 (name + member_count)
    //  3. admin cookie GET /api/v1/channels/<id>/messages → 401 (ADM-0.2 cookie 拆反向断言)
    //  4. admin SPA 顶部 DOM 含 banner 红色 #d33 + 文案锁 (ADM-1 实施时锁字面)
    //  5. 截屏 docs/qa/screenshots/g2.4-6-adm-0-stance.png (fullPage)
  });
});
