import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  // These suites use isolated production-origin fixtures and their own package configs.
  testIgnore: [
    'admin-staging.spec.ts',
    'admin-development.spec.ts',
    'business-portal-migration.spec.ts',
    'public-migration.spec.ts',
    'business-access-design.spec.ts',
  ],
  outputDir: './test-results',
  use: { browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npm run dev:admin', url: 'http://127.0.0.1:4310', reuseExistingServer: false },
    { command: 'npm run dev:business', url: 'http://127.0.0.1:4311', reuseExistingServer: false },
    {
      command: 'npm run dev:site',
      url: 'http://127.0.0.1:4312',
      reuseExistingServer: false,
      env: { NEXT_TELEMETRY_DISABLED: '1' },
    },
  ],
});
