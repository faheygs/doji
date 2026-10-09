import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => ({
  base: mode === 'connected' ? '/react-admin/20261009b/' : '/',
  plugins: [react()],
  build: {
    sourcemap: false,
    ...(mode === 'connected'
      ? { outDir: 'dist/connected', rolldownOptions: { input: 'connected.html' } }
      : {}),
  },
}));
