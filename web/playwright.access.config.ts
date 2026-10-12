import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'business-access-design.spec.ts',
  outputDir: './test-results/business-access',
  use: { browserName: 'chromium', baseURL: 'http://127.0.0.1:4314', trace: 'retain-on-failure' },
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js apps/business --host 127.0.0.1 --port 4314 --strictPort',
    url: 'http://127.0.0.1:4314',
    reuseExistingServer: false,
  },
});
