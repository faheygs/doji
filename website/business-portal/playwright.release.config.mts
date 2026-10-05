import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
export default defineConfig({
  testDir: './e2e',
  testMatch: ['application.spec.mts', 'access.spec.mts'],
  grepInvert:
    /review uses readonly|review requires explicit|read-only business reviewer|event while reviewing|unchanged review event/,
  workers: 2,
  retries: 0,
  timeout: 30000,
  outputDir: '../../test-results/business-release-20260930/business-browser',
  reporter: [
    ['line'],
    [
      'json',
      { outputFile: '../../test-results/business-release-20260930/business-browser-results.json' },
    ],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4189',
    browserName: 'chromium',
    channel: 'chrome',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node ../test-admin-server.mts',
    url: 'http://127.0.0.1:4189/business-portal/application/',
    reuseExistingServer: false,
    env: {
      DOJI_ADMIN_TEST_ROOT: resolve(
        import.meta.dirname,
        '../../test-results/business-release-20260930/business-site',
      ),
      DOJI_ADMIN_TEST_PORT: '4189',
    },
  },
});
