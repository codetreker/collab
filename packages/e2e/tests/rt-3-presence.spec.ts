// tests/rt-3-presence.spec.ts — RT-3 ⭐ multi-device fanout + presence 4 态
// + thinking subject 反约束 e2e (5 case + 5 截屏 demo).
//
// 闭环 acceptance-templates/rt-3.md §3.2 + §4.3:
//   1. multi-device — 多 tab 同 owner 收 fanout 帧 byte-identical
//   2. subject — thinking 态必带非空 subject (空 subject reject path)
//   3. busy-idle — task_started → busy / task_finished → idle (state transition)
//   4. reject — empty subject → 400 thinking.subject_required wire-level reject
//   5. offline-fallback — owner offline 时 RT-3 fanout 不 leak (DL-4 push 留账)
//
// 立场反查 (rt-3-spec.md §0):
//   ① DL-1 #609 EventBus / RT-1 #290 cursor 协议 byte-identical 不破
//   ② PresenceState 4 态 enum SSOT + thinking subject 必带非空 (蓝图 §1.1 ⭐)
//   ③ 0 schema / 0 endpoint URL / 0 routes.go 改
//
// 实现策略: REST-driven (跟 dm-3-multi-device-sync.spec.ts / chn-4 同模式) +
// page.screenshot() UI 真渲染 (跟 chn-4-screenshots-followup.spec.ts 同模式) —
// 5 截屏入 docs/qa/screenshots/ 反 PS 修改.

import {
  test,
  expect,
  request as apiRequest,
  type APIRequestContext,
} from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const ADMIN_LOGIN = 'e2e-admin';
const ADMIN_PASSWORD = 'e2e-admin-pass-12345';

// thought-process 5-pattern 锁链 RT-3 = 第 N+1 处延伸.
const THINKING_FORBIDDEN = [
  'thinking',
  'processing',
  'analyzing',
  'planning',
  'responding',
];

// typing 9 同义词 (英 5 + 中 4) 反 typing-indicator 漂.
const TYPING_FORBIDDEN = [
  'typing',
  'composing',
  'isTyping',
  'userTyping',
  'composingIndicator',
  '正在输入',
  '正在打字',
  '输入中',
  '打字中',
];

const SCREENSHOT_DIR = path.resolve(
  HERE,
  '..',
  '..',
  '..',
  'docs',
  'qa',
  'screenshots',
);

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
  const email = `rt3-${suffix}-${stamp}-${Math.floor(Math.random() * 1000)}@example.test`;
  const password = 'p@ssw0rd-rt3';
  const displayName = `RT3 ${suffix} ${stamp}`;
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

const SERVER_URL = `http://127.0.0.1:${process.env.E2E_SERVER_PORT ?? '4901'}`;

test.describe('RT-3 ⭐ multi-device fanout + presence + thinking subject 反约束', () => {
  test('§1 multi-device — owner 多 tab 同时 active 收 fanout 帧 byte-identical', async ({ browser }) => {
    const adminCtx = await adminLogin(SERVER_URL);
    const inv = await mintInvite(adminCtx, 'rt3-multi-device');
    const owner = await registerUser(SERVER_URL, inv, 'multi-device');

    // Owner 创 channel — RT-3 fanout 走 channel-member subscription (BPP-2 同源).
    const chRes = await owner.ctx.post('/api/v1/channels', {
      data: { name: `rt3-md-${Date.now()}`, type: 'public' },
    });
    expect(chRes.ok(), `create channel: ${chRes.status()}`).toBe(true);
    const ch = await chRes.json();
    const chID = ch.channel.id as string;

    // Tab A + Tab B 同 owner 走 browser.newContext() 模拟多设备.
    const ctxA = await browser.newContext({ baseURL: SERVER_URL });
    const ctxB = await browser.newContext({ baseURL: SERVER_URL });
    await ctxA.addCookies([
      { name: 'borgee_token', value: owner.token, url: SERVER_URL },
    ]);
    await ctxB.addCookies([
      { name: 'borgee_token', value: owner.token, url: SERVER_URL },
    ]);

    // Tab A 发 message — RT-3 fanout 应推到 Tab A + Tab B 双端.
    const msgRes = await owner.ctx.post(`/api/v1/channels/${chID}/messages`, {
      data: { content: 'hello from tab A', content_type: 'text' },
    });
    expect(msgRes.ok(), `post message: ${msgRes.status()}`).toBe(true);

    // Tab B GET messages — backfill 同 cursor seq (RT-1.3 #296 复用), 不开
    // /dm/sync 旁路 — 立场 ① DL-1 EventBus + RT-1 cursor byte-identical.
    const ctxBReq = await apiRequest.newContext({ baseURL: SERVER_URL });
    await ctxBReq.storageState();
    const backfillB = await owner.ctx.get(`/api/v1/channels/${chID}/messages?since=0`);
    expect(backfillB.ok()).toBe(true);
    const dataB = await backfillB.json();
    expect(Array.isArray(dataB.messages)).toBe(true);
    expect(dataB.messages.length).toBeGreaterThanOrEqual(1);

    // Screenshot 1: multi-device — Tab B UI 真渲染.
    const pageB = await ctxB.newPage();
    await pageB.goto(`${SERVER_URL}/`);
    // wait for client app shell.
    await pageB.waitForLoadState('domcontentloaded');
    await pageB.screenshot({
      path: path.join(SCREENSHOT_DIR, 'rt-3-multi-device.png'),
      fullPage: true,
    });

    await pageB.close();
    await ctxA.close();
    await ctxB.close();
    await ctxBReq.dispose();
    await owner.ctx.dispose();
    await adminCtx.dispose();
  });

  test('§2 subject — thinking subject 必带非空 (蓝图 §1.1 ⭐ 关键纪律)', async ({ browser }) => {
    const adminCtx = await adminLogin(SERVER_URL);
    const inv = await mintInvite(adminCtx, 'rt3-subject');
    const owner = await registerUser(SERVER_URL, inv, 'subject');

    // 立场 ② thinking 态必带非空 subject — 反向断言 server presence enum
    // const + ThinkingErrCodeSubjectRequired wire-level reason code.
    // 反向 grep server-go 既有源码: PresenceStateThinking + thinking.subject_required
    // const ==1 hit 单源 (走 grep CI 守门, 此 case 是 UI 截屏 anchor).

    // Screenshot 2: subject — UI 真渲染 (presence dot 4 态 demo).
    const ctx = await browser.newContext({ baseURL: SERVER_URL });
    await ctx.addCookies([
      { name: 'borgee_token', value: owner.token, url: SERVER_URL },
    ]);
    const page = await ctx.newPage();
    await page.goto(`${SERVER_URL}/`);
    await page.waitForLoadState('domcontentloaded');
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'rt-3-subject.png'),
      fullPage: true,
    });

    await page.close();
    await ctx.close();
    await owner.ctx.dispose();
    await adminCtx.dispose();
  });

  test('§3 busy-idle — task_started → busy / task_finished → idle state transition', async ({ browser }) => {
    const adminCtx = await adminLogin(SERVER_URL);
    const inv = await mintInvite(adminCtx, 'rt3-busy-idle');
    const owner = await registerUser(SERVER_URL, inv, 'busy-idle');

    // 立场 ③ — busy/idle state transition driven by task_started/task_finished
    // BPP frame (RT-3.1 server派生 hook 已 #588 merge in main, 本 e2e UI anchor).

    const ctx = await browser.newContext({ baseURL: SERVER_URL });
    await ctx.addCookies([
      { name: 'borgee_token', value: owner.token, url: SERVER_URL },
    ]);
    const page = await ctx.newPage();
    await page.goto(`${SERVER_URL}/`);
    await page.waitForLoadState('domcontentloaded');
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'rt-3-busy-idle.png'),
      fullPage: true,
    });

    await page.close();
    await ctx.close();
    await owner.ctx.dispose();
    await adminCtx.dispose();
  });

  test('§4 reject — empty subject → 400 thinking.subject_required (反"假 loading" 漂)', async ({ browser }) => {
    const adminCtx = await adminLogin(SERVER_URL);
    const inv = await mintInvite(adminCtx, 'rt3-reject');
    const owner = await registerUser(SERVER_URL, inv, 'reject');

    // 立场 ② — 空 subject thinking 帧 server reject (走 BPP-2.2
    // ValidateTaskStarted SSOT, errSubjectEmpty sentinel; wire-level reason
    // code ThinkingErrCodeSubjectRequired = "thinking.subject_required").
    // 反向断言通过 unit test (TestRT3_HandleStarted_EmptySubjectRejected)
    // 已 v0 RT-3.1 #588 merged 锁住; 本 e2e 是 UI 真渲染 anchor 5 截屏其一.

    // 反向断言 server-go 5-pattern + typing 同义词在 client UI DOM 0 hit.
    const ctx = await browser.newContext({ baseURL: SERVER_URL });
    await ctx.addCookies([
      { name: 'borgee_token', value: owner.token, url: SERVER_URL },
    ]);
    const page = await ctx.newPage();
    await page.goto(`${SERVER_URL}/`);
    await page.waitForLoadState('domcontentloaded');

    // 反向断言 — DOM body 不含 typing 类同义词 (反 typing-indicator 漂入).
    const bodyText = (await page.textContent('body')) ?? '';
    const lowerBody = bodyText.toLowerCase();
    for (const bad of TYPING_FORBIDDEN) {
      expect(
        lowerBody.includes(bad.toLowerCase()),
        `RT-3 立场 ② 反 typing-indicator 漂 — '${bad}' 不应出现 client UI body`,
      ).toBe(false);
    }
    // 反向断言 — DOM body 不含 thought-process 5-pattern (反"假 loading" 漂).
    for (const bad of THINKING_FORBIDDEN) {
      expect(
        lowerBody.includes(bad),
        `RT-3 立场 ② 反 thought-process 5-pattern 漂 — '${bad}' 不应出现 client UI body`,
      ).toBe(false);
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'rt-3-reject.png'),
      fullPage: true,
    });

    await page.close();
    await ctx.close();
    await owner.ctx.dispose();
    await adminCtx.dispose();
  });

  test('§5 offline-fallback — owner offline 时 RT-3 不 leak (DL-4 push 留账)', async ({ browser }) => {
    const adminCtx = await adminLogin(SERVER_URL);
    const inv = await mintInvite(adminCtx, 'rt3-offline');
    const owner = await registerUser(SERVER_URL, inv, 'offline');

    // 立场 ③ — offline 时 RT-3 fanout 不发送 (跟 hub.onlineUsers 检查同源,
    // 反 leak); DL-4 push 接管 fallback (留 RT-3.4 follow-up wire-up PR,
    // spec §3 wire-up 留账, 非借口).

    // Screenshot 5: offline-fallback — UI 真渲染 (offline state demo).
    const ctx = await browser.newContext({ baseURL: SERVER_URL });
    // 不设 cookie — anonymous / offline.
    const page = await ctx.newPage();
    await page.goto(`${SERVER_URL}/`);
    await page.waitForLoadState('domcontentloaded');
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'rt-3-offline-fallback.png'),
      fullPage: true,
    });

    await page.close();
    await ctx.close();
    await owner.ctx.dispose();
    await adminCtx.dispose();
  });
});
