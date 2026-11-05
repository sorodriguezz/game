import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

const proxy: Record<string, ProxyOptions> = {
  '/api': {
    target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000',
    changeOrigin: false,
  },
  // Servidor táctico (Colyseus): matchmaking HTTP + WebSocket bajo el mismo origen (sin CORS).
  // En producción lo hace el proxy TLS (Caddy) hacia battle-server:2567 (ADR-0031).
  '/battle': {
    target: process.env.BATTLE_PROXY_TARGET ?? 'http://127.0.0.1:2567',
    ws: true,
    changeOrigin: false,
    rewrite: (path) => path.replace(/^\/battle/, ''),
  },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy },
  preview: { port: 4173, proxy },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 2500,
  },
});
