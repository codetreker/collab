// tests/g2.4-demo-screenshots.spec.ts — Phase 2 退出 gate G2.4 截屏 5 张
//
// 计划锚: docs/qa/g2.4-screenshot-plan.md (PR #199, 5 张文案锁 + Playwright 触发条件)
// 签字锚: docs/qa/g2.4-demo-signoff.md (野马 4/5 项 ✅/❌)
// 立场锚: 14 立场 §1.1 / §1.2 / §1.4 + README §核心 11 + onboarding-journey §3 步骤 1-2 + 5
//
// 5 张截屏命名 (落 docs/qa/screenshots/g2.4-{1..5}.png):
//   #1 Welcome 第一眼非空屏 (§1.4 + onboarding 步骤 2) — register → DOM 含 system message + 不含 "👈 选择频道"
//   #2 左栏团队感知 — DEFERRED-UNWIND audit真删 (依赖 milestone closure 后由 AL-1b spec test 锁源头, e2e 加层重复)
//   #3 Agent invitation inbox name 渲染 — DEFERRED-UNWIND audit真删 (cm-4-bug-029-name-display-regression.spec.ts 已锁 inbox name 渲染立场 byte-identical, 跟此 demo 截屏目标 重复)
//   #4 Quick action 错误态 — DEFERRED-UNWIND audit真删 (依赖 mock 409 重写 fixture infra, agent_invitation accept 错误码 409 由 server-side unit api/agent_invitations_test.go 锁)
//   #5 System message + CTA button (步骤 2 message kind) — 同 #1 重点截 message bubble + button → click 跳 AgentManager
//
// 复用 cm-onboarding.spec.ts 的 admin-login → invite-code → register pattern.
import { test, expect, request as apiRequest } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const ADMIN_LOGIN = 'e2e-admin';
const ADMIN_PASSWORD = 'e2e-admin-pass-12345';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/qa/screenshots');

async function bootstrapUser(serverURL: string, page: any, baseURL: string, displayName: string) {
  const ctx = await apiRequest.newContext({ baseURL: serverURL });
  const loginRes = await ctx.post('/admin-api/auth/login', {
    data: { login: ADMIN_LOGIN, password: ADMIN_PASSWORD },
  });
  expect(loginRes.ok(), `admin login failed: ${loginRes.status()}`).toBe(true);
  const inviteRes = await ctx.post('/admin-api/v1/invites', { data: { note: 'g2.4-demo' } });
  const inviteJson = (await inviteRes.json()) as { invite: { code: string } };
  const stamp = Date.now();
  const regCtx = await apiRequest.newContext({ baseURL: serverURL });
  const regRes = await regCtx.post('/api/v1/auth/register', {
    data: {
      invite_code: inviteJson.invite.code,
      email: `g24-${stamp}@example.test`,
      password: 'p@ssw0rd-g24',
      display_name: displayName,
    },
  });
  expect(regRes.ok(), `register failed: ${regRes.status()}`).toBe(true);
  const cookies = await regCtx.storageState();
  const tokenCookie = cookies.cookies.find(c => c.name === 'borgee_token');
  expect(tokenCookie).toBeTruthy();
  const url = new URL(baseURL);
  await page.context().addCookies([{
    name: 'borgee_token',
    value: tokenCookie!.value,
    domain: url.hostname,
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
  }]);
}

test.describe('G2.4 demo screenshots — Phase 2 退出 gate', () => {
  const serverPort = process.env.E2E_SERVER_PORT ?? '4901';
  const serverURL = `http://127.0.0.1:${serverPort}`;

  test('#1 Welcome 第一眼非空屏 (§1.4 + onboarding §3 步骤 2)', async ({ page, baseURL }) => {
    await bootstrapUser(serverURL, page, baseURL!, 'G2.4 Owner');
    await page.goto('/');
    // 立场锁: 第一眼非空屏 — system message + 不含 "👈 选择频道"
    await expect(page.locator('.message-system-content').first()).toContainText('欢迎来到 Borgee');
    await expect(page.getByText('👈 选择一个频道开始聊天')).toHaveCount(0);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'g2.4-1-welcome-first-glance.png'),
      fullPage: true,
    });
  });

  test('#5 System message + CTA button 局部 (步骤 2 message kind)', async ({ page, baseURL }) => {
    await bootstrapUser(serverURL, page, baseURL!, 'G2.4 CTA Owner');
    await page.goto('/');
    const messageBubble = page.locator('.message-system-content').first();
    await expect(messageBubble).toContainText('欢迎来到 Borgee');
    const cta = page.locator('button.message-system-quick-action');
    await expect(cta).toHaveText('创建 agent');
    // 局部截屏: message bubble + button (非 fullPage)
    await messageBubble.screenshot({
      path: path.join(SCREENSHOT_DIR, 'g2.4-5-system-message-cta.png'),
    });
  });

  // #2/#3/#4: DEFERRED-UNWIND audit真删 — 立场已由跨 milestone server unit
  // + vitest 单测锁源头 byte-identical 守, e2e 加层重复无新覆盖. 详细
  // rationale 见本文件 header.
});
