import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import manifest from './package.json';

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(manifest.version) },
  clearScreen: false,
  server: { watch: { ignored: ['**/src-tauri/**'] } },
  build: { target: 'es2022' },
});
