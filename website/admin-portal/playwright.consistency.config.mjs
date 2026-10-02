import base from './playwright.config.mjs';
export default {...base,use:{...base.use,baseURL:'http://127.0.0.1:4187'},webServer:{...base.webServer,url:'http://127.0.0.1:4187/',reuseExistingServer:false,env:{DOJI_ADMIN_TEST_PORT:'4187',DOJI_ADMIN_TEST_ROOT:'../../test-results/portal-consistency-20260929/site'}}};
