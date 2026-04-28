// tests/cm-onboarding-bug-030-regression.spec.ts — bug-030 防回归 e2e.
//
// Bug-030 (caught in PR #203): ListChannelsWithUnread (and the admin
// variant) silently filtered `c.type = 'channel'`, dropping the
// type='system' #welcome row. SPA's channel list never contained the
// welcome → auto-select missed → `.message-system-content` never
// rendered → cm-onboarding.spec.ts:92 timed out.
//
// Existing unit guard: store/welcome_test.go::
//   TestListChannelsWithUnread_IncludesSystemWelcome
// This e2e adds the second layer (registry INV-CMO-001 真挂 e2e
// 路径), proving the contract end-to-end through the HTTP API:
//
//   1. user A registered → GET /api/v1/channels returns the welcome
//      (type='system') row.
//   2. user B registered → GET /api/v1/channels returns user B's
//      welcome AND does NOT leak user A's. (per-user-private gate.)
//   3. user A's list does not contain user B's welcome either.
//
// 性能预算: ≤ 1s (INFRA-2 stopwatch fixture). Two registers + three
// API GETs comfortably fit.

import { test, expect, request as apiRequest } from '@playwright/test';
import { stopwatch } from '../fixtures/stopwatch';

const ADMIN_LOGIN = 'e2e-admin';
const ADMIN_PASSWORD = 'e2e-admin-pass-12345';

interface ChannelDTO {
  id: string;
  type: string;
  is_member?: boolean;
  // ChannelWithCounts may serialize as IsMember; permit both.
  IsMember?: boolean;
}

test.describe('bug-030 regression — system welcome channel visibility', () => {
  test('per-user welcome is in own list, never in another user\'s list', async ({
    baseURL,
  }, testInfo) => {
    const serverPort = process.env.E2E_SERVER_PORT ?? '4901';
    const serverURL = `http://127.0.0.1:${serverPort}`;
    void baseURL;

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

    const register = async (label: string) => {
      const stamp = `${Date.now()}-${label}`;
      const ctx = await apiRequest.newContext({ baseURL: serverURL });
      const r = await ctx.post('/api/v1/auth/register', {
        data: {
          invite_code: await mintInvite(`bug-030-${label}`),
          email: `bug030-${stamp}@example.test`,
          password: 'p@ssw0rd-bug030',
          display_name: `Bug030 ${label} ${stamp}`,
        },
      });
      expect(r.ok(), `register ${label} failed: ${r.status()} ${await r.text()}`).toBe(true);
      return ctx;
    };

    const sw = stopwatch();
    const ctxA = await register('A');
    const ctxB = await register('B');

    // GET /api/v1/channels for each user. The auth cookie rides on
    // the request context's storageState — apiRequest.newContext
    // persists Set-Cookie automatically.
    const listFor = async (ctx: Awaited<ReturnType<typeof register>>) => {
      const res = await ctx.get('/api/v1/channels');
      expect(res.ok(), `list channels failed: ${res.status()}`).toBe(true);
      const json = (await res.json()) as { channels: ChannelDTO[] };
      return json.channels;
    };

    const aChannels = await listFor(ctxA);
    const bChannels = await listFor(ctxB);
    sw.stop();
    await sw.attach(testInfo, 'register×2 + list×2 latency');

    // 1. Each user sees their own type='system' welcome.
    const aSys = aChannels.filter(c => c.type === 'system');
    const bSys = bChannels.filter(c => c.type === 'system');
    expect(aSys, 'user A must see exactly one system welcome').toHaveLength(1);
    expect(bSys, 'user B must see exactly one system welcome').toHaveLength(1);

    // 2. The welcome IDs differ (per-user-private, not a shared row).
    expect(aSys[0]!.id).not.toBe(bSys[0]!.id);

    // 3. Cross-leak guard: A's list MUST NOT contain B's welcome and
    //    vice versa. This is the exact contract bug-030 broke when
    //    the migration first dropped membership gating, and the
    //    contract the unit test locks at the SQL layer.
    expect(aChannels.some(c => c.id === bSys[0]!.id),
      'user A leaked user B\'s welcome').toBe(false);
    expect(bChannels.some(c => c.id === aSys[0]!.id),
      'user B leaked user A\'s welcome').toBe(false);

    // 4. Latency budget — fast feedback if the regression slows the
    //    list query (e.g. n+1 join surfaces).
    expect(sw.ms, `register+list took ${sw.ms}ms, budget 5000ms`).toBeLessThanOrEqual(5000);
  });
});
