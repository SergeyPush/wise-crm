import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Фронт ходит по относительному /api/v1 — на проде тот же origin,
    // локально прокси избавляет от CORS и от разницы в поведении cookie
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
