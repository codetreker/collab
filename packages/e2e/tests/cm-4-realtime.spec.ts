// tests/cm-4-realtime.spec.ts — RT-0 (#40) latency gate.
//
// 野马 G2.4 hardline: 邀请发出 → owner 端收到通知 latency MUST ≤ 3s.
// 60s polling does not satisfy. Acceptance evidence is a stopwatch-
// attached HTML report (see fixtures/stopwatch.ts).
//
// 烈马 R3 加补: latency 验收必须用 Playwright (vitest 跑不了真 ws +
// UI 时序), INFRA-2 (#39) 是这条 spec 的前置依赖, 已 merged.
//
// What this spec proves once enabled:
//   t=0  : requester POST /api/v1/agent_invitations
//   t=Δ  : owner page's bell badge increments (DOM mutation)
//   assert Δ ≤ 3000ms.
//
// Status: skipped pending the server-side push half of RT-0. Client
// side (this branch) is ready: useWebSocket dispatches the new frame
// → window CustomEvent → Sidebar bell re-fetches. Once server lands
// (separate PR after ADM-0.3 unblocks), drop `.skip` and fill in the
// TODO fixture IDs — gate goes live with a 1-line diff.

import { test, expect, request as apiRequest } from '@playwright/test';
import { stopwatch } from '../fixtures/stopwatch';

const ADMIN_LOGIN = 'e2e-admin';
const ADMIN_PASSWORD = 'e2e-admin-pass-12345';

test.describe.skip('RT-0 invitation push latency (≤ 3s)', () => {
  test('owner bell badge updates within 3s of POST /agent_invitations', async ({
    browser,
    baseURL,
  }, testInfo) => {
    const serverPort = process.env.E2E_SERVER_PORT ?? '4901';
    const serverURL = `http://127.0.0.1:${serverPort}`;
    const ctx = await apiRequest.newContext({ baseURL: serverURL });

    const loginRes = await ctx.post('/admin-api/auth/login', {
      data: { login: ADMIN_LOGIN, password: ADMIN_PASSWORD },
    });
    expect(loginRes.ok()).toBe(true);

    const mintInvite = async () => {
      const r = await ctx.post('/admin-api/v1/invites', { data: { note: 'rt-0-e2e' } });
      expect(r.ok()).toBe(true);
      return ((await r.json()) as { invite: { code: string } }).invite.code;
    };

    const stamp = Date.now();
    const ownerCtx = await apiRequest.newContext({ baseURL: serverURL });
    const ownerReg = await ownerCtx.post('/api/v1/auth/register', {
      data: {
        invite_code: await mintInvite(),
        email: `rt0-owner-${stamp}@example.test`,
        password: 'p@ssw0rd-owner',
        display_name: `Owner ${stamp}`,
      },
    });
    expect(ownerReg.ok()).toBe(true);
    const ownerToken = (await ownerCtx.storageState()).cookies.find(
      c => c.name === 'borgee_token',
    );
    expect(ownerToken).toBeTruthy();

    const requesterCtx = await apiRequest.newContext({ baseURL: serverURL });
    const requesterReg = await requesterCtx.post('/api/v1/auth/register', {
      data: {
        invite_code: await mintInvite(),
        email: `rt0-requester-${stamp}@example.test`,
        password: 'p@ssw0rd-requester',
        display_name: `Requester ${stamp}`,
      },
    });
    expect(requesterReg.ok()).toBe(true);

    // TODO server-side RT-0 PR: replace with real agent + channel IDs
    // from the cross-org test harness owned by that PR.
    const ownerAgentId = 'TODO-from-server-fixture';
    const targetChannelId = 'TODO-from-server-fixture';

    const ownerPage = await browser.newPage();
    const url = new URL(baseURL!);
    await ownerPage.context().addCookies([{
      name: 'borgee_token',
      value: ownerToken!.value,
      domain: url.hostname,
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    }]);
    await ownerPage.goto('/');

    const badge = ownerPage.locator('[data-testid=invitation-bell-badge]');
    await expect(badge).toHaveCount(0);

    const sw = stopwatch();
    const inviteRes = await requesterCtx.post('/api/v1/agent_invitations', {
      data: { agent_id: ownerAgentId, channel_id: targetChannelId },
    });
    expect(inviteRes.ok()).toBe(true);

    await badge.waitFor({ state: 'visible', timeout: 5000 });
    sw.stop();

    await sw.attach(testInfo, '邀请→通知 latency');
    expect(sw.ms, `latency ${sw.ms}ms exceeds 3s hardline`).toBeLessThanOrEqual(3000);
  });
});
