import type { PlaywrightTestConfig } from '@playwright/test';
import { singleServer } from '../config-server.mts';
import base from './playwright.business.config.mts';
export default {
  ...base,
  testMatch: [
    'business-privacy.spec.mts',
    'business-applications.spec.mjs',
    'auth.spec.mts',
    'employee-cutover.spec.mts',
    'editorial.spec.mts',
    'safety-removal.spec.mts',
  ],
  outputDir: '../../test-results/business-privacy-20260930/browser',
  webServer: {
    ...singleServer(base),
    env: { DOJI_ADMIN_TEST_PORT: '4190', DOJI_ADMIN_TEST_ROOT: '../.business-admin-qa-20260930' },
  },
} satisfies PlaywrightTestConfig;
