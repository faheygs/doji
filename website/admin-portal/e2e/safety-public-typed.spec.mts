import {test,expect} from '../../coverage-fixture.mts';
import type {Page} from '@playwright/test';
test.skip(!process.env.DOJI_SAFETY_PUBLIC_TEST,'Requires isolated public artifact');
const endpoint='https://tvixsmqxotuvyjqzmjla.supabase.co/functions/v1/safety-removal';
async function setup(page: Page, sdk=true) {
  await page.route('**/safety-removal/config.js',route=>route.fulfill({contentType:'application/javascript',body:`window.DOJI_SAFETY_CONFIG=${JSON.stringify({enabled:true,endpoint,siteKey:'synthetic'})}`}));
  await page.route('https://challenges.cloudflare.com/**',route=>route.fulfill({contentType:'application/javascript',body:sdk?`window.turnstile={render: (selector, options)=>{options.callback('synthetic');return selector;},reset(){}}`:'// Synthetic provider script without API'}));
  await page.goto('/safety-removal/');
}
async function status(page: Page) {
  await page.locator('#statusReference').fill('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  await page.locator('#statusSecret').fill('a'.repeat(64));
  await page.locator('#checkStatus').click();
}
test('loaded script without provider API leaves intake closed',async({page})=>{
  await setup(page,false);
  await expect(page.locator('#availability')).toContainText('security check is unavailable');
  await expect(page.locator('#submitRequest')).toBeDisabled();
  await expect(page.locator('#checkStatus')).toBeDisabled();
});
for(const response of [null,'unexpected',{state:3},{state:'received',received_at:123}]) {
  test(`malformed receipt cannot display a confirmed result: ${JSON.stringify(response)}`,async({page})=>{
    await page.route(endpoint,route=>route.fulfill({contentType:'application/json',body:JSON.stringify(response && typeof response==='object'?{id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',...response}:response)}));
    await setup(page);
    await status(page);
    await expect(page.locator('#statusFeedback')).toContainText('Receipt could not be verified');
    await expect(page.locator('#statusResult')).toBeHidden();
    await expect(page.locator('#checkStatus')).toBeEnabled();
  });
}
test('non-Error transport rejection remains visible without a false success',async({page})=>{
  await page.addInitScript((url)=>{const previous=window.fetch;window.fetch=async(...args)=>{if(String(args[0])===url)throw 'Synthetic failure';return previous(...args);};},endpoint);
  await setup(page);
  await status(page);
  await expect(page.locator('#statusFeedback')).toHaveText('Synthetic failure');
  await expect(page.locator('#statusResult')).toBeHidden();
});
