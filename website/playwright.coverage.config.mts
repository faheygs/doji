import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
process.env.DOJI_BROWSER_COVERAGE = '1';
process.env.DOJI_SAFETY_PUBLIC_TEST = '1';
process.env.DOJI_SAFETY_PUBLIC_PATH = '/safety-removal/';
const publicRoot = resolve(import.meta.dirname, '../test-results/coverage/current/public-site');
const server = (port: number, root: string) => ({
  command: 'node test-admin-server.mts',
  url: `http://127.0.0.1:${port}/styles.css`,
  reuseExistingServer: false,
  timeout: 30000,
  env: { DOJI_ADMIN_TEST_ROOT: root, DOJI_ADMIN_TEST_PORT: String(port) },
});
export default defineConfig({
  workers: 2,
  retries: 0,
  forbidOnly: true,
  timeout: 30000,
  reporter: [
    ['list'],
    ['json', { outputFile: '../test-results/coverage/current/browser-tests.json' }],
  ],
  outputDir: '../test-results/coverage/current/browser-artifacts',
  use: {
    browserName: 'chromium',
    channel: process.env.DOJI_TEST_BROWSER_CHANNEL || undefined,
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block',
    // Mocks fulfill provider requests. Unmocked public hosts cannot resolve.
    launchOptions: {
      args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'],
    },
  },
  webServer: [
    server(4211, resolve(import.meta.dirname, '.business-admin-qa-20261002')),
    server(4212, publicRoot),
  ],
  projects: [
    {
      name: 'admin-legacy-contracts',
      testDir: './admin-portal/e2e',
      testIgnore: ['safety-public*.spec.{mjs,mts}'],
      use: { baseURL: 'http://127.0.0.1:4211' },
    },
    {
      name: 'business',
      testDir: './business-portal/e2e',
      testIgnore: ['independent-*.spec.mts'],
      use: { baseURL: 'http://127.0.0.1:4212' },
    },
    {
      name: 'business-independent',
      testDir: './business-portal/e2e',
      testMatch: 'independent-*.spec.mts',
      use: { baseURL: 'https://business.dojipro.com' },
    },
    {
      name: 'safety-public',
      testDir: './admin-portal/e2e',
      testMatch: 'safety-public*.spec.{mjs,mts}',
      use: { baseURL: 'http://127.0.0.1:4212' },
    },
  ],
});
