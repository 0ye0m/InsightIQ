import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// InsightIQ — Vite configuration
// Frontend-only build. Service credentials are read from .env at build time
// via import.meta.env.VITE_* (see .env.example).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
});
