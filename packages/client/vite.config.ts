import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_E2E_API_TARGET lets the E2E harness (packages/e2e) point this
// dev server's proxy at a non-default server-go port (4901). Default
// stays 4900 so existing dev workflow is untouched. INFRA-2 (#39).
const apiTarget = process.env.VITE_E2E_API_TARGET ?? 'http://localhost:4900';
const wsTarget = apiTarget.replace(/^http/, 'ws');

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': apiTarget,
      '/admin-api': apiTarget,
      '/health': apiTarget,
      '/ws': {
        target: wsTarget,
        ws: true,
      },
      '/uploads': apiTarget,
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        admin: 'admin.html',
      },
    },
  },
});
