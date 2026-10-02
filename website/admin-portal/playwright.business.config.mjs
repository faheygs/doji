import base from './playwright.config.mjs';
export default {
  ...base, testMatch: ['business-applications.spec.mjs', 'auth.spec.mjs', 'employee-cutover.spec.mjs', 'editorial.spec.mjs', 'safety-removal.spec.mjs'],
  outputDir: '../../test-results/business-admin-20260929/browser',
  use: {...base.use, baseURL: 'http://127.0.0.1:4190'},
  webServer: {...base.webServer,url:'http://127.0.0.1:4190/',reuseExistingServer:false,
    env:{DOJI_ADMIN_TEST_PORT:'4190',DOJI_ADMIN_TEST_ROOT:'../.business-admin-qa-20260929'}},
};
