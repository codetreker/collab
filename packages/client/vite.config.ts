import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4900',
      '/ws': {
        target: 'ws://localhost:4900',
        ws: true,
      },
      '/uploads': 'http://localhost:4900',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
