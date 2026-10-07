import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { watch: { ignored: ['**/public/data/**', '**/public/artworks/**', '**/public/ships/**'] } },
});
