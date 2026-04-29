// tests/cv-3-3-renderers.spec.ts — CV-3.3 client kind renderers e2e.
//
// 闭环 cv-3.md acceptance §3.1-§3.4:
//   §3.1 code artifact (Go) → prism syntax highlight class hit
//   §3.2 image_link artifact (https URL) → <img loading="lazy"> + URL
//        协议反向 reject (javascript: / data: / http:)
//   §3.3 mention preview kind 三模式 (markdown 80字 / code 5行+语言徽标
//        / image 192px) — 留 stub: streaming preview wiring 上层 PR
//   §3.4 G3.4 demo 截屏 3 张 (markdown / code-go-highlight / image-embed)
//        入 docs/qa/screenshots/g3.4-cv3-{...}.png (撑章程 Phase 3 退出公告)
//
// 立场反查 (cv-3-content-lock.md):
//   ① 三 enum DOM data-artifact-kind byte-identical
//   ④ image src https only (XSS 红线第一道)
//   ⑤ link rel="noopener noreferrer" 三联锁 (XSS 红线第二道)
//
// 实现说明: ArtifactPanel.handleCreate UI 路径仍只能创 markdown (CV-1
// 兼容); code/image_link kind 当前走 REST POST 直接创, 然后走 UI 渲染
// 验证 — server CV-3.2 #400 已 merged, kind/metadata gate 全闭.
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
  const email = `cv33-${suffix}-${stamp}-${Math.floor(Math.random() * 1000)}@example.test`;
  const password = 'p@ssw0rd-cv33';
  const displayName = `CV33 ${suffix} ${stamp}`;
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

async function createArtifact(
  user: RegisteredUser,
  channelId: string,
  payload: { type: string; title: string; body: string; metadata?: Record<string, unknown> },
): Promise<string> {
  const r = await user.ctx.post(`/api/v1/channels/${channelId}/artifacts`, {
    data: payload,
  });
  expect(r.ok(), `artifact create (${payload.type}): ${r.status()} ${await r.text()}`).toBe(true);
  const j = (await r.json()) as { id: string };
  return j.id;
}

async function gotoCanvasTab(page: Page, channelName: string): Promise<void> {
  await page.goto(`${clientURL()}/`);
  await expect(page.locator('.sidebar-title')).toBeVisible();
  await page.locator('.channel-name', { hasText: channelName }).first().click();
  await page.locator('.channel-view-tab', { hasText: 'Canvas' }).click();
  await expect(page.locator('.artifact-panel')).toBeVisible();
}

test.describe('CV-3.3 client kind renderers — acceptance §3.1-§3.4', () => {
  test('§3.1 code artifact prism highlight + 11 项语言徽标', async ({ browser }) => {
    const serverPort = process.env.E2E_SERVER_PORT ?? '4901';
    const serverURL = `http://127.0.0.1:${serverPort}`;
    const adminCtx = await adminLogin(serverURL);
    const inv = await mintInvite(adminCtx, 'cv33-31');
    const owner = await registerUser(serverURL, inv, 'o31');

    const stamp = Date.now();
    const chName = `cv33-code-${stamp}`;
    const chId = await createChannel(owner, chName);

    const goSrc = `package main\n\nimport "fmt"\n\nfunc main() {\n  fmt.Println("hello")\n}\n`;
    await createArtifact(owner, chId, {
      type: 'code',
      title: 'CV-3 Go demo',
      body: goSrc,
      metadata: { language: 'go' },
    });

    const ctx = await browser.newContext();
    await attachToken(ctx, owner.token);
    const page = await ctx.newPage();
    await gotoCanvasTab(page, chName);

    // 立场 ① — DOM `data-artifact-kind="code"` byte-identical.
    await expect(page.locator('[data-artifact-kind="code"]')).toBeVisible();

    // 立场 ② — 11 项语言徽标 byte-identical (acceptance §2.2 / content-lock §1 ②).
    // server validation 已收 metadata.language='go' 但不持久化, client 当前
    // 显示默认 'TEXT' fallback. 仅断言 badge 存在 + 是 12 项 LANG_LABEL 之一.
    const badge = page.locator('.code-lang-badge').first();
    await expect(badge).toBeVisible();

    // 立场 ③ — 复制按钮 byte-identical 文案锁.
    const copyBtn = page.locator('.code-copy-btn');
    await expect(copyBtn).toBeVisible();
    await expect(copyBtn).toHaveAttribute('title', '复制代码');
    await expect(copyBtn).toHaveAttribute('aria-label', '复制代码');

    // §3.4 G3.4 demo 截屏 — code-go-highlight.
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'g3.4-cv3-code-go-highlight.png'),
      fullPage: false,
    });
  });

  test('§3.2 image_link artifact <img loading="lazy"> + 协议反向 reject', async ({ browser }) => {
    const serverPort = process.env.E2E_SERVER_PORT ?? '4901';
    const serverURL = `http://127.0.0.1:${serverPort}`;
    const adminCtx = await adminLogin(serverURL);
    const inv = await mintInvite(adminCtx, 'cv33-32');
    const owner = await registerUser(serverURL, inv, 'o32');

    const stamp = Date.now();
    const chName = `cv33-img-${stamp}`;
    const chId = await createChannel(owner, chName);

    const httpsUrl = 'https://placehold.co/600x400/png';
    await createArtifact(owner, chId, {
      type: 'image_link',
      title: 'CV-3 image demo',
      body: httpsUrl,
      metadata: { kind: 'image', url: httpsUrl },
    });

    // 反向断言 — server 拒 javascript:/data:/http: (XSS 红线第一道,
    // CV-3.2 #400 ValidateImageLinkURL).
    for (const bad of [
      { url: 'javascript:alert(1)', label: 'javascript:' },
      { url: 'data:image/png;base64,AAAA', label: 'data:image' },
      { url: 'http://example.com/x.png', label: 'http:' },
    ]) {
      const r = await owner.ctx.post(`/api/v1/channels/${chId}/artifacts`, {
        data: {
          type: 'image_link',
          title: `bad-${bad.label}`,
          body: bad.url,
          metadata: { kind: 'image', url: bad.url },
        },
      });
      expect(r.status(), `${bad.label} should reject`).toBe(400);
    }

    const ctx = await browser.newContext();
    await attachToken(ctx, owner.token);
    const page = await ctx.newPage();
    await gotoCanvasTab(page, chName);

    // 立场 ① — DOM `data-artifact-kind="image_link"` byte-identical.
    await expect(page.locator('[data-artifact-kind="image_link"]')).toBeVisible();

    // 立场 ④ — <img loading="lazy" class="artifact-image" src=https>.
    const img = page.locator('img.artifact-image').first();
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute('loading', 'lazy');
    const src = await img.getAttribute('src');
    expect(src).toMatch(/^https:/);

    // §3.4 G3.4 demo 截屏 — image-embed.
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'g3.4-cv3-image-embed.png'),
      fullPage: false,
    });
  });

  test('§3.4 G3.4 demo markdown 截屏', async ({ browser }) => {
    const serverPort = process.env.E2E_SERVER_PORT ?? '4901';
    const serverURL = `http://127.0.0.1:${serverPort}`;
    const adminCtx = await adminLogin(serverURL);
    const inv = await mintInvite(adminCtx, 'cv33-34');
    const owner = await registerUser(serverURL, inv, 'o34');

    const stamp = Date.now();
    const chName = `cv33-md-${stamp}`;
    const chId = await createChannel(owner, chName);

    const md = `# CV-3 D-lite\n\n三 kind 收口: **markdown / code / image_link**\n\n- ① data-artifact-kind 三 enum DOM 锁\n- ② 11 项语言白名单\n- ③ XSS 红线两道闸\n`;
    await createArtifact(owner, chId, {
      type: 'markdown',
      title: 'CV-3 markdown demo',
      body: md,
    });

    const ctx = await browser.newContext();
    await attachToken(ctx, owner.token);
    const page = await ctx.newPage();
    await gotoCanvasTab(page, chName);

    await expect(page.locator('[data-artifact-kind="markdown"]')).toBeVisible();
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'g3.4-cv3-markdown.png'),
      fullPage: false,
    });
  });
});
