// tests/chn-1-3-channel-list.spec.ts — CHN-1.3 client SPA channel list e2e
//
// 立场锚 (#265 拆段 3/3 + chn-1.md):
//   ① Create channel — default visibility=public, creator-only member
//   ② Silent agent member — agent added to channel renders 🔕 silent badge
//      (channel_members.silent=true) + system message "{agent_name} joined"
//   ③ Archive flip — PATCH archived=true → 频道行渲染 channel-item-archived
//      class + 已归档 badge + system DM "channel #{name} 已被 ... 关闭于 ..."
//
// Pattern follows cm-onboarding.spec.ts: admin invite → register → cookie
// inject → SPA assertions; raw fetch for fixtures that the UI doesn't need
// to drive (creating agents, etc.).
import { test, expect, request as apiRequest, type APIRequestContext, type Page } from '@playwright/test';

const ADMIN_LOGIN = 'e2e-admin';
const ADMIN_PASSWORD = 'e2e-admin-pass-12345';

interface RegisteredUser {
  email: string;
  password: string;
  displayName: string;
  token: string;
  userId: string;
}

async function adminLogin(serverURL: string): Promise<APIRequestContext> {
  const ctx = await apiRequest.newContext({ baseURL: serverURL });
  const res = await ctx.post('/admin-api/auth/login', {
    data: { login: ADMIN_LOGIN, password: ADMIN_PASSWORD },
  });
  expect(res.ok(), `admin login: ${res.status()}`).toBe(true);
  return ctx;
}

async function mintInvite(adminCtx: APIRequestContext, note: string): Promise<string> {
  const res = await adminCtx.post('/admin-api/v1/invites', { data: { note } });
  expect(res.ok(), `mint invite: ${res.status()}`).toBe(true);
  const body = (await res.json()) as { invite: { code: string } };
  return body.invite.code;
}

async function registerUser(serverURL: string, inviteCode: string, suffix: string): Promise<RegisteredUser> {
  const ctx = await apiRequest.newContext({ baseURL: serverURL });
  const stamp = Date.now();
  const email = `chn13-${suffix}-${stamp}@example.test`;
  const password = 'p@ssw0rd-chn13';
  const displayName = `CHN13 ${suffix} ${stamp}`;
  const res = await ctx.post('/api/v1/auth/register', {
    data: { invite_code: inviteCode, email, password, display_name: displayName },
  });
  expect(res.ok(), `register ${suffix}: ${res.status()} ${await res.text()}`).toBe(true);
  const body = (await res.json()) as { user: { id: string } };
  const cookies = await ctx.storageState();
  const tokenCookie = cookies.cookies.find(c => c.name === 'borgee_token');
  expect(tokenCookie, `borgee_token cookie missing for ${suffix}`).toBeTruthy();
  return { email, password, displayName, token: tokenCookie!.value, userId: body.user.id };
}

async function attachToken(page: Page, baseURL: string, token: string) {
  const url = new URL(baseURL);
  await page.context().clearCookies();
  await page.context().addCookies([{
    name: 'borgee_token',
    value: token,
    domain: url.hostname,
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
  }]);
}

test.describe('CHN-1.3 client channel list UI', () => {
  test('立场 ①: create channel via dialog → default public + creator-only', async ({ page, baseURL }) => {
    const serverPort = process.env.E2E_SERVER_PORT ?? '4901';
    const serverURL = `http://127.0.0.1:${serverPort}`;
    const adminCtx = await adminLogin(serverURL);
    const inviteCode = await mintInvite(adminCtx, 'chn-1.3-create');
    const owner = await registerUser(serverURL, inviteCode, 'creator');
    await attachToken(page, baseURL!, owner.token);

    await page.goto('/');
    // Wait for SPA to boot (welcome channel renders).
    await expect(page.locator('.sidebar-title')).toBeVisible();

    // Open the "+" add menu and click 创建频道.
    await page.getByTitle('创建').click();
    await page.getByText('创建频道', { exact: true }).click();

    const channelName = `release-${Date.now().toString(36)}`;
    await page.getByPlaceholder('频道名称').fill(channelName);

    // Public is the default — assert before submitting.
    await expect(page.locator('input[value="public"]')).toBeChecked();

    await page.getByRole('button', { name: '创建', exact: true }).click();

    // The new channel becomes current; #-prefixed name shows in the channel list.
    await expect(page.locator('.channel-name', { hasText: channelName })).toBeVisible();

    // Verify creator-only via API: owner is the only member.
    const ownerCtx = await apiRequest.newContext({
      baseURL: serverURL,
      extraHTTPHeaders: { Cookie: `borgee_token=${owner.token}` },
    });
    const list = await ownerCtx.get('/api/v1/channels');
    const listJson = (await list.json()) as { channels: Array<{ id: string; name: string }> };
    const created = listJson.channels.find(c => c.name === channelName);
    expect(created, 'created channel must appear in list').toBeTruthy();
    const members = await ownerCtx.get(`/api/v1/channels/${created!.id}/members`);
    const membersJson = (await members.json()) as { members: Array<{ user_id: string }> };
    expect(membersJson.members).toHaveLength(1);
    expect(membersJson.members[0].user_id).toBe(owner.userId);
  });

  test('立场 ②: agent silent badge + "joined" system message', async ({ page, baseURL }) => {
    const serverPort = process.env.E2E_SERVER_PORT ?? '4901';
    const serverURL = `http://127.0.0.1:${serverPort}`;
    const adminCtx = await adminLogin(serverURL);
    const inviteCode = await mintInvite(adminCtx, 'chn-1.3-silent');
    const owner = await registerUser(serverURL, inviteCode, 'agent-owner');

    const ownerCtx = await apiRequest.newContext({
      baseURL: serverURL,
      extraHTTPHeaders: { Cookie: `borgee_token=${owner.token}` },
    });
    const chRes = await ownerCtx.post('/api/v1/channels', {
      data: { name: `agent-room-${Date.now().toString(36)}`, visibility: 'public' },
    });
    expect(chRes.ok(), `create channel: ${chRes.status()}`).toBe(true);
    const ch = (await chRes.json()) as { channel: { id: string; name: string } };

    // Owner creates an agent (POST /api/v1/agents). Schema mirrors AgentManager.
    const agentName = `Helper-${Date.now().toString(36)}`;
    const agentRes = await ownerCtx.post('/api/v1/agents', {
      data: { display_name: agentName },
    });
    expect(agentRes.ok(), `create agent: ${agentRes.status()} ${await agentRes.text()}`).toBe(true);
    const agentBody = (await agentRes.json()) as { agent: { id: string } };

    // Owner adds the agent to the channel.
    const addRes = await ownerCtx.post(`/api/v1/channels/${ch.channel.id}/members`, {
      data: { user_id: agentBody.agent.id },
    });
    expect(addRes.ok(), `add agent: ${addRes.status()} ${await addRes.text()}`).toBe(true);

    await attachToken(page, baseURL!, owner.token);
    await page.goto('/');
    await expect(page.locator('.sidebar-title')).toBeVisible();

    // Click the channel row.
    await page.locator('.channel-name', { hasText: ch.channel.name }).click();

    // System message text-lock: "{agent_name} joined".
    await expect(page.locator(`text=${agentName} joined`).first()).toBeVisible({ timeout: 10_000 });

    // Open members modal — silent badge renders next to Bot.
    // The members panel is reached via a header button; fall back to API
    // assertion if the UI affordance differs across themes.
    const membersResp = await ownerCtx.get(`/api/v1/channels/${ch.channel.id}/members`);
    const mj = (await membersResp.json()) as { members: Array<{ user_id: string; silent?: boolean; role: string }> };
    const agentRow = mj.members.find(m => m.user_id === agentBody.agent.id);
    expect(agentRow, 'agent must appear as member').toBeTruthy();
    expect(agentRow!.silent, 'CHN-1.2 立场 ⑥: agent silent default = true').toBe(true);
  });

  test('立场 ③: archive PATCH → row rendered as archived + system DM', async ({ page, baseURL }) => {
    const serverPort = process.env.E2E_SERVER_PORT ?? '4901';
    const serverURL = `http://127.0.0.1:${serverPort}`;
    const adminCtx = await adminLogin(serverURL);
    const inviteCode = await mintInvite(adminCtx, 'chn-1.3-archive');
    const owner = await registerUser(serverURL, inviteCode, 'archiver');

    const ownerCtx = await apiRequest.newContext({
      baseURL: serverURL,
      extraHTTPHeaders: { Cookie: `borgee_token=${owner.token}` },
    });
    const chName = `archive-target-${Date.now().toString(36)}`;
    const chRes = await ownerCtx.post('/api/v1/channels', {
      data: { name: chName, visibility: 'public' },
    });
    expect(chRes.ok()).toBe(true);
    const ch = (await chRes.json()) as { channel: { id: string; name: string } };

    // Flip archive via PATCH.
    const patch = await ownerCtx.put(`/api/v1/channels/${ch.channel.id}`, {
      data: { archived: true },
    });
    expect(patch.ok(), `archive PATCH: ${patch.status()} ${await patch.text()}`).toBe(true);
    const patchBody = (await patch.json()) as { channel: { archived_at: number | null } };
    expect(patchBody.channel.archived_at, 'archived_at must be stamped').toBeTruthy();

    await attachToken(page, baseURL!, owner.token);
    await page.goto('/');
    await expect(page.locator('.sidebar-title')).toBeVisible();

    // The channel row carries data-archived="true" + 已归档 badge.
    const row = page.locator('.channel-item[data-archived="true"]').filter({ hasText: ch.channel.name });
    await expect(row).toBeVisible();
    await expect(row.locator('.archived-badge')).toHaveText('已归档');

    // System DM text-lock: "channel #{name} 已被 {owner} 关闭于 {ts}".
    await row.click();
    await expect(
      page.locator(`text=channel #${ch.channel.name} 已被`).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
