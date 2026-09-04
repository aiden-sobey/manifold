import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const host = process.env.TAURI_DEV_HOST;
// `tauri android dev` proxies the dev server to https://tauri.localhost inside the WebView and
// forwards port 1420 with `adb reverse`. That proxy can't carry the HMR websocket, so point the
// client straight at the forwarded port (ws://localhost is allowed from a secure origin).
const android = process.env.TAURI_ENV_PLATFORM === 'android' && !host;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  // Expose TAURI_ENV_* (platform, arch…) to the frontend; see src/lib/platform.ts.
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: 'ws', host, port: 1421 }
      : android
        ? { protocol: 'ws', host: 'localhost', port: 1420 }
        : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
});
