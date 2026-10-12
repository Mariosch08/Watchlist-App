import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// VITE_BASE is set by the GitHub Pages workflow (e.g. "/Watchlist-App/").
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  test: { environment: 'node', setupFiles: ['./test/setup.js'] },
});
