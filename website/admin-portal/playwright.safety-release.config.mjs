import base from './playwright.config.mjs';
export default {...base,use:{...base.use,baseURL:'http://127.0.0.1:4186'},webServer:{...base.webServer,command:'node ../test-admin-server.mjs',url:'http://127.0.0.1:4186/',reuseExistingServer:false,env:{DOJI_ADMIN_TEST_PORT:'4186',DOJI_ADMIN_TEST_ROOT:'../../test-results/safety-portal-ui-20260929-v3/site'}}};
