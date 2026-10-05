import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'probes.spec.mts',
  reporter: 'list',
  outputDir: './runner-output',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    channel: 'chrome',
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: 'node ../test-admin-server.mts',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    timeout: 20000,
  },
});
