import {test,expect} from '../../coverage-fixture.mjs';
import AxeBuilder from '@axe-core/playwright';
// This spec uses a separately prepared public preview via DOJI_ADMIN_TEST_ROOT.
test.skip(!process.env.DOJI_SAFETY_PUBLIC_TEST,'Run against the public safety preview only.');
const endpoint='https://tvixsmqxotuvyjqzmjla.supabase.co/functions/v1/safety-removal';
async function choose(page,label,value){
 const id={Category:'reason',Reason:'detail','Who are you submitting for?':'relationship'}[label];
 const text=await page.locator(`#${id} option[value="${value}"]`).textContent();
 await page.getByRole('combobox',{name:label,exact:true}).click();
 await page.getByRole('option',{name:text,exact:true}).click();
}
async function setup(page){
 await page.route('**/safety-removal/config.js',route=>route.fulfill({contentType:'application/javascript',body:`window.DOJI_SAFETY_CONFIG={enabled:true,endpoint:${JSON.stringify(endpoint)},siteKey:'fixture'};`}));
 await page.route('https://challenges.cloudflare.com/**',route=>route.fulfill({contentType:'application/javascript',body:'const callbacks={};window.turnstile={render:(selector,options)=>{callbacks[selector]=options.callback;options.callback("fixture");return selector;},reset:id=>callbacks[id]?.("fixture-refreshed")};'}));
 await page.goto(process.env.DOJI_SAFETY_PUBLIC_PATH||'/');await choose(page,'Category','sexual_content');await choose(page,'Reason','nonconsensual_intimate_images');await expect(page.getByRole('button',{name:'Submit',exact:true})).toBeEnabled();
}
test('no login or upload; required fields lead to receipt and private status',async({page})=>{
 await setup(page);let sent;
 await page.route(endpoint,route=>{sent=route.request().postDataJSON();return route.fulfill({status:201,json:{id:sent.id,state:'received',message:'Saved for review',received_at:'2026-09-28T12:00:00Z',updated_at:'2026-09-28T12:00:00Z'}});});
 await expect(page.locator('input[type=file]')).toHaveCount(0);
 await page.getByLabel('Your name',{exact:true}).fill('Synthetic requester');await page.getByLabel('Safe contact information').fill('test@test.invalid');
 await page.getByLabel('Where is the content on Doji?').fill('The content is on @fixture profile');await page.getByLabel('Good-faith statement').fill('It was shared without my consent.');await page.getByLabel('Electronic signature',{exact:true}).fill('Synthetic requester');await page.getByRole('checkbox').check();
 await page.getByRole('button',{name:'Submit',exact:true}).click();await expect(page.getByRole('heading',{name:'Request received'})).toBeVisible();expect(sent.secret).toHaveLength(64);expect(sent.request.consent).toBe(true);
 expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([]);expect(page.url()).not.toContain(sent.secret);
 for(const width of [390,1440]){await page.setViewportSize({width,height:1000});const button=await page.locator('#saveReceipt').boundingBox(),row=await page.locator('#receiptSection .safetyActions').boundingBox();expect(Math.abs(button.x+button.width-row.x-row.width)).toBeLessThan(2);}
 const scan=await new AxeBuilder({page}).analyze();expect(scan.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({html:n.html,summary:n.failureSummary}))}))).toEqual([]);
 await page.screenshot({path:'test-results/safety-public-receipt.png'});
});
test('small screen form remains readable and keyboard accessible',async({page})=>{await page.setViewportSize({width:390,height:844});await setup(page);const scan=await new AxeBuilder({page}).analyze();expect(scan.violations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/safety-public-mobile.png'});});

test('desktop form uses the existing light controls and guidance sits beside it',async({page})=>{
 await setup(page);
 const form=await page.locator('#requestSection').boundingBox(),guide=await page.locator('.safetySidebar').boundingBox();
 expect(guide.x).toBeGreaterThan(form.x+form.width);expect(Math.abs(guide.y-form.y)).toBeLessThan(2);
 expect(await page.locator('#requestName').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
 const scan=await new AxeBuilder({page}).analyze();expect(scan.violations).toEqual([]);
 await page.screenshot({path:'test-results/safety-public-desktop.png'});
});

test('Submit stays compact and right-aligned on desktop and phone',async({page})=>{
 await setup(page);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  const button=await page.locator('#submitRequest').boundingBox(),footer=await page.locator('.safetySubmit').boundingBox();
  expect(Math.abs(button.x+button.width-footer.x-footer.width)).toBeLessThan(2);
  expect(button.width).toBeLessThan(160);
 }
});

test('status action is right-aligned with breathing room and redundant upload warnings are absent',async({page})=>{
 await setup(page);
 await expect(page.getByText('Please don’t send images.',{exact:true})).toHaveCount(0);
 await expect(page.getByText('No image uploads',{exact:true})).toHaveCount(0);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  const button=await page.locator('#checkStatus').boundingBox(),row=await page.locator('#statusForm .safetyActions').boundingBox(),input=await page.locator('#statusSecret').boundingBox();
  expect(Math.abs(button.x+button.width-row.x-row.width)).toBeLessThan(2);
  expect(button.y-input.y-input.height).toBeGreaterThanOrEqual(24);
  await page.locator('#statusSection').scrollIntoViewIfNeeded();await page.screenshot({path:`test-results/safety-status-${width}.png`});
 }
});

test('phone navigation keeps status and help accessible',async({page})=>{
 await page.setViewportSize({width:390,height:844});await setup(page);
 for(const name of ['Step 1 of 3 About your request','Step 2 of 3 Identify the content','Step 3 of 3 Sign your request'])await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
 await expect(page.getByRole('navigation').getByRole('link',{name:'Check a request'})).toBeVisible();
 await expect(page.getByRole('navigation').getByRole('link',{name:'Get help'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/safety-public-mobile.png'});
});

test('ambiguous submission preserves data and the same private receipt on retry',async({page})=>{
 await setup(page);const bodies=[];
 await page.route(endpoint,route=>{const body=route.request().postDataJSON();bodies.push(body);return route.fulfill({status:503,json:{message:'Receipt could not be confirmed. Retry unchanged.'}});});
 await page.getByLabel('Your name',{exact:true}).fill('Synthetic requester');await page.getByLabel('Safe contact information').fill('test@test.invalid');
 await page.getByLabel('Where is the content on Doji?').fill('Synthetic profile reference');await page.getByLabel('Good-faith statement').fill('Shared without consent');await page.getByLabel('Electronic signature',{exact:true}).fill('Synthetic requester');await page.getByRole('checkbox').check();
 for(let n=0;n<2;n++){await page.getByRole('button',{name:'Submit',exact:true}).click();await expect(page.locator('#requestFeedback')).toContainText('Retry unchanged');await expect(page.getByLabel('Your name',{exact:true})).toHaveValue('Synthetic requester');}
 expect(bodies).toHaveLength(2);expect(bodies[0].id).toBe(bodies[1].id);expect(bodies[0].secret).toBe(bodies[1].secret);expect(bodies[0].request).toEqual(bodies[1].request);
});

test('status lookup keeps its identity fixed during the request and renders literal safe response',async({page})=>{
 await setup(page);let finish,started=false;const gate=new Promise(resolve=>finish=resolve);
 await page.route(endpoint,async route=>{const body=route.request().postDataJSON();started=true;await gate;return route.fulfill({json:{id:body.id,state:'reviewing',message:'<img src=x onerror=alert(1)>',received_at:'2026-09-28T12:00:00Z',updated_at:'2026-09-28T12:00:00Z'}});});
 await page.getByLabel('Reference',{exact:true}).fill('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');await page.getByLabel('Private status code',{exact:true}).fill('a'.repeat(64));await page.getByRole('button',{name:'Check status',exact:true}).click();
 await expect.poll(()=>started).toBe(true);await expect(page.locator('#statusReference')).toBeDisabled();await expect(page.locator('#statusSecret')).toBeDisabled();finish();
 await expect(page.locator('#statusLabel')).toHaveText('Under review');await expect(page.locator('#statusMessage')).toHaveText('<img src=x onerror=alert(1)>');await expect(page.locator('#statusResult img')).toHaveCount(0);await expect(page.locator('#statusReference')).toBeEnabled();expect(page.url()).not.toContain('aaaaaaaa');
});

test('category changes reset the reason and consent and show only relevant guidance',async({page})=>{
 await setup(page);
 await page.getByRole('checkbox').check();
 await choose(page,'Category','spam_scam');
 await expect(page.locator('#detail')).toHaveValue('');
 await expect(page.getByRole('checkbox')).not.toBeChecked();
 await expect(page.locator('#nciiNotice')).toBeHidden();
 await expect(page.locator('#declarationText')).not.toContainText('person depicted');
 await expect(page.locator('#detail option')).toHaveCount(4);
 await choose(page,'Category','intellectual_property');
 await expect(page.locator('#categoryHelp')).toContainText('formal legal notice');
 await choose(page,'Category','sexual_content');
 await choose(page,'Reason','child_sexual_content');
 await expect(page.locator('#categoryHelp')).toContainText('Do not download');
 await choose(page,'Reason','nonconsensual_intimate_images');
 await expect(page.locator('#nciiNotice')).toBeVisible();
 await choose(page,'Who are you submitting for?','witness');
 await expect(page.locator('#declarationText')).not.toContainText('person depicted');
 await choose(page,'Who are you submitting for?','representative');
 await expect(page.locator('#declarationText')).toContainText('authorized representative');
});

test('disabled preview permits category exploration but never a submission',async({page})=>{
 await page.route('**/safety-removal/config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.DOJI_SAFETY_CONFIG={enabled:false,preview:true,endpoint:"",siteKey:""};'}));
 let requests=0;await page.route(endpoint,()=>{requests++;});
 await page.goto(process.env.DOJI_SAFETY_PUBLIC_PATH||'/');
 await choose(page,'Category','privacy');
 await choose(page,'Reason','doxxing');
 await expect(page.getByRole('button',{name:'Submit',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Check status',exact:true})).toBeDisabled();
 expect(requests).toBe(0);
 await page.setViewportSize({width:1440,height:1100});await page.screenshot({path:'test-results/safety-category-preview.png',fullPage:true});
});

test('shared dropdowns keep keyboard, dependent labels and open-menu accessibility consistent',async({page})=>{
 await setup(page);
 await choose(page,'Category','privacy');
 const reason=page.getByRole('combobox',{name:'Reason',exact:true});
 await expect(reason).toContainText('Choose a reason');
 await reason.focus();await reason.press('End');await reason.press('Enter');
 await expect(reason).toContainText('An image used without permission');
 await expect(page.locator('#detail')).toHaveValue('image_used_without_permission');
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:1000});
  const category=page.getByRole('combobox',{name:'Category',exact:true});
  await category.click();await expect(category).toHaveAttribute('aria-expanded','true');
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/safety-shared-dropdown-${width}.png`});
  await category.press('Escape');await expect(category).toHaveAttribute('aria-expanded','false');await expect(category).toBeFocused();
 }
});
