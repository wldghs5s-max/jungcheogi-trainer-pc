import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8765',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq) => {
            const token = String(
              process.env.VITE_LOCAL_API_TOKEN || process.env.LOCAL_API_TOKEN || '',
            ).trim();
            if (token && !proxyReq.getHeader('x-local-token')) {
              proxyReq.setHeader('x-local-token', token);
            }
          });
        },
      },
    },
  },
});
