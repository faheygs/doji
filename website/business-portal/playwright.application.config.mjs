import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
export default defineConfig({
  testDir: './e2e',
  testMatch: ['application.spec.mjs', 'access.spec.mjs'],
  workers: 2,
  retries: 0,
  timeout: 30000,
  outputDir: '../../test-results/business-application-20260929/browser',
  use: {
    baseURL: 'http://127.0.0.1:4189',
    browserName: 'chromium',
    channel: 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node ../test-admin-server.mjs',
    url: 'http://127.0.0.1:4189/business-portal/application/',
    reuseExistingServer: false,
    env: { DOJI_ADMIN_TEST_ROOT: resolve(import.meta.dirname, '..'), DOJI_ADMIN_TEST_PORT: '4189' },
  },
});
