import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Three entry points: popup, dashboard, and the background service worker.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: 'popup.html',
        dashboard: 'dashboard.html',
        background: 'src/background.ts',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});