import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const base = process.env.DOJI_BUSINESS_ASSET_BASE || '/';
if (base !== '/' && !/^\/react-business\/[a-z0-9-]+\/$/.test(base))
  throw Error('Invalid business asset namespace');
export default defineConfig({
  base,
  plugins: [react()],
  // Protect even early dev-module requests, before the HTML meta is parsed.
  server: { headers: { 'Referrer-Policy': 'no-referrer' } },
  preview: { headers: { 'Referrer-Policy': 'no-referrer' } },
  build: { sourcemap: false },
});
