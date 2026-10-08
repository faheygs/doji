import { defineConfig } from '@playwright/test';
// All requests are fulfilled locally by fixtures; no live portal or server.
export default defineConfig({
  testDir: './e2e',
  globalSetup: '../../scripts/prepare-staff-workflow-browser.mts',
  testMatch: 'workflow-*.spec.mts',
  retries: 0,
  workers: 2,
  timeout: 30000,
  reporter: 'list',
  outputDir: '../../test-results/staff-workflow/browser',
  use: {
    browserName: 'chromium',
    channel: 'chrome',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
    launchOptions: {
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'],
    },
  },
});
