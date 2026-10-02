import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';
export default defineConfig({
  testDir:'./e2e',outputDir:'../../test-results/business-refinement-20260929',
  workers:2,retries:0,timeout:60000,expect:{timeout:7000},
  use:{baseURL:'http://127.0.0.1:4188',browserName:'chromium',channel:'chrome',viewport:{width:1440,height:950},screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:{command:'node ../test-admin-server.mjs',url:'http://127.0.0.1:4188/business-portal/',reuseExistingServer:false,
    env:{DOJI_ADMIN_TEST_ROOT:resolve(import.meta.dirname,'..'),DOJI_ADMIN_TEST_PORT:'4188'}},
});
