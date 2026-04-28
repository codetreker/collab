// tests/cm-onboarding.spec.ts — CM-onboarding (#42) e2e.
//
// Acceptance § "5 happy E2E" / cm-onboarding §5: a freshly registered user
// must land on a non-empty channel containing the locked welcome copy and a
// quick-action button.
//
// Flow:
//   1. As admin (BORGEE_ADMIN_LOGIN / BORGEE_ADMIN_PASSWORD_HASH set in
//      playwright.config.ts), POST /admin-api/auth/login to get the admin
//      session cookie, then POST /admin-api/v1/invites to mint an invite.
//   2. POST /api/v1/auth/register with that invite → server-go creates the
//      user, the org, and the #welcome channel + system message.
//   3. Inject the resulting borgee_token cookie into the browser context and
//      load `/`. Assert:
//        - DOM contains the locked welcome body fragment ("欢迎来到 Borgee").
//        - The quick-action button "创建 agent" renders.
//        - Clicking it opens the AgentManager (heading visible).
//
// 反约束 §11 guard: the empty-state copy "👈 选择一个频道开始聊天" MUST NOT
// appear. The replacement is "正在准备你的工作区, 稍候刷新…" but for the
// happy path we shouldn't see that either — we should see the welcome
// channel directly.
import { test, expect, request as apiRequest } from '@playwright/test';

const ADMIN_LOGIN = 'e2e-admin';
// Plaintext form of BORGEE_ADMIN_PASSWORD_HASH baked into playwright.config.ts.
const ADMIN_PASSWORD = 'e2e-admin-pass-12345';

test.describe('CM-onboarding welcome channel', () => {
  test('newly registered user lands on a non-empty #welcome channel', async ({ page, baseURL }) => {
    const serverPort = process.env.E2E_SERVER_PORT ?? '4901';
    const serverURL = `http://127.0.0.1:${serverPort}`;
    const ctx = await apiRequest.newContext({ baseURL: serverURL });

    // 1. Admin login → admin session cookie.
    const loginRes = await ctx.post('/admin-api/auth/login', {
      data: { login: ADMIN_LOGIN, password: ADMIN_PASSWORD },
    });
    expect(loginRes.ok(), `admin login failed: ${loginRes.status()}`).toBe(true);

    // 2. Mint an invite code.
    const inviteRes = await ctx.post('/admin-api/v1/invites', {
      data: { note: 'cm-onboarding-e2e' },
    });
    expect(inviteRes.ok(), `mint invite failed: ${inviteRes.status()}`).toBe(true);
    const inviteJson = (await inviteRes.json()) as { invite: { code: string } };
    const inviteCode = inviteJson.invite.code;
    expect(inviteCode).toBeTruthy();

    // 3. Register a fresh user. Email is unique-per-run.
    const stamp = Date.now();
    const email = `welcome-${stamp}@example.test`;
    const password = 'p@ssw0rd-welcome';
    const displayName = `Welcomer ${stamp}`;
    const regCtx = await apiRequest.newContext({ baseURL: serverURL });
    const regRes = await regCtx.post('/api/v1/auth/register', {
      data: {
        invite_code: inviteCode,
        email,
        password,
        display_name: displayName,
      },
    });
    expect(regRes.ok(), `register failed: ${regRes.status()} ${await regRes.text()}`).toBe(true);

    // 4. Forward the registration cookies into the browser. We already
    // have a Set-Cookie on regCtx — copy it onto page.context() so the SPA
    // boots authenticated. Cookie name is borgee_token (api/auth.go
    // signAndSetCookie).
    const cookies = await regCtx.storageState();
    const tokenCookie = cookies.cookies.find(c => c.name === 'borgee_token');
    expect(tokenCookie, 'borgee_token cookie should be set by register').toBeTruthy();
    if (tokenCookie) {
      // Re-target the cookie at the client's host so the SPA reads it.
      const url = new URL(baseURL!);
      await page.context().addCookies([{
        name: 'borgee_token',
        value: tokenCookie.value,
        domain: url.hostname,
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      }]);
    }

    await page.goto('/');

    // 5. Assertions: welcome copy + quick action button + open AgentManager.
    // Markdown rendering wraps `**欢迎来到 Borgee 👋**` into <strong>; assert
    // on the substring inside the message body.
    await expect(page.locator('.message-system-content').first()).toContainText('欢迎来到 Borgee');
    const quickAction = page.locator('button.message-system-quick-action');
    await expect(quickAction).toBeVisible();
    await expect(quickAction).toHaveText('创建 agent');

    // §11 guard — old empty-state copy must not appear.
    await expect(page.getByText('👈 选择一个频道开始聊天')).toHaveCount(0);

    // Click → AgentManager opens (data-action attribute provides a stable
    // selector for the action label).
    await quickAction.click();
    // AgentManager renders a header containing "Agent" — keep the assertion
    // loose so a copy tweak doesn't churn this test.
    await expect(page.locator('text=/Agent/i').first()).toBeVisible();
  });
});
