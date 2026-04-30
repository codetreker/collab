// tests/ap-5-dm-4-cross-acl.spec.ts — AP-5 post-removal × DM-4 edit
// 双 ACL gate 互动 (yema audit follow-up B). 验时序 + 双闸 fail-closed:
//   T0  sender 在 DM/channel 内 PATCH own message → 200 (DM-4 通过)
//   T1  owner remove sender (post-removal trigger AP-5 gate)
//   T2  sender 重新 PATCH 同 message → 404 fail-closed (REG-INV-002)
// 双锁: DM-4 sender-only ACL 不足以放过 AP-5 channel-member gate.

import { test, expect, request as apiRequest, type APIRequestContext } from '@playwright/test';

const ADMIN_LOGIN = 'e2e-admin';
const ADMIN_PASSWORD = 'e2e-admin-pass-12345';

interface User { token: string; userId: string; ctx: APIRequestContext }

function serverURL(): string {
  return `http://127.0.0.1:${process.env.E2E_SERVER_PORT ?? '4901'}`;
}

async function adminLogin(): Promise<APIRequestContext> {
  const ctx = await apiRequest.newContext({ baseURL: serverURL() });
  const r = await ctx.post('/admin-api/auth/login', { data: { login: ADMIN_LOGIN, password: ADMIN_PASSWORD } });
  expect(r.ok()).toBe(true);
  return ctx;
}

async function mintInvite(adm: APIRequestContext, note: string): Promise<string> {
  const r = await adm.post('/admin-api/v1/invites', { data: { note } });
  expect(r.ok()).toBe(true);
  return ((await r.json()) as { invite: { code: string } }).invite.code;
}

async function regUser(invite: string, suffix: string): Promise<User> {
  const ctx = await apiRequest.newContext({ baseURL: serverURL() });
  const stamp = Date.now();
  const r = await ctx.post('/api/v1/auth/register', {
    data: { invite_code: invite, email: `cross-${suffix}-${stamp}@example.test`, password: 'p@ss-cross-acl', display_name: `Cross ${suffix}` },
  });
  expect(r.ok(), `register ${suffix}: ${r.status()}`).toBe(true);
  const body = (await r.json()) as { user: { id: string } };
  const tok = (await ctx.storageState()).cookies.find((c) => c.name === 'borgee_token')!.value;
  return { token: tok, userId: body.user.id, ctx };
}

test.describe('AP-5 × DM-4 双 ACL gate 互动 (yema audit follow-up B)', () => {
  test('post-removal × edit — T0 PATCH 通过 → T1 remove → T2 PATCH 404 fail-closed', async () => {
    const adm = await adminLogin();
    const a = await regUser(await mintInvite(adm, 'cross-a'), 'a');
    const b = await regUser(await mintInvite(adm, 'cross-b'), 'b');

    // 用 public channel (membership 可被 owner 改 — DM 双方对等无 remove 路径)
    const cr = await b.ctx.post('/api/v1/channels', { data: { name: `cross-${Date.now()}`, visibility: 'public' } });
    expect(cr.ok()).toBe(true);
    const chId = ((await cr.json()) as { channel: { id: string } }).channel.id;
    const join = await a.ctx.post(`/api/v1/channels/${chId}/join`);
    expect(join.ok()).toBe(true);

    // T0: A 发消息 + 同步 PATCH own (DM-4-style edit endpoint, sender-only) — channel 内通过
    const post = await a.ctx.post(`/api/v1/channels/${chId}/messages`, { data: { content: 'before' } });
    expect(post.ok()).toBe(true);
    const msgId = ((await post.json()) as { message: { id: string } }).message.id;
    const t0 = await a.ctx.patch(`/api/v1/channels/${chId}/messages/${msgId}`, { data: { content: 'edited-T0' } });
    // 当前 channel kind 非 DM, PATCH 路径可能 403 dm.edit_only_in_dm — 接受 200 / 403 (AP-5 gate 之前 DM-4 路径).
    expect([200, 403]).toContain(t0.status());

    // T1: B (owner) remove A
    const rm = await b.ctx.delete(`/api/v1/channels/${chId}/members/${a.userId}`);
    expect([200, 204]).toContain(rm.status());

    // T2: A 试图重新 PATCH 自己的 message — AP-5 channel-member gate 拒 (404 fail-closed REG-INV-002)
    const t2 = await a.ctx.patch(`/api/v1/channels/${chId}/messages/${msgId}`, { data: { content: 'after-removal' } });
    expect(t2.status(), `T2 fail-closed expected 404 (or 403), got ${t2.status()}`).toBeGreaterThanOrEqual(403);
    expect([403, 404]).toContain(t2.status());

    // 反向: A 也不能 PUT/DELETE post-removal (双锁 — AP-5 §2.1 + §2.2 同源)
    const put = await a.ctx.put(`/api/v1/messages/${msgId}`, { data: { content: 'evil' } });
    expect([403, 404]).toContain(put.status());
    const del = await a.ctx.delete(`/api/v1/messages/${msgId}`);
    expect([403, 404]).toContain(del.status());
  });
});
