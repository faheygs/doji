import type { PlaywrightTestConfig } from '@playwright/test';
import { singleServer } from '../config-server.mts';
import base from './playwright.config.mts';
export default {
  ...base,
  testMatch: [
    'business-applications.spec.mjs',
    'auth.spec.mts',
    'employee-cutover.spec.mts',
    'editorial.spec.mts',
    'safety-removal.spec.mts',
  ],
  outputDir: '../../test-results/business-admin-20260929/browser',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4190' },
  webServer: {
    ...singleServer(base),
    url: 'http://127.0.0.1:4190/',
    reuseExistingServer: false,
    env: { DOJI_ADMIN_TEST_PORT: '4190', DOJI_ADMIN_TEST_ROOT: '../.business-admin-qa-20260929' },
  },
} satisfies PlaywrightTestConfig;
