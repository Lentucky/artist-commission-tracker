import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // dev only: forwards /api to Spring so the browser sees one origin and the backend needs no CORS config
  server: { proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: true } } },
});