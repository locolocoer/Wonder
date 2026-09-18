import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the built renderer can be loaded from file:// inside Electron.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist-renderer',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 4096,
  },
  worker: {
    format: 'es',
  },
});
