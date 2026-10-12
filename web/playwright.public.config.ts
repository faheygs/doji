import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'public-migration.spec.ts',
  outputDir: './test-results/public-migration',
  use: {
    browserName: 'chromium',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 1000 },
  },
});
