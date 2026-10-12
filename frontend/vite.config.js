import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// VITE_BASE is set by the GitHub Pages workflow (e.g. "/Watchlist-App/").
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  // Shared pure logic lives in supabase/functions/_shared (used by Deno and the browser).
  server: { fs: { allow: ['..'] } },
  test: { environment: 'node', setupFiles: ['./test/setup.js'] },
});
