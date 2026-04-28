// vitest.config.ts — P1 fix for vitest fake-green (REG-RT0-006).
//
// Problem: ws-invitation.test.ts dispatches window CustomEvents but the
// client package had no test environment configured, so vitest defaulted
// to node and `window is not defined` killed 4/6 cases. CI also had no
// vitest job, so the breakage stayed invisible. This config + the new
// ci.yml client-vitest job + the @borgee/client `test` script close the
// loop.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
