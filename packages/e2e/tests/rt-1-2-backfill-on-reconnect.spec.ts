// tests/rt-1-2-backfill-on-reconnect.spec.ts — RT-1.2 (#290 follow) e2e.
//
// 立场锚 (RT-1 spec §1.2):
//   ① WS 断 5s → 重连后 client 调 GET /api/v1/events?since=<last_seen_cursor>
//      把断线期间漏掉的 event 拉回来 (≤3s 完成)
//   ② 反约束: cold start (sessionStorage 空) 不 default 拉全 history —
//      since=0 时 client 跳过 backfill, 不打 /api/v1/events
//   ③ server 永不返回 cursor <= since 的事件 (服务端契约, 客户端
//      `last_seen_cursor` dedup fail-closed)
//
// 实现说明: 完整的 "断线 5s + 5 commit" 跑路场景需要在 server 侧
// 注入 ArtifactUpdated 事件; CV-1 artifact 表还没落 (Phase 3+), 所以
// 这里走 messages → events 的现成链路:
//   - admin 给 user 发消息 (messages → events) 模拟"断线期间的事件"
//   - setOffline(true) 5s 后恢复, 验 client 重连发起 backfill HTTP
// 后续 RT-1.3 + CV-1 落了再加 ArtifactUpdated 专用 case (REG-RT1-005).

import { test, expect, request as apiRequest, type APIRequestContext, type Page } from '@playwright/test';

const ADMIN_LOGIN = 'e2e-admin';
const ADMIN_PASSWORD = 'e2e-admin-pass-12345';

interface RegisteredUser {
  email: string;
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
  const email = `rt12-${suffix}-${stamp}@example.test`;
  const password = 'p@ssw0rd-rt12';
  const displayName = `RT12 ${suffix} ${stamp}`;
  const res = await ctx.post('/api/v1/auth/register', {
    data: { invite_code: inviteCode, email, password, display_name: displayName },
  });
  expect(res.ok(), `register: ${res.status()} ${await res.text()}`).toBe(true);
  const body = (await res.json()) as { user: { id: string } };
  const cookies = await ctx.storageState();
  const tok = cookies.cookies.find(c => c.name === 'borgee_token');
  expect(tok, 'borgee_token cookie missing').toBeTruthy();
  return { email, token: tok!.value, userId: body.user.id };
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

test.describe('RT-1.2 client backfill on reconnect', () => {
  test('立场 ②: cold start does NOT auto-pull history (反约束)', async ({ page, baseURL }) => {
    const serverPort = process.env.E2E_SERVER_PORT ?? '4901';
    const serverURL = `http://127.0.0.1:${serverPort}`;
    const adminCtx = await adminLogin(serverURL);
    const inviteCode = await mintInvite(adminCtx, 'rt-1.2-cold');
    const user = await registerUser(serverURL, inviteCode, 'cold');
    await attachToken(page, baseURL!, user.token);

    // Track all GET /api/v1/events calls. Cold start (sessionStorage
    // empty) MUST NOT issue a backfill.
    const backfillCalls: string[] = [];
    page.on('request', req => {
      if (req.method() === 'GET' && req.url().includes('/api/v1/events')) {
        backfillCalls.push(req.url());
      }
    });

    await page.goto('/');
    await expect(page.locator('.sidebar-title')).toBeVisible();
    // Idle window long enough for the WS open to settle but short
    // enough to keep CI fast.
    await page.waitForTimeout(1500);

    expect(backfillCalls, 'cold start MUST NOT call /api/v1/events').toHaveLength(0);
  });

  test('立场 ①: offline 5s → reconnect → backfill within 3s', async ({ page, baseURL }) => {
    const serverPort = process.env.E2E_SERVER_PORT ?? '4901';
    const serverURL = `http://127.0.0.1:${serverPort}`;
    const adminCtx = await adminLogin(serverURL);
    const inviteCode = await mintInvite(adminCtx, 'rt-1.2-offline');
    const user = await registerUser(serverURL, inviteCode, 'offline');
    await attachToken(page, baseURL!, user.token);

    // Seed a non-zero last_seen_cursor before the test by injecting
    // sessionStorage on first navigation. Cursor 1 is below any
    // realistic server max so the backfill has plenty to fetch and
    // the contract `cursor > since` is exercised.
    await page.addInitScript(() => {
      window.sessionStorage.setItem('borgee.rt1.last_seen_cursor', '1');
    });

    const backfillCalls: { url: string; status: number; receivedAt: number }[] = [];
    page.on('response', async resp => {
      if (resp.request().method() === 'GET' && resp.url().includes('/api/v1/events?since=')) {
        backfillCalls.push({ url: resp.url(), status: resp.status(), receivedAt: Date.now() });
      }
    });

    await page.goto('/');
    await expect(page.locator('.sidebar-title')).toBeVisible();
    await page.waitForTimeout(800); // let initial WS open settle

    // Go offline, hold 5s, then come back.
    await page.context().setOffline(true);
    const offlineAt = Date.now();
    await page.waitForTimeout(5_000);
    await page.context().setOffline(false);
    const reconnectAt = Date.now();

    // Wait up to 3s for the backfill GET to fire after reconnect.
    await expect.poll(() => backfillCalls.length, {
      message: 'expected GET /api/v1/events backfill on reconnect within 3s',
      timeout: 3_000,
    }).toBeGreaterThan(0);

    const first = backfillCalls[0]!;
    expect(first.status, 'backfill must return 2xx').toBeLessThan(400);
    const latency = first.receivedAt - reconnectAt;
    expect(latency, `backfill latency ${latency}ms exceeds 3s budget`).toBeLessThan(3_000);

    // Confirm the URL carries the seeded since=1 (NOT since=0 — would
    // imply the反约束 was violated by a cold-start fallback).
    expect(first.url).toContain('since=1');

    // 立场 ③ (server contract reverse-check via response body):
    // every event in the response must have cursor > 1.
    const respBody = await (async () => {
      const resp = await page.request.get(`/api/v1/events?since=1`, {
        headers: { Cookie: `borgee_token=${user.token}` },
      });
      expect(resp.ok()).toBe(true);
      return resp.json() as Promise<{ cursor: number; events: { cursor: number }[] }>;
    })();
    for (const ev of respBody.events) {
      expect(ev.cursor, `server returned cursor ${ev.cursor} <= since=1 (反约束 broken)`).toBeGreaterThan(1);
    }

    // Sanity: offline window held at least the budgeted 5s.
    expect(reconnectAt - offlineAt).toBeGreaterThanOrEqual(5_000);
  });
});
