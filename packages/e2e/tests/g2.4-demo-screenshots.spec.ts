// tests/g2.4-demo-screenshots.spec.ts — Phase 2 退出 gate G2.4 截屏 5 张
//
// 计划锚: docs/qa/g2.4-screenshot-plan.md (PR #199, 5 张文案锁 + Playwright 触发条件)
// 签字锚: docs/qa/g2.4-demo-signoff.md (野马 4/5 项 ✅/❌)
// 立场锚: 14 立场 §1.1 / §1.2 / §1.4 + README §核心 11 + onboarding-journey §3 步骤 1-2 + 5
//
// 5 张截屏命名 (落 docs/qa/screenshots/g2.4-{1..5}.png):
//   #1 Welcome 第一眼非空屏 (§1.4 + onboarding 步骤 2) — register → DOM 含 system message + 不含 "👈 选择频道"
//   #2 左栏团队感知 (§1.2 + 步骤 5) — register + 创建 1 agent → sidebar 含 agent name + subject 文案
//   #3 Agent invitation inbox name 渲染 (§1.1 + bug-029 fix) — 邀请 1 agent 到 #design → inbox 渲染 name 而非 raw UUID
//   #4 Quick action 错误态 (README §核心 11) — 接受邀请 mock 409 → DOM "该邀请已被处理或状态已变更, 请刷新"
//   #5 System message + CTA button (步骤 2 message kind) — 同 #1 重点截 message bubble + button → click 跳 AgentManager
//
// 复用 cm-onboarding.spec.ts 的 admin-login → invite-code → register pattern。
//
// 注: #2 (左栏团队感知 agent 创建后渲染) / #3 (邀请 inbox name) / #4 (mock 409)
//     依赖 AgentManager + agent 创建 API + agent_invitations API + MSW route override。
//     #1 / #5 现在就能跑 (CM-onboarding + welcome message 已 merged); #2 / #3 / #4
//     待 AL-1b (subject 文案锁) + e2e mock infra 后置, 标 .skip 留接入点。
import { test, expect, request as apiRequest } from '@playwright/test';
import * as path from 'path';

const ADMIN_LOGIN = 'e2e-admin';
const ADMIN_PASSWORD = 'e2e-admin-pass-12345';
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

  // #2 左栏团队感知 — 依赖 AL-1b (subject 文案锁) + agent 创建 happy path API
  test.skip('#2 左栏团队感知 (§1.2 + onboarding §3 步骤 5)', async () => {
    // TODO(AL-1b): subject "正在熟悉环境" + 分组 header "你的团队" 落地后接入
  });

  // #3 邀请 inbox name 渲染 — 依赖 agent 创建 + agent_invitations POST happy path
  test.skip('#3 Agent invitation inbox name 渲染 (§1.1 + bug-029)', async () => {
    // TODO(post-AL-1b): 邀请 agent "助手" 到 channel "#design" → inbox 文案
    //   "邀请你的 agent **助手** 加入 channel **#design**", raw UUID 仅 title hover
  });

  // #4 Quick action 错误态 — 依赖 page.route() mock 409 重写
  test.skip('#4 Quick action 错误态 (README §核心 11)', async () => {
    // TODO: page.route('**/api/v1/agent_invitations/*', route → 409) →
    //   accept click → DOM "该邀请已被处理或状态已变更, 请刷新"
  });
});
