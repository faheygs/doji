import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => ({
  base: mode === 'connected' ? '/react-admin/20261009b/' : '/',
  plugins: [react()],
  // Keep chunk contents independent of the release SHA; HTML still pins the
  // absolute release directory, while deferred assets resolve beside their importer.
  ...(mode === 'connected'
    ? {
        experimental: {
          renderBuiltUrl: (_file: string, { hostType }: { hostType: string }) => ({
            relative: hostType !== 'html',
          }),
        },
      }
    : {}),
  build: {
    sourcemap: false,
    ...(mode === 'connected'
      ? { outDir: 'dist/connected', rolldownOptions: { input: 'connected.html' } }
      : {}),
  },
}));
