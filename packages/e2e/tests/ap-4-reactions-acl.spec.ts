// tests/ap-4-reactions-acl.spec.ts — AP-4.2 e2e: reactions ACL gate (CV-7
// #535 gap fix). Pins fail-closed REG-INV-002 boundary for cross-channel
// non-member access on PUT/DELETE/GET reactions endpoints.

import { test, expect, request as apiRequest, type APIRequestContext } from '@playwright/test';

const ADMIN_LOGIN = 'e2e-admin';
const ADMIN_PASSWORD = 'e2e-admin-pass-12345';

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
  expect(res.ok()).toBe(true);
  return ctx;
}

async function mintInvite(adminCtx: APIRequestContext, note: string): Promise<string> {
  const res = await adminCtx.post('/admin-api/v1/invites', { data: { note } });
  expect(res.ok()).toBe(true);
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
  const email = `ap4-${suffix}-${stamp}-${Math.floor(Math.random() * 10000)}@example.test`;
  const password = 'p@ssw0rd-ap4';
  const res = await ctx.post('/api/v1/auth/register', {
    data: { invite_code: inviteCode, email, password, display_name: `AP4 ${suffix} ${stamp}` },
  });
  expect(res.ok(), `register: ${res.status()} ${await res.text()}`).toBe(true);
  const body = (await res.json()) as { user: { id: string } };
  const cookies = await ctx.storageState();
  const tok = cookies.cookies.find((c) => c.name === 'borgee_token');
  return { email, token: tok!.value, userId: body.user.id, ctx };
}

async function createPrivateChannel(user: RegisteredUser, name: string): Promise<string> {
  const r = await user.ctx.post('/api/v1/channels', {
    data: { name, visibility: 'private' },
  });
  expect(r.ok()).toBe(true);
  const j = (await r.json()) as { channel: { id: string } };
  return j.channel.id;
}

async function postMessage(user: RegisteredUser, channelId: string, content: string): Promise<string> {
  const r = await user.ctx.post(`/api/v1/channels/${channelId}/messages`, { data: { content } });
  expect(r.ok()).toBe(true);
  const j = (await r.json()) as { message: { id: string } };
  return j.message.id;
}

function serverURL(): string {
  return `http://127.0.0.1:${process.env.E2E_SERVER_PORT ?? '4901'}`;
}

test.describe('AP-4 reactions ACL e2e — CV-7 gap closed', () => {
  test('non-member PUT /messages/:id/reactions → 404 fail-closed', async () => {
    const adminCtx = await adminLogin(serverURL());
    const ownerInv = await mintInvite(adminCtx, 'ap4-put-owner');
    const owner = await registerUser(serverURL(), ownerInv, 'put-owner');
    const otherInv = await mintInvite(adminCtx, 'ap4-put-other');
    const other = await registerUser(serverURL(), otherInv, 'put-other');

    const chId = await createPrivateChannel(owner, `ap4-put-${Date.now()}`);
    const msgId = await postMessage(owner, chId, 'react to me');

    const r = await other.ctx.put(`/api/v1/messages/${msgId}/reactions`, { data: { emoji: '👍' } });
    expect(r.status()).toBe(404);
  });

  test('non-member DELETE /messages/:id/reactions → 404 fail-closed', async () => {
    const adminCtx = await adminLogin(serverURL());
    const ownerInv = await mintInvite(adminCtx, 'ap4-del-owner');
    const owner = await registerUser(serverURL(), ownerInv, 'del-owner');
    const otherInv = await mintInvite(adminCtx, 'ap4-del-other');
    const other = await registerUser(serverURL(), otherInv, 'del-other');

    const chId = await createPrivateChannel(owner, `ap4-del-${Date.now()}`);
    const msgId = await postMessage(owner, chId, 'will not let you delete');
    // Owner reacts so there's something to delete.
    await owner.ctx.put(`/api/v1/messages/${msgId}/reactions`, { data: { emoji: '👍' } });

    const r = await other.ctx.delete(`/api/v1/messages/${msgId}/reactions`, { data: { emoji: '👍' } });
    expect(r.status()).toBe(404);

    // Sanity: owner's reaction is still there (defense in depth).
    const g = await owner.ctx.get(`/api/v1/messages/${msgId}/reactions`);
    expect(g.ok()).toBe(true);
    const j = (await g.json()) as { reactions: Array<{ count: number }> };
    expect(j.reactions[0]?.count).toBe(1);
  });

  test('non-member GET /messages/:id/reactions → 404 fail-closed', async () => {
    const adminCtx = await adminLogin(serverURL());
    const ownerInv = await mintInvite(adminCtx, 'ap4-get-owner');
    const owner = await registerUser(serverURL(), ownerInv, 'get-owner');
    const otherInv = await mintInvite(adminCtx, 'ap4-get-other');
    const other = await registerUser(serverURL(), otherInv, 'get-other');

    const chId = await createPrivateChannel(owner, `ap4-get-${Date.now()}`);
    const msgId = await postMessage(owner, chId, 'private msg');

    const r = await other.ctx.get(`/api/v1/messages/${msgId}/reactions`);
    expect(r.status()).toBe(404);
  });
});
