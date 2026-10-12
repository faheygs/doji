import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'business-portal-migration.spec.ts',
  outputDir: './test-results/business-migration',
  use: { browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: process.env.DOJI_BUSINESS_PACKAGE
    ? []
    : {
        command:
          'node node_modules/vite/bin/vite.js apps/business --host 127.0.0.1 --port 4313 --strictPort',
        url: 'http://127.0.0.1:4313',
        reuseExistingServer: false,
      },
});
