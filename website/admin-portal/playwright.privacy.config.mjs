import base from './playwright.business.config.mjs';
export default {
  ...base,
  testMatch: [
    'business-privacy.spec.mjs',
    'business-applications.spec.mjs',
    'auth.spec.mjs',
    'employee-cutover.spec.mjs',
    'editorial.spec.mjs',
    'safety-removal.spec.mjs',
  ],
  outputDir: '../../test-results/business-privacy-20260930/browser',
  webServer: {
    ...base.webServer,
    env: { DOJI_ADMIN_TEST_PORT: '4190', DOJI_ADMIN_TEST_ROOT: '../.business-admin-qa-20260930' },
  },
};
