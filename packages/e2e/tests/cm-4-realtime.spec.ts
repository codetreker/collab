// tests/cm-4-realtime.spec.ts — RT-0 (#40) latency gate.
//
// 野马 G2.4 hardline: 邀请发出 → owner 端收到通知 latency MUST ≤ 3s.
// 60s polling does not satisfy. Acceptance evidence is a stopwatch-
// attached HTML report (see fixtures/stopwatch.ts) plus a pinned
// screenshot at docs/qa/screenshots/g2.4-realtime-latency.png.
//
// 烈马 R3 加补: latency 验收必须用 Playwright (vitest 跑不了真 ws +
// UI 时序), INFRA-2 (#39) 是这条 spec 的前置依赖, 已 merged.
//
// What this spec proves:
//   t=0  : requester POST /api/v1/agent_invitations
//   t=Δ  : owner page's bell badge becomes visible (DOM mutation
//          driven by the new agent_invitation_pending frame on /ws,
//          surfaced via dispatchInvitationPending → Sidebar listener)
//   assert Δ ≤ 3000ms.
//
// Status: live since #237 merged the server-side push half. Client
// side already shipped (#218): useWebSocket switch arms dispatch
// the new frames → window CustomEvent → Sidebar bell re-fetches.

import { test, expect, request as apiRequest } from '@playwright/test';
import { stopwatch } from '../fixtures/stopwatch';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_LOGIN = 'e2e-admin';
const ADMIN_PASSWORD = 'e2e-admin-pass-12345';

test.describe('RT-0 invitation push latency (≤ 3s)', () => {
  test('owner bell badge updates within 3s of POST /agent_invitations', async ({
    browser,
    baseURL,
  }, testInfo) => {
    const serverPort = process.env.E2E_SERVER_PORT ?? '4901';
    const serverURL = `http://127.0.0.1:${serverPort}`;
    const adminCtx = await apiRequest.newContext({ baseURL: serverURL });

    const loginRes = await adminCtx.post('/admin-api/auth/login', {
      data: { login: ADMIN_LOGIN, password: ADMIN_PASSWORD },
    });
    expect(loginRes.ok()).toBe(true);

    const mintInvite = async (note: string) => {
      const r = await adminCtx.post('/admin-api/v1/invites', { data: { note } });
      expect(r.ok()).toBe(true);
      return ((await r.json()) as { invite: { code: string } }).invite.code;
    };

    const stamp = Date.now();

    // Owner: registers + creates an agent. The agent's owner_id is
    // the owner user — the push hub routes the pending frame to that
    // user's ws connection (server-go internal/ws/hub.go).
    const ownerCtx = await apiRequest.newContext({ baseURL: serverURL });
    const ownerReg = await ownerCtx.post('/api/v1/auth/register', {
      data: {
        invite_code: await mintInvite('rt0-owner'),
        email: `rt0-owner-${stamp}@example.test`,
        password: 'p@ssw0rd-owner',
        display_name: `Owner ${stamp}`,
      },
    });
    expect(ownerReg.ok(), `owner register: ${ownerReg.status()}`).toBe(true);
    const agentRes = await ownerCtx.post('/api/v1/agents', {
      data: { display_name: `Agent ${stamp}` },
    });
    expect(agentRes.ok(), `agent create: ${agentRes.status()}`).toBe(true);
    const agentId = ((await agentRes.json()) as { agent: { id: string } }).agent.id;

    // Requester: registers + creates a channel they own (auto-member).
    const requesterCtx = await apiRequest.newContext({ baseURL: serverURL });
    const requesterReg = await requesterCtx.post('/api/v1/auth/register', {
      data: {
        invite_code: await mintInvite('rt0-requester'),
        email: `rt0-requester-${stamp}@example.test`,
        password: 'p@ssw0rd-requester',
        display_name: `Requester ${stamp}`,
      },
    });
    expect(requesterReg.ok(), `requester register: ${requesterReg.status()}`).toBe(true);
    const chRes = await requesterCtx.post('/api/v1/channels', {
      data: { name: `rt0-${stamp}`, visibility: 'private' },
    });
    expect(chRes.ok(), `channel create: ${chRes.status()}`).toBe(true);
    const channelId = ((await chRes.json()) as { channel: { id: string } }).channel.id;

    // Open the owner's SPA so /ws connects with their token.
    const ownerToken = (await ownerCtx.storageState()).cookies.find(
      c => c.name === 'borgee_token',
    );
    expect(ownerToken).toBeTruthy();
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
      data: { agent_id: agentId, channel_id: channelId },
    });
    expect(inviteRes.ok(), `invite create: ${inviteRes.status()}`).toBe(true);

    await badge.waitFor({ state: 'visible', timeout: 5000 });
    sw.stop();

    await sw.attach(testInfo, '邀请→通知 latency');

    // G2.4 evidence screenshot — pinned path consumed by 烈马
    // regression registry (REG-RT0-008 / G2.4 latency proof).
    await ownerPage.screenshot({
      path: path.join(__dirname, '../../../docs/qa/screenshots/g2.4-realtime-latency.png'),
      fullPage: false,
    });

    expect(sw.ms, `latency ${sw.ms}ms exceeds 3s hardline`).toBeLessThanOrEqual(3000);
  });
});
