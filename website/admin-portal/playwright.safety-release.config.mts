import type { PlaywrightTestConfig } from '@playwright/test';
import { singleServer } from '../config-server.mts';
import base from './playwright.config.mts';
export default {
  ...base,
  use: { ...base.use, baseURL: 'http://127.0.0.1:4186' },
  webServer: {
    ...singleServer(base),
    command: 'node ../test-admin-server.mts',
    url: 'http://127.0.0.1:4186/',
    reuseExistingServer: false,
    env: {
      DOJI_ADMIN_TEST_PORT: '4186',
      DOJI_ADMIN_TEST_ROOT: '../../test-results/safety-portal-ui-20260929-v3/site',
    },
  },
} satisfies PlaywrightTestConfig;
