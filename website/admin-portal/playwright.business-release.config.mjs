import base from './playwright.privacy.config.mjs';
export default {
 ...base,
 reporter: [['list'],['json',{outputFile:'../../test-results/business-release-20260930/admin-browser-results.json'}]],
 outputDir:'../../test-results/business-release-20260930/admin-browser',
 webServer:{...base.webServer,env:{DOJI_ADMIN_TEST_PORT:'4190',DOJI_ADMIN_TEST_ROOT:'../../test-results/business-release-20260930/admin-site'}},
};
