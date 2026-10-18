import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const settingsFile = new URL('../.env', import.meta.url);
const localEnv = existsSync(settingsFile) ? parseEnv(readFileSync(settingsFile, 'utf8')) : {};
const port = Number(process.env.ADMIN_PORT ?? localEnv.ADMIN_PORT ?? 4310);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('ADMIN_PORT must be a valid port.');

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: { proxy: { '/api': { target: `http://127.0.0.1:${port}`, changeOrigin: false } } },
  build: { sourcemap: false },
});
