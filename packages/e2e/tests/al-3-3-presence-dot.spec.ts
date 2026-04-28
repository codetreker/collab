// tests/al-3-3-presence-dot.spec.ts — AL-3.3 (#R3 Phase 2) e2e DOM 字面锁.
//
// al-3.md acceptance §3.1 + §3.2 + §3.4 — client SPA presence dot 三态:
//
//   §3.1 DOM 字面锁: 新建 agent 没 runtime → `data-presence="offline"` +
//   文本 "已离线". online/error 两态需 server 端 `presence.changed` 推送
//   (§2.5 TBD), 这里只锁 offline 默认态 — 后续 AL-3.x 等 push frame 落地
//   再扩 online + 6 reason codes 那两条 case (留 TODO).
//
//   §3.2 only-agent 反约束: AgentManager 视图所有 [data-presence] 行 role
//   都 ='agent'; 反查 [data-role="user"][data-presence] count==0 — 永久守
//   "人不带 presence 槽位" (立场 ①).
//
//   §3.4 cross-org: 跨 org owner 看到的 agent 行也走同 DOM 字面 (offline
//   语义), 不区分 org boundary. 实测 cross-org channel 邀请落地后再看, 这里
//   先用单 org agent 验 DOM 形状 — cross-org 那条等 §2 push frame + #318
//   邀请 acceptance 全 ready 一起上 (留 TODO 引 al-3.md §3.4).
//
// fixture 模式跟 cm-onboarding.spec.ts / cm-4-realtime.spec.ts 同形 (admin
// 派 invite → owner 注册 → POST /api/v1/agents → 跳 SPA AgentManager 看
// DOM). 不依赖 INFRA-2 placeholder fixtures/auth.ts.
import { test, expect, request as apiRequest } from '@playwright/test';

const ADMIN_LOGIN = 'e2e-admin';
const ADMIN_PASSWORD = 'e2e-admin-pass-12345';

test.describe('AL-3.3 client SPA presence dot (al-3.md §3.1 / §3.2)', () => {
  test('§3.1 default offline + §3.2 only-agent reverse: 新建 agent 渲染 data-presence="offline" + "已离线", 人行无 [data-presence]', async ({
    browser,
    baseURL,
  }) => {
    const serverPort = process.env.E2E_SERVER_PORT ?? '4901';
    const serverURL = `http://127.0.0.1:${serverPort}`;
    const adminCtx = await apiRequest.newContext({ baseURL: serverURL });

    const loginRes = await adminCtx.post('/admin-api/auth/login', {
      data: { login: ADMIN_LOGIN, password: ADMIN_PASSWORD },
    });
    expect(loginRes.ok(), `admin login: ${loginRes.status()}`).toBe(true);

    const inviteRes = await adminCtx.post('/admin-api/v1/invites', {
      data: { note: 'al-3.3-presence-owner' },
    });
    expect(inviteRes.ok(), `mint invite: ${inviteRes.status()}`).toBe(true);
    const inviteCode = ((await inviteRes.json()) as { invite: { code: string } })
      .invite.code;

    // Owner 注册 + 建 agent. agent 没 runtime, REST 返回 state='offline'.
    const stamp = Date.now();
    const ownerCtx = await apiRequest.newContext({ baseURL: serverURL });
    const ownerReg = await ownerCtx.post('/api/v1/auth/register', {
      data: {
        invite_code: inviteCode,
        email: `al33-owner-${stamp}@example.test`,
        password: 'p@ssw0rd-al33',
        display_name: `AL33 Owner ${stamp}`,
      },
    });
    expect(ownerReg.ok(), `owner register: ${ownerReg.status()}`).toBe(true);

    const agentRes = await ownerCtx.post('/api/v1/agents', {
      data: { display_name: `AL33 Agent ${stamp}` },
    });
    expect(agentRes.ok(), `agent create: ${agentRes.status()}`).toBe(true);

    // Forward owner cookie 到 SPA context.
    const ownerStorage = await ownerCtx.storageState();
    const tokenCookie = ownerStorage.cookies.find(c => c.name === 'borgee_token');
    expect(tokenCookie, 'borgee_token cookie should exist').toBeTruthy();

    const page = await browser.newPage();
    const url = new URL(baseURL!);
    await page.context().addCookies([{
      name: 'borgee_token',
      value: tokenCookie!.value,
      domain: url.hostname,
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    }]);

    await page.goto('/');

    // 进 AgentManager — quick-action 按钮在 #welcome 频道里 (CM-onboarding).
    // 找不到 quick-action 时退到 sidebar / route 直跳.
    await page.goto('/');
    const quickAction = page.locator('button.message-system-quick-action');
    if (await quickAction.count()) {
      await quickAction.first().click();
    } else {
      // 兜底: AgentManager 也可能挂 nav 入口 — 至少等 SPA 渲完, 用 testid 找.
      await page.waitForLoadState('networkidle');
    }

    // §3.1 — agent badge offline DOM 字面锁.
    const badge = page.locator('[data-testid="agent-state-badge"]').first();
    await expect(badge).toBeVisible({ timeout: 5000 });
    await expect(badge).toHaveAttribute('data-state', 'offline');
    // PresenceDot 内 [data-presence="offline"] (在 badge 内 nested).
    const dot = badge.locator('[data-presence]');
    await expect(dot).toHaveAttribute('data-presence', 'offline');
    // 文本字面 "已离线" — describeAgentState() 锁住 (跟 #305 content lock).
    await expect(badge).toContainText('已离线');
    // §5.1 反约束: badge 里不出 busy / idle / 忙 / 空闲.
    const badgeText = (await badge.textContent()) ?? '';
    expect(badgeText).not.toMatch(/busy|idle|忙|空闲/i);

    // §3.2 — only-agent 反查: 全页 [data-role="user"][data-presence] count==0.
    // (Sidebar DM 行 / ChannelMembersModal 行带 data-role; 仅 agent role 渲染 PresenceDot.)
    const peopleWithPresence = page.locator('[data-role="user"] [data-presence]');
    await expect(peopleWithPresence).toHaveCount(0);
    const adminsWithPresence = page.locator('[data-role="admin"] [data-presence]');
    await expect(adminsWithPresence).toHaveCount(0);

    // TODO(AL-3.x): 等 server `presence.changed` push frame 落地 (§2.5 TBD)
    // 后, 加 online → data-presence="online" + "在线" + 6 reason codes
    // error 文案那两条 case. 现 phase 仅锁 offline 默认态.

    // TODO(AL-3.x cross-org §3.4): 跨 org owner 视图的 agent 行 DOM 同形,
    // 等 #318 邀请 acceptance + push frame 全 ready 再加 cross-org case.
  });
});
