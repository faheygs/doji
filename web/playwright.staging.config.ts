import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: ['admin-staging.spec.ts', 'admin-development.spec.ts'],
  workers: 1,
  outputDir: process.env.DOJI_STAGING_TEST_OUTPUT ?? './test-results/admin-staging',
  use: { browserName: 'chromium', trace: 'off' },
});
