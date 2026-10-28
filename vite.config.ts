import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // The notation engine ships as one large WebAssembly chunk, loaded lazily.
  build: { chunkSizeWarningLimit: 9000 },
});
