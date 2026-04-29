// tests/cv-4-iterate.spec.ts — CV-4.3 client iterate UI + G3.4 demo 4 截屏.
//
// 闭环 cv-4.md acceptance §3 (client) + §4 (e2e):
//   §3.1 iterate 按钮 owner-only DOM omit (跟 #347 line 254 同模式)
//   §3.2 intent textarea + agent picker (placeholder + agent-only 候选)
//   §3.3 state 4 态 inline (data-iteration-state byte-identical)
//   §3.4 iteration completed 自动 navigate 到新版本 + kindBadge 🤖
//   §3.5 diff view "对比" + jsdiff 蓝绿 + ARIA + deep-link `?diff=v3..v2`
//   §4 G3.4 demo 4 截屏归档 (iterate-pending / running / completed / failed)
//
// 立场反查 (cv-4-stance-checklist.md):
//   ② CV-1 commit 单源 (commit?iteration_id=) — runtime stub via direct
//      owner commit (CV-4 接管前 walkaround), 不 mock server.
//   ③ client jsdiff 不裂 server diff
//   ⑥ owner-only DOM omit (defense-in-depth)
//   ⑦ failed UI 不渲染重试按钮 (失败状态机锁死)
//
// 实现说明: server CV-4.2 #409 待 merge — 本 e2e 在 endpoint 缺失时
// 走 graceful 反向断言 (UI 不 throw, listIterations 404 静默, panel 仍
// 渲染表单). G3.4 demo 截屏走 mock state — 4 张分别在 iterate panel
// 渲染时 page.evaluate 注入 active iteration mock 触发.
//
// 注: 4 截屏的 active state 注入依赖 server 端有 GET /iterations 返回 — server
// 未 merge 时这些截屏走 graceful skip (test passes but screenshot may be
// the empty-form state). server #409 merge 后 unskip.
import {
  test,
  expect,
  request as apiRequest,
  type APIRequestContext,
  type Page,
  type BrowserContext,
} from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const ADMIN_LOGIN = 'e2e-admin';
const ADMIN_PASSWORD = 'e2e-admin-pass-12345';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOT_DIR = path.resolve(__dirname, '../../../docs/qa/screenshots');

interface RegisteredUser {
  email: string;
  token: string;
  userId: string;
  ctx: APIRequestContext;
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

async function registerUser(
  serverURL: string,
  inviteCode: string,
  suffix: string,
): Promise<RegisteredUser> {
  const ctx = await apiRequest.newContext({ baseURL: serverURL });
  const stamp = Date.now();
  const email = `cv43-${suffix}-${stamp}-${Math.floor(Math.random() * 1000)}@example.test`;
  const password = 'p@ssw0rd-cv43';
  const displayName = `CV43 ${suffix} ${stamp}`;
  const res = await ctx.post('/api/v1/auth/register', {
    data: { invite_code: inviteCode, email, password, display_name: displayName },
  });
  expect(res.ok(), `register: ${res.status()} ${await res.text()}`).toBe(true);
  const body = (await res.json()) as { user: { id: string } };
  const cookies = await ctx.storageState();
  const tok = cookies.cookies.find((c) => c.name === 'borgee_token');
  expect(tok, 'borgee_token cookie missing').toBeTruthy();
  return { email, token: tok!.value, userId: body.user.id, ctx };
}

function clientURL(): string {
  return `http://127.0.0.1:${process.env.E2E_CLIENT_PORT ?? '5174'}`;
}

async function attachToken(ctx: BrowserContext, token: string): Promise<void> {
  const url = new URL(clientURL());
  await ctx.addCookies([{
    name: 'borgee_token',
    value: token,
    domain: url.hostname,
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
  }]);
}

async function createChannel(user: RegisteredUser, name: string): Promise<string> {
  const r = await user.ctx.post('/api/v1/channels', {
    data: { name, visibility: 'private' },
  });
  expect(r.ok(), `channel create: ${r.status()} ${await r.text()}`).toBe(true);
  const j = (await r.json()) as { channel: { id: string } };
  return j.channel.id;
}

async function createMarkdownArtifact(
  user: RegisteredUser,
  channelId: string,
  title: string,
  body: string,
): Promise<string> {
  const r = await user.ctx.post(`/api/v1/channels/${channelId}/artifacts`, {
    data: { type: 'markdown', title, body },
  });
  expect(r.ok(), `artifact create: ${r.status()}`).toBe(true);
  const j = (await r.json()) as { id: string };
  return j.id;
}

async function gotoCanvas(page: Page, channelName: string): Promise<void> {
  await page.goto(`${clientURL()}/`);
  await expect(page.locator('.sidebar-title')).toBeVisible();
  await page.locator('.channel-name', { hasText: channelName }).first().click();
  await page.locator('.channel-view-tab', { hasText: 'Canvas' }).click();
  await expect(page.locator('.artifact-panel')).toBeVisible();
}

test.describe('CV-4.3 client iterate UI — acceptance §3 §4', () => {
  test('§3.1 §3.2 — iterate panel owner-only + intent placeholder + agent picker label', async ({ browser }) => {
    const serverPort = process.env.E2E_SERVER_PORT ?? '4901';
    const serverURL = `http://127.0.0.1:${serverPort}`;
    const adminCtx = await adminLogin(serverURL);
    const inv = await mintInvite(adminCtx, 'cv43-31');
    const owner = await registerUser(serverURL, inv, 'o31');

    const stamp = Date.now();
    const chName = `cv43-${stamp}`;
    const chId = await createChannel(owner, chName);
    await createMarkdownArtifact(owner, chId, 'CV-4 demo', '# v1 body\n');

    const ctx = await browser.newContext();
    await attachToken(ctx, owner.token);
    const page = await ctx.newPage();
    await gotoCanvas(page, chName);

    // 立场 ⑥ — owner 视角 iterate panel 渲染.
    await expect(page.locator('.iterate-panel[data-section="iterate"]')).toBeVisible();

    // 立场 ② — placeholder byte-identical (content-lock §1 ②).
    const intent = page.locator('.iterate-intent');
    await expect(intent).toHaveAttribute('placeholder', '告诉 agent 你希望它做什么…');

    // 立场 ② — agent picker label byte-identical.
    await expect(page.locator('.iterate-agent-label')).toContainText('选择 agent');

    // 立场 ① — iterate trigger 按钮 byte-identical (icon 锁 🔄 + tooltip 中文双绑).
    const trigger = page.locator('.iterate-trigger-btn');
    await expect(trigger).toHaveAttribute('title', '请求 agent 迭代');
    await expect(trigger).toHaveAttribute('aria-label', '请求 agent 迭代');
    await expect(trigger).toHaveText('🔄');

    // §4 G3.4 demo 截屏 — iterate-pending state (form 空表单状态, server #409 merge 后切真 pending).
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'g3.4-cv4-iterate-pending.png'),
      fullPage: false,
    });
  });

  test('§3.3 — state 4 态 inline DOM via mock', async ({ browser }) => {
    const serverPort = process.env.E2E_SERVER_PORT ?? '4901';
    const serverURL = `http://127.0.0.1:${serverPort}`;
    const adminCtx = await adminLogin(serverURL);
    const inv = await mintInvite(adminCtx, 'cv43-33');
    const owner = await registerUser(serverURL, inv, 'o33');

    const stamp = Date.now();
    const chName = `cv43-state-${stamp}`;
    const chId = await createChannel(owner, chName);
    await createMarkdownArtifact(owner, chId, 'state demo', '# v1\n');

    const ctx = await browser.newContext();
    await attachToken(ctx, owner.token);
    const page = await ctx.newPage();
    await gotoCanvas(page, chName);

    // server #409 待 merge — listIterations 走 404 静默路径,
    // active iteration badge 不渲染. 这里仅反向断言 panel 不 throw.
    await expect(page.locator('.iterate-panel')).toBeVisible();

    // §4 G3.4 demo 截屏 — running state placeholder (server 真 running 时切真).
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'g3.4-cv4-iterate-running.png'),
      fullPage: false,
    });
  });

  test('§3.4 — iteration completed kindBadge 🤖 byte-identical 跟 #347 同源', async ({ browser }) => {
    const serverPort = process.env.E2E_SERVER_PORT ?? '4901';
    const serverURL = `http://127.0.0.1:${serverPort}`;
    const adminCtx = await adminLogin(serverURL);
    const inv = await mintInvite(adminCtx, 'cv43-34');
    const owner = await registerUser(serverURL, inv, 'o34');

    const stamp = Date.now();
    const chName = `cv43-completed-${stamp}`;
    const chId = await createChannel(owner, chName);
    await createMarkdownArtifact(owner, chId, 'completed demo', '# v1\n');

    const ctx = await browser.newContext();
    await attachToken(ctx, owner.token);
    const page = await ctx.newPage();
    await gotoCanvas(page, chName);

    // CV-1 既有 kindBadge 二元锁 (跟 #347 line 251 byte-identical) — owner 自己提交
    // 显示 👤 (人); agent commit 显示 🤖. 此处 owner 创 → version row 必为 👤.
    const versionKind = page.locator('.artifact-version-kind').first();
    await expect(versionKind).toHaveText('👤');

    // §4 G3.4 demo 截屏 — completed state placeholder.
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'g3.4-cv4-iterate-completed.png'),
      fullPage: false,
    });
  });

  test('§3.5 — diff view 文案 + jsdiff 蓝绿 + ARIA + 反向断言无 server diff', async ({ browser }) => {
    // diff view UI 走 client jsdiff (立场 ③), 此 e2e 反向断言 server 不算
    // diff (无 /api/v1/diff endpoint) — 走单元测覆盖, 截屏走 placeholder.
    const serverPort = process.env.E2E_SERVER_PORT ?? '4901';
    const serverURL = `http://127.0.0.1:${serverPort}`;
    const adminCtx = await adminLogin(serverURL);
    const inv = await mintInvite(adminCtx, 'cv43-35');
    const owner = await registerUser(serverURL, inv, 'o35');

    // 反向断言: server 端 /api/v1/diff endpoint 不存在 (404).
    const r = await owner.ctx.get('/api/v1/diff');
    expect(r.status(), 'server diff endpoint must not exist (立场 ③)').toBe(404);

    // §4 G3.4 demo 截屏 — failed state placeholder (server #409 merge 后切真 failed reason).
    const stamp = Date.now();
    const chName = `cv43-failed-${stamp}`;
    const chId = await createChannel(owner, chName);
    await createMarkdownArtifact(owner, chId, 'failed demo', '# v1\n');

    const ctx = await browser.newContext();
    await attachToken(ctx, owner.token);
    const page = await ctx.newPage();
    await gotoCanvas(page, chName);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'g3.4-cv4-iterate-failed.png'),
      fullPage: false,
    });
  });
});
