import { must } from "../../test-contracts.mts";
import { test, expect } from '../../coverage-fixture.mts';
import AxeBuilder from '@axe-core/playwright';
import { installMockBackend, seedAdminSession, operatorSession } from './fixtures.mts';
import type {Page} from '@playwright/test';
import type {MockOptions} from './fixtures.mts';
import {present,record} from '../../test-values.mts';
const id='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const details={legal_name:'Example LLC',brand_name:'Synthetic business',website:'https://example.test',country:'US',business_address:'123 Example Street',representative_name:'Example Owner',representative_role:'Owner',category:'Technology',purpose:'A future campaign'};
const base={id,state:'pending',revision:2,details,latest_submission:{submission:1,details,terms_version:'test-terms',privacy_version:'test-privacy'},history:[]};
async function setup(page:Page, options:{enabled?:boolean;session?:MockOptions['session'];wrongId?:boolean;staleCommand?:boolean;failCommand?:boolean}={}) {
  await installMockBackend(page,{employeeMode:true,businessMode:options.enabled!==false,session:options.session||operatorSession});
  await seedAdminSession(page,true);
  let item=structuredClone(base);
  const calls:{path:string;body:Record<string,unknown>;headers:Record<string,string>}[]=[];
  await page.route('**/rest/v1/rpc/*business*',async route=>{
    const path=new URL(route.request().url()).pathname,body=record(route.request().postDataJSON());
    calls.push({path,body,headers:route.request().headers()});
    if(path.endsWith('get_admin_business_applications_page_v1'))return route.fulfill({json:{items:[{id,brand_name:details.brand_name,state:item.state}],next_cursor:null}});
    if(path.endsWith('get_admin_business_application_v1'))return route.fulfill({json:options.wrongId?{...item,id:'different'}:item});
    if(path.endsWith('admin_business_application_command_v1')){
      if(options.staleCommand)return route.fulfill({status:409,json:{code:'PT409',message:'Application changed; reload first'}});
      if(options.failCommand)return route.fulfill({status:503,json:{message:'Decision could not be confirmed.'}});
      item={...item,state:'approved',revision:item.revision+1};return route.fulfill({json:{application:item}});
    }
    throw Error(`Unexpected fixture ${path}`);
  });
  await page.goto('/'); await expect(page.locator('#portalApp')).toBeVisible();
  return {calls,change:(patch:Partial<typeof base>)=>Object.assign(item,patch)};
}
test('flag off makes no business RPC and never shows prototype data',async({page})=>{
  const {calls}=await setup(page,{enabled:false});await page.locator('[data-view="businesses"]').click();
  await expect(page.locator('#businessAdminGrid').getByText('Business verification is not available yet.')).toBeVisible();expect(calls).toHaveLength(0);
  await expect(page.getByText('Lumen Coffee',{exact:true})).toHaveCount(0);
});
test('queue reads are lazy, bounded, employee-scoped and right drawer uses actual submitted fields',async({page})=>{
  const {calls}=await setup(page);expect(calls).toHaveLength(0);
  await page.locator('[data-view="businesses"]').click();await page.locator(`[data-application-id="${id}"]`).click();
  const drawer=page.locator('dialog[open]');await expect(drawer.getByLabel('Legal business name')).toHaveValue('Example LLC');
  expect(present(calls[0]).body).toEqual({p_state:'pending',p_limit:25,p_after_at:null,p_after_id:null});
  expect(present(calls[0]).headers.authorization).toContain('Bearer ');expect(present(calls[0]).headers.apikey).toBeTruthy();
  await expect(drawer).toHaveClass(/portalDrawer/);
  expect((await new AxeBuilder({page}).include('dialog[open]').analyze()).violations).toEqual([]);
});
test('decision requires confirmation and reuses exact receipt key after ambiguous failure',async({page})=>{
  const {calls}=await setup(page,{failCommand:true});await page.locator('[data-view="businesses"]').click();await page.locator('[data-application-id]').click();
  const drawer=page.locator('dialog[open]');await drawer.getByRole('combobox',{name:'Decision',exact:true}).click();await drawer.getByRole('option',{name:'Approve',exact:true}).click();
  await drawer.getByLabel('Response to applicant').fill('Your organization is approved.');await drawer.getByLabel('Internal review rationale').fill('Reviewed the synthetic submitted details.');
  await drawer.getByRole('button',{name:'Review decision',exact:true}).click();
  expect(calls.filter(c=>c.path.endsWith('command_v1'))).toHaveLength(0);
  for(let i=0;i<2;i++){await drawer.getByRole('button',{name:'Confirm',exact:true}).click();await expect(drawer.locator('[role=status]')).toContainText('could not be confirmed');}
  const commands=calls.filter(c=>c.path.endsWith('command_v1'));
  expect(commands).toHaveLength(2);expect(present(commands[0]).body.p_id).toBe(id);expect(present(commands[0]).body.p_revision).toBe(2);expect(present(commands[0]).body.p_request_id).toBe(present(commands[1]).body.p_request_id);
});
test('business reviewer is read-only',async({page})=>{
  await setup(page,{session:{...operatorSession,roles:['business_reviewer'],capabilities:{business_read:true}}});
  await page.locator('[data-view="businesses"]').click();await page.locator('[data-application-id]').click();await expect(page.locator('#businessReviewForm')).toBeHidden();
});

test('HTTP conflict preserves review notes and blocks repeated stale confirmation', async ({page}) => {
  const {calls}=await setup(page,{staleCommand:true});
  await page.locator('[data-view="businesses"]').click();
  await page.locator('[data-application-id]').click();
  const drawer=page.locator('dialog[open]');
  await drawer.getByRole('combobox',{name:'Decision',exact:true}).click();
  await drawer.getByRole('option',{name:'Approve',exact:true}).click();
  await drawer.getByLabel('Response to applicant').fill('Your organization is approved.');
  await drawer.getByLabel('Internal review rationale').fill('Preserve my review notes.');
  await drawer.getByRole('button',{name:'Review decision',exact:true}).click();
  await drawer.getByRole('button',{name:'Confirm',exact:true}).click();
  await expect(drawer.locator('[role=status]')).toContainText('Close and reopen');
  await expect(drawer.getByLabel('Internal review rationale')).toHaveValue('Preserve my review notes.');
  await expect(drawer.getByRole('button',{name:'Confirm',exact:true})).toBeDisabled();
  expect(calls.filter(c=>c.path.endsWith('command_v1'))).toHaveLength(1);
});

test('missing business capability hides navigation and makes no business read',async({page})=>{
  const {calls}=await setup(page,{session:{...operatorSession,roles:['moderator'],capabilities:{moderation_read:true}}});
  await expect(page.locator('[data-view="businesses"]')).toBeHidden();expect(calls).toHaveLength(0);
});

test('foreground reconciliation preserves notes and prevents a stale decision',async({page})=>{
  const {calls,change}=await setup(page);await page.locator('[data-view="businesses"]').click();await page.locator('[data-application-id]').click();
  const drawer=page.locator('dialog[open]');
  await drawer.getByRole('combobox',{name:'Decision',exact:true}).click();await drawer.getByRole('option',{name:'Approve',exact:true}).click();
  await drawer.getByLabel('Response to applicant').fill('A considered applicant response.');await drawer.getByLabel('Internal review rationale').fill('Preserve these internal review notes.');
  const before=calls.filter(c=>c.path.endsWith('get_admin_business_application_v1')).length;
  change({revision:3});await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect(drawer.locator('[role=status]')).toContainText('This case changed');
  expect(calls.filter(c=>c.path.endsWith('get_admin_business_application_v1')).length).toBeGreaterThan(before);
  await expect(drawer.getByLabel('Internal review rationale')).toHaveValue('Preserve these internal review notes.');
  await drawer.getByRole('button',{name:'Review decision',exact:true}).click();
  await expect(drawer.locator('#businessReviewConfirm')).toBeHidden();expect(calls.filter(c=>c.path.endsWith('command_v1'))).toHaveLength(0);
});

test('overlapping queue refreshes coalesce and a failed read has an explicit retry',async({page})=>{
  await setup(page);await page.locator('[data-view="businesses"]').click();await expect(page.locator('[data-application-id]')).toBeVisible();
  let release!:()=>void,reads=0;const gate=new Promise<void>(r=>{release=r;});
  await page.route('**/rest/v1/rpc/get_admin_business_applications_page_v1',async route=>{reads++;if(reads===1)await gate;await route.fulfill({status:503,json:{message:'Queue unavailable'}});});
  const refresh=page.getByRole('button',{name:'Refresh applications',exact:true});await refresh.click();await expect.poll(()=>reads).toBe(1);
  await refresh.click();await refresh.click();expect(reads).toBe(1);release();
  await expect(page.getByRole('button',{name:'Retry applications',exact:true})).toBeVisible();await expect.poll(()=>reads).toBe(2);
  await expect(page.locator('[data-application-id]')).toHaveCount(0);
});
test('mismatched exact record fails closed',async({page})=>{
  await setup(page,{wrongId:true});await page.locator('[data-view="businesses"]').click();await page.locator('[data-application-id]').click();
  await expect(page.locator('dialog[open] [role=status]')).toContainText('identity could not be verified');await expect(page.locator('#businessReviewForm')).toHaveCount(0);
});
test('locking the existing portal clears business evidence and late detail cannot repaint',async({page})=>{
  await setup(page);await page.locator('[data-view="businesses"]').click();
  let release!:()=>void,started=false;const gate=new Promise<void>(r=>{release=r;});
  await page.route('**/rest/v1/rpc/get_admin_business_application_v1',async route=>{started=true;await gate;await route.fulfill({json:base}).catch(()=>{});});
  await page.locator('[data-application-id]').click();await expect.poll(()=>started).toBe(true);
  await page.getByRole('button',{name:'Lock session',exact:true}).evaluate(b=>{if(!(b instanceof HTMLElement))throw Error('Expected lock button');b.click();});release();
  await expect(page.locator('#portalApp')).toBeHidden();await expect(page.locator('#businessAdminGrid')).toBeEmpty();await expect(page.getByText('Example LLC',{exact:true})).toHaveCount(0);
});

for (const theme of ['light','dark']) for (const width of [390,1440]) {
  test(`business review reuses accessible theme and drawer at ${width}px ${theme}`,async({page},testInfo)=>{
    await page.setViewportSize({width,height:1000});
    await setup(page);await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);
    if(width<600)await page.locator('#mobileMenu').click();
    await page.locator('[data-view="businesses"]').click();await page.locator('[data-application-id]').click();
    const drawer=page.locator('dialog[open]');await expect(drawer.getByLabel('Legal business name')).toHaveValue('Example LLC');
    const bounds=present(must(await drawer.boundingBox()));expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width+1);
    expect(await drawer.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
    expect((await new AxeBuilder({page}).include('dialog[open]').analyze()).violations).toEqual([]);
    await page.screenshot({path:testInfo.outputPath(`business-review-${theme}-${width}.png`)});
  });
}
