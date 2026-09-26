import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The frontend calls /api/* which is proxied to the backend in dev and rewritten
// via VITE_API_BASE in the container build (see nginx / env).
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
