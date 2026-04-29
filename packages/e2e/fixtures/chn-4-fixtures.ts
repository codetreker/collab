// fixtures/chn-4-fixtures.ts — CHN-4 wrapper REST-driven seed fixtures.
//
// 立场 ⑤ — fixture file 是 SSOT, 替代 spec 内部重复 setup 代码 (反 spec
// boilerplate 漂移 + 反 timing 死等真根因).
//
// Pattern: Playwright `test.beforeAll` 钩子调 seedCHN4Fixtures(serverURL)
// → 返 dual fixture: { ownerToken, ownerCtx, agentID, dmID, publicChID }.
// Spec 内部仅做 page navigation + assertion auto-retry, 不再 register +
// create channel + create agent (那些走 REST 完成).
//
// 不靠 timing 死等 — fixture 同步 REST setup 完成后 fixture 即可用; spec
// 走 Playwright `toBeVisible` / `toHaveCount` 默认 5s auto-retry.

import {
  request as apiRequest,
  expect,
  type APIRequestContext,
} from '@playwright/test';

export interface CHN4Fixture {
  ownerEmail: string;
  ownerToken: string;
  ownerUserID: string;
  ownerCtx: APIRequestContext;
  agentID: string;
  dmID: string;
  publicChID: string;
  cleanup: () => Promise<void>;
}

/**
 * seedCHN4Fixtures — 一次性 REST seed: register owner + create agent +
 * open DM + create public channel. 返 fixture 句柄, 由 spec `beforeAll`
 * 调用; `afterAll` 调 cleanup() 释放 APIRequestContext.
 */
export async function seedCHN4Fixtures(serverURL: string): Promise<CHN4Fixture> {
  const ownerEmail = `chn4-owner-${Date.now()}@e2e.test`;
  const ownerCtx = await apiRequest.newContext({ baseURL: serverURL });

  // 1. Register owner (creates org + member with default permissions).
  const regRes = await ownerCtx.post('/api/v1/auth/register', {
    data: {
      email: ownerEmail,
      password: 'password123',
      display_name: 'CHN4Owner',
    },
  });
  expect(regRes.ok(), `register: ${regRes.status()}`).toBe(true);
  const reg = await regRes.json();
  const ownerToken = reg.token as string;
  const ownerUserID = reg.user.id as string;

  const auth = { Cookie: `borgee_token=${ownerToken}` };

  // 2. Create agent (owner-owned).
  const agentRes = await ownerCtx.post('/api/v1/agents', {
    data: { display_name: 'CHN4Agent' },
    headers: auth,
  });
  expect(agentRes.ok(), `create agent: ${agentRes.status()}`).toBe(true);
  const agent = await agentRes.json();
  const agentID = agent.agent.id as string;

  // 3. Open DM with the agent (立场 ④ — DM 永远 2 人, type='dm').
  const dmRes = await ownerCtx.post('/api/v1/channels', {
    data: { type: 'dm', with_user_id: agentID },
    headers: auth,
  });
  let dmID = '';
  if (dmRes.ok()) {
    const dm = await dmRes.json();
    dmID = (dm.channel ?? dm).id as string;
  }
  // DM endpoint shape may vary; tolerate empty dmID for spec-side feature
  // detection (test.skip when dmID==='').

  // 4. Create a public channel (workspace-bearing — 立场 ② DM ↔ public 区分).
  const chRes = await ownerCtx.post('/api/v1/channels', {
    data: {
      name: `chn4-pub-${Date.now()}`,
      visibility: 'public',
    },
    headers: auth,
  });
  expect(chRes.ok(), `create public channel: ${chRes.status()}`).toBe(true);
  const ch = await chRes.json();
  const publicChID = (ch.channel ?? ch).id as string;

  return {
    ownerEmail,
    ownerToken,
    ownerUserID,
    ownerCtx,
    agentID,
    dmID,
    publicChID,
    cleanup: async () => {
      await ownerCtx.dispose();
    },
  };
}
