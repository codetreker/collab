// tests/smoke.spec.ts — INFRA-2 smoke test.
//
// **Goal of this PR (INFRA-2)**: prove the two-server harness works in CI.
// We do NOT exercise auth or product features here — that's RT-0 / CM-onboarding's
// job once they land their fixtures. A smoke test that fails would fail
// for *infrastructure* reasons (port conflict, server crash, vite proxy
// misconfig), so it has to stay tight.
//
// Three assertions:
//   1. server-go health endpoint responds 200 (proves Go binary booted).
//   2. client SPA root serves an HTML doc with the Borgee title (proves
//      vite started + serves index.html).
//   3. The vite dev proxy actually forwards /health to server-go (proves
//      the proxy override env var works end-to-end). This is the one
//      that will save RT-0 from spending hours debugging "why does my
//      ws connection 404".
import { test, expect } from '@playwright/test';

test.describe('INFRA-2 smoke', () => {
  test('server-go /health returns ok', async ({ request }) => {
    // server-go was booted on E2E_SERVER_PORT (4901) by playwright.config.
    // We hit it directly (not via proxy) to isolate "is the server up?"
    // from "is the proxy working?".
    const port = process.env.E2E_SERVER_PORT ?? '4901';
    const res = await request.get(`http://127.0.0.1:${port}/health`);
    expect(res.ok()).toBe(true);
  });

  test('client SPA root serves index.html', async ({ page }) => {
    // baseURL = client url (5174) per playwright.config.
    await page.goto('/');
    await expect(page).toHaveTitle(/Borgee/);
  });

  test('vite dev proxy forwards /health to server-go', async ({ request }) => {
    // Hit the *client* port so the request goes through vite's proxy.
    // If VITE_E2E_API_TARGET wiring is wrong, vite proxies to localhost:4900
    // (the dev default), which is either nothing in CI (502) or a stale
    // dev binary on a developer's machine (would still 200 but for the
    // wrong reason — that's why we'd want a marker, but for the smoke
    // test 200 is enough).
    const clientPort = process.env.E2E_CLIENT_PORT ?? '5174';
    const res = await request.get(`http://127.0.0.1:${clientPort}/health`);
    expect(res.ok()).toBe(true);
  });
});
