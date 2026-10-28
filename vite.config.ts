import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves the app under /<repo>/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  // The notation engine ships as one large WebAssembly chunk, loaded lazily.
  build: { chunkSizeWarningLimit: 9000 },
});
