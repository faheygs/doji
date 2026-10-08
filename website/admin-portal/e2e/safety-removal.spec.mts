import {installInvalidationStub} from '../../test-contracts.mts';
import { must } from "../../test-contracts.mts";
import type { Page } from "@playwright/test";
import {test,expect} from '../../coverage-fixture.mts';
import AxeBuilder from '@axe-core/playwright';
import {installMockBackend,seedAdminSession,operatorSession,reportCase,reportId} from './fixtures.mts';
import type {MockOptions} from './fixtures.mts';
interface SafetyCommand {p_command_id: string; p_input: Record<string, unknown>}
interface SafetyOptions extends MockOptions {
 target?: Partial<typeof target>; item?: Record<string,unknown>;
 getCase?:()=>Record<string,unknown>; onCommand?:(body:SafetyCommand)=>void;
 fail?:boolean; offPage?:boolean; view?:string;
}
const id='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const targetId='bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const target={case_id:id,id:targetId,kind:'post',owner_id:'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee',username:'fixture',fingerprint:'a'.repeat(64),detail:{text:'Synthetic caption',state:'visible',photo_ref:'private/reference.jpg'}};
const item={queue:'restricted_safety',classification:{reason_label:'Nudity or sexual activity',detail_label:'Intimate images shared without consent',targets:['post','comment','poll_response','profile_photo','account']},id,received_at:'2026-09-20T10:00:00Z',deadline_at:'2026-09-22T10:00:00Z',updated_at:'2026-09-20T10:00:00Z',revision:1,state:'received',can_write:true,assigned_to:operatorSession.user_id,alert_state:'pending',public_message:'Received',request:{name:'Synthetic requester',contact:'test@test.invalid',relationship:'depicted',reason:'sexual_content',detail:'nonconsensual_intimate_images',location:'<img src=x onerror=alert(1)>',statement:'Shared without consent',signature:'Synthetic'},history:[]};
async function setup(page: Page,options:SafetyOptions={}){
 await installMockBackend(page,{employeeMode:true,safetyRemovalMode:true,...options});await seedAdminSession(page,true);const commands:SafetyCommand[]=[];
 await installInvalidationStub(page, 'safetyInvalidate');
 await page.route('**/rest/v1/rpc/*safety*',async route=>{const url=route.request().url();const data=route.request().postDataJSON();
  if(url.includes('get_admin_safety_target'))return route.fulfill({json:{...target,...options.target}});
  if(url.includes('command')||url.includes('admin_create_safety_report')){commands.push(data);options.onCommand?.(data);return route.fulfill({status:options.fail?503:200,json:options.fail?{message:'Save could not be confirmed.'}:{id,revision:2,outcome:'saved'}});}
  const value={...item,...options.item,...options.getCase?.()};
  return route.fulfill({json:url.includes('removals')?{items:options.offPage?[]:[{...value,id:item.id}],next_cursor:null}:value});
 });
 await page.goto('/');if(must(page.viewportSize()).width<800)await page.locator('#mobileMenu').click();await page.locator(`.portalNav [data-view="${options.view||'safety'}"]`).click();await expect(page.getByRole('heading',{name:'External removal requests'})).toBeVisible();return commands;
}
test('restricted intake uses real fields in a full record page, not JSON or embedded URLs',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();const dialog=page.locator('dialog[open]');await expect(dialog).toHaveClass(/portalDrawer/);
 await expect(dialog.getByLabel('Original content location')).toHaveValue(item.request.location);await expect(dialog.locator('img')).toHaveCount(0);await expect(dialog.getByText('Overdue',{exact:false}).first()).toBeVisible();
 const scan=await new AxeBuilder({page}).include('dialog[open]').analyze();expect(scan.violations).toEqual([]);
 await dialog.getByRole('button',{name:'Back to queue',exact:true}).click();await expect(dialog).toHaveCount(0);
});

test('record Back and browser Back preserve the filtered queue without extra reads or writes',async({page})=>{
 const commands=await setup(page);await page.getByRole('button',{name:'Show closed',exact:true}).click();
 const queue=page.locator('[data-portal-view="safety"]');
 await expect(queue.getByRole('button',{name:'Show open',exact:true})).toBeVisible();
 let reads=0;page.on('request',r=>{if(r.url().includes('get_admin_safety_removals_'))reads++;});
 for(const back of ['button','browser']) {
  const opener=queue.getByRole('button',{name:'AAAAAAAA',exact:true});await opener.click();
  const record=page.locator('.adminRecordPage');await expect(record.getByLabel('Assignee',{exact:true})).toHaveValue('Assigned to you');
  await expect(queue).toBeHidden();
  if(back==='button')await record.getByRole('button',{name:'Back to queue',exact:true}).click();else await page.goBack();
  await expect(queue).toBeVisible();await expect(queue.getByRole('button',{name:'Show open',exact:true})).toBeVisible();await expect(opener).toBeFocused();
 }
 expect(reads).toBe(0);expect(commands).toHaveLength(0);
});

test('sidebar navigation closes the record and late responses cannot restore it',async({page})=>{
 const commands=await setup(page);await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();
 await expect(page.locator('.adminRecordPage')).toBeVisible();
 await page.locator('.portalNav [data-view="overview"]').click();
 await expect(page.locator('.recordPageActive')).toHaveCount(0);await expect(page.locator('dialog[open]')).toHaveCount(0);
 expect(commands).toHaveLength(0);
});
for (const [title,assignedTo,expected] of [
 ['self',operatorSession.user_id,'Assigned to you'],
 ['unassigned',null,'Unassigned'],
 ['another employee','dddddddd-bbbb-4ccc-8ddd-eeeeeeeeeeee','Employee dddddddd-bbbb-4ccc-8ddd-eeeeeeeeeeee'],
 ['missing ownership',undefined,'Unavailable'],
] as const) test(`record displays read-only assignee: ${title}`,async({page})=>{
 const commands=await setup(page,{item:{assigned_to:assignedTo}});
 await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();
 const field=page.locator('dialog[open]').getByLabel('Assignee',{exact:true});
 await expect(field).toBeVisible();await expect(field).toHaveValue(expected);
 await expect(field).toHaveAttribute('readonly','');expect(commands).toHaveLength(0);
});

test('confirmation and ambiguous retry retain the same command and keep local feedback',async({page})=>{
 const commands=await setup(page,{fail:true});await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();const dialog=page.locator('dialog[open]');await dialog.getByLabel('Internal rationale').fill('Claim for prompt restricted review');
 for(let n=0;n<2;n++){await dialog.locator('.caseOutcomeBar button[type="submit"]').click();await dialog.locator('[data-confirm]').click();await expect(dialog.locator('[data-feedback]')).toContainText('Save could not be confirmed');}
 expect(commands.length).toBe(2);expect(commands[0]!.p_command_id).toBe(commands[1]!.p_command_id);
});
test('mismatched case identity fails closed',async({page})=>{await setup(page,{item:{id:'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee'}});await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();await expect(page.locator('dialog[open] [data-feedback]')).toContainText('identity mismatch');await expect(page.locator('.caseOutcomeBar button[type="submit"]')).toHaveCount(0);});
test('mobile drawer stays within viewport',async({page})=>{await page.setViewportSize({width:390,height:844});await setup(page);await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();const dialog=page.locator('dialog[open]');await expect(dialog.getByLabel('Requester',{exact:true})).toHaveValue('Synthetic requester');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/safety-removal-mobile.png'});});

for (const size of [{width:1440,height:1000},{width:390,height:844},{width:390,height:500}]) {
 for (const theme of ['light','dark']) test(`case actions stay at the drawer bottom ${theme} ${size.width}x${size.height}`,async({page})=>{
  await page.setViewportSize(size);const commands=await setup(page);
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();
  const dialog=page.locator('dialog[open]'),footer=dialog.locator(':scope > .caseOutcomeBar'),body=dialog.locator('.editorialDrawerContent');
  await expect(footer.getByRole('button',{name:'Cancel',exact:true})).toBeVisible();
  await expect(footer.locator('button')).toHaveCount(2);
  await expect(footer.getByRole('button',{name:'Start review',exact:true})).toBeVisible();
  await expect(footer.locator('button[type="submit"]')).toBeVisible();
  const before=must(await footer.boundingBox()),panel=must(await dialog.boundingBox());
  expect(Math.abs(before.y+before.height-panel.y-panel.height)).toBeLessThan(2);
  expect(before.height).toBeLessThanOrEqual(size.height*.45+1);
  await body.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  expect(must(await footer.boundingBox()).y).toBeCloseTo(before.y,1);
  expect(await body.evaluate(el=>el.scrollTop>0)).toBe(true);
  expect(await body.evaluate(el=>el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(before.y+1);
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await dialog.getByRole('combobox',{name:'Action',exact:true}).click();
  await dialog.getByRole('option',{name:'Close request',exact:true}).click();
  await expect(dialog.locator('#safetyAction')).toHaveValue('not_actionable');
  await expect(footer.getByRole('button',{name:'Close request',exact:true})).toBeVisible();
  // The externally associated submit button still uses native required-field validation.
  await footer.locator('button[type="submit"]').click();
  await expect(dialog.locator('[data-confirm]')).toHaveCount(0);
  await dialog.getByLabel('Internal rationale').fill('Reviewed the synthetic evidence and request.');
  await dialog.getByLabel('Response visible to the requester').fill('Synthetic review completed; no real action taken.');
  await footer.locator('button[type="submit"]').click();
  await expect(footer).toBeHidden();await expect(dialog.locator('[data-confirm]')).toBeVisible();
  await dialog.getByRole('button',{name:'Back',exact:true}).click();
  await expect(footer).toBeVisible();await expect(dialog.getByLabel('Internal rationale')).toHaveValue('Reviewed the synthetic evidence and request.');
  expect(commands).toHaveLength(0);
  expect((await new AxeBuilder({page}).include('dialog[open]').analyze()).violations).toEqual([]);
  await page.screenshot({path:`test-results/safety-footer-${theme}-${size.width}x${size.height}.png`});
 });
}

for (const [action,label] of Object.entries({reviewing:'Start review',needs_information:'Request information',removed:'Record removal',not_actionable:'Close request',reopen:'Reopen request'})) test(`selected action has matching button and confirmation: ${action}`,async({page})=>{
 const commands=await setup(page,{item:action==='reopen'?{closed_at:'2026-10-06T12:00:00Z',state:'not_actionable'}:{}});
 await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();
 const dialog=page.locator('dialog[open]'),footer=dialog.locator('.caseOutcomeBar');
 await dialog.getByRole('combobox',{name:'Action',exact:true}).click();
 await dialog.getByRole('option',{name:label,exact:true}).click();
 await expect(footer.locator('button')).toHaveCount(2);
 await expect(footer.getByRole('button',{name:label,exact:true})).toBeVisible();
 await expect(dialog.getByText('Review change',{exact:true})).toHaveCount(0);
 await dialog.getByLabel('Internal rationale').fill('Synthetic reviewed evidence supports this workflow action.');
 await dialog.getByLabel('Response visible to the requester').fill('Synthetic case response, with no real moderation action.');
 if(action==='removed'){
  await dialog.getByLabel('Identical-copy investigation').fill('Synthetic copies checked.');
  await dialog.getByLabel('Old URL / public access verification').fill('Synthetic old URL access verified.');
 }
 await footer.getByRole('button',{name:label,exact:true}).click();
 expect(commands).toHaveLength(0);
 await expect(dialog.getByRole('heading',{name:`Confirm: ${label}`,exact:true})).toBeVisible();
 await expect(footer).toBeHidden();
 await dialog.getByRole('button',{name:`Confirm: ${label}`,exact:true}).click();
 await expect.poll(()=>commands.length).toBe(1);
 expect(commands[0]!.p_input.action).toBe(action);
});

test('unassigned case is claimed in one click with no decision fields or confirmation',async({page})=>{
 let assigned=false;
 const commands=await setup(page,{getCase:()=>({assigned_to:assigned?operatorSession.user_id:null,revision:assigned?2:1}),onCommand:()=>{assigned=true;}});
 await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();
 const dialog=page.locator('dialog[open]');
 await expect(dialog.getByLabel('Internal rationale')).toBeHidden();
 await expect(dialog.getByLabel('Response visible to the requester')).toBeHidden();
 await expect(dialog.getByRole('combobox',{name:'Action',exact:true})).toBeHidden();
 await dialog.getByRole('button',{name:'Assign to me',exact:true}).click();
 await expect.poll(()=>commands.length).toBe(1);
 expect(commands[0]!.p_input).toEqual({action:'claim',note:'Self-assigned for review.'});
 await expect(dialog.locator('[data-confirm]')).toHaveCount(0);
 await expect(dialog.locator('[data-feedback]')).toHaveText('Assigned to you.');
 await expect(dialog.getByLabel('Assignee',{exact:true})).toHaveValue('Assigned to you');
 await expect(dialog.getByLabel('Internal rationale')).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Start review',exact:true})).toBeVisible();
 await expect(dialog.locator('#safetyAction option[value="claim"]')).toHaveCount(0);
});

test('assignment failure keeps one-click retry and the same idempotency key',async({page})=>{
 const commands=await setup(page,{item:{assigned_to:null},fail:true});
 await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();
 const dialog=page.locator('dialog[open]');
 for(let n=0;n<2;n++){
  await dialog.getByRole('button',{name:'Assign to me',exact:true}).click();
  await expect(dialog.locator('[data-feedback]')).toContainText('Save could not be confirmed');
  await expect(dialog.getByRole('button',{name:'Assign to me',exact:true})).toBeEnabled();
 }
 expect(commands).toHaveLength(2);
 expect(commands[0]!.p_command_id).toBe(commands[1]!.p_command_id);
 expect(commands[0]!.p_input).toEqual({action:'claim',note:'Self-assigned for review.'});
 await expect(dialog.locator('[data-confirm]')).toHaveCount(0);
});

test('assignment stays disabled while pending and ignores a second click',async({page})=>{
 const commands=await setup(page,{item:{assigned_to:null}});
 let finish!:()=>void;const pending=new Promise<void>(resolve=>{finish=resolve;});
 await page.route('**/rest/v1/rpc/admin_safety_removal_command_v1',async route=>{
  commands.push(route.request().postDataJSON());await pending;
  await route.fulfill({status:503,json:{message:'Save could not be confirmed.'}});
 });
 await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();
 const button=page.locator('dialog[open]').getByRole('button',{name:'Assign to me',exact:true});
 await button.click();await expect.poll(()=>commands.length).toBe(1);await expect(button).toBeDisabled();
 await button.evaluate(el=>(el as HTMLButtonElement).click());expect(commands).toHaveLength(1);
 await page.locator('.portalNav [data-view="overview"]').click();
 await page.goBack();await page.keyboard.press('Escape');
 await expect(page.locator('.adminRecordPage')).toBeVisible();await expect(button).toBeDisabled();
 await expect(page.locator('.portalNav [data-view="safety"]')).toHaveAttribute('aria-current','page');
 finish();await expect(button).toBeEnabled();
});

test('stale unassigned case cannot be claimed',async({page})=>{
 let revision=1;
 const commands=await setup(page,{getCase:()=>({assigned_to:null,revision})});
 await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();revision=2;
 await reconcile(page);
 await expect(page.locator('dialog[open]').getByRole('button',{name:'Assign to me',exact:true})).toBeDisabled();
 expect(commands).toHaveLength(0);
});

test('Cancel closes the case without submitting the selected action',async({page})=>{
 const commands=await setup(page);await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();
 const dialog=page.locator('dialog[open]');
 await dialog.getByLabel('Internal rationale').fill('This draft is not being submitted.');
 await dialog.locator('.caseOutcomeBar').getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(dialog).toHaveCount(0);expect(commands).toHaveLength(0);
});

test('read-only case footer exposes no decision buttons',async({page})=>{
 const commands=await setup(page,{item:{can_write:false}});await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();
 const footer=page.locator('dialog[open] > .caseOutcomeBar');
 await expect(footer.getByRole('heading',{name:'Read-only access'})).toBeVisible();
 await expect(footer.locator('button')).toHaveCount(0);expect(commands).toHaveLength(0);
});

test('staff inspects an exact target before confirmed handoff; retry preserves identity',async({page})=>{
 const commands=await setup(page,{fail:true});await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();const drawer=page.locator('dialog[open]');
 await drawer.getByLabel('Exact content ID',{exact:true}).fill(targetId);await drawer.getByRole('button',{name:'Inspect content'}).click();
 await expect(drawer.getByLabel('Verified content ID')).toHaveValue(targetId);expect(commands).toHaveLength(0);
 await drawer.getByLabel('Content identification rationale').fill('The submitted reference identifies this exact synthetic post');await drawer.locator('[data-handoff] input[type=checkbox]').check();
 const scan=await new AxeBuilder({page}).include('dialog[open]').analyze();expect(scan.violations).toEqual([]);
 for(let n=0;n<2;n++){await drawer.getByRole('button',{name:'Review report creation'}).click();await expect(drawer.getByText('No account ban will be applied.',{exact:false})).toBeVisible();expect(commands).toHaveLength(n);await drawer.getByRole('button',{name:'Create restricted report',exact:true}).click();await expect(drawer.locator('[data-feedback]')).toContainText('Save could not be confirmed');}
 expect(commands).toHaveLength(2);expect(commands[0]!.p_command_id).toBe(commands[1]!.p_command_id);expect(commands[0]!.p_input.target_id).toBe(targetId);expect(commands[0]!.p_input.fingerprint).toBe(target.fingerprint);
});
test('mismatched content preview prevents report creation',async({page})=>{const commands=await setup(page,{target:{id}});await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();await page.getByLabel('Exact content ID',{exact:true}).fill(targetId);await page.getByRole('button',{name:'Inspect content'}).click();await expect(page.locator('dialog[open] [data-feedback]')).toContainText('identity could not be verified');await expect(page.getByRole('button',{name:'Review report creation'})).toHaveCount(0);expect(commands).toHaveLength(0);});

test('locked session clears intake details and discards a late target response',async({page})=>{
 await setup(page);let finish!: () => void,started=false;const gate=new Promise<void>(resolve=>{ finish=resolve; });
 await page.route('**/rest/v1/rpc/get_admin_safety_target_v1',async route=>{started=true;await gate;await route.fulfill({json:target}).catch(()=>{});});
 await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();await page.getByLabel('Exact content ID',{exact:true}).fill(targetId);await page.getByRole('button',{name:'Inspect content'}).click();await expect.poll(()=>started).toBe(true);
 await page.getByRole('button',{name:'Lock session',exact:true}).evaluate(button=>{if(!(button instanceof HTMLElement))throw Error("Expected HTML button");button.click();});finish();
 await expect(page.locator('#portalApp')).toBeHidden();for(const dialog of await page.locator('.safetyRemovalDialog').all())await expect(dialog).toBeEmpty();await expect(page.getByText('Synthetic requester',{exact:true})).toHaveCount(0);
});

test('confirmation uses the centered modal and Back preserves the drawer rationale',async({page})=>{
 const commands=await setup(page);await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();const dialog=page.locator('dialog[open]');
 await dialog.getByLabel('Internal rationale').fill('Preserve this reviewed rationale');await dialog.locator('.caseOutcomeBar button[type="submit"]').click();await expect(dialog).not.toHaveClass(/portalDrawer/);await expect(dialog.locator('.modalHeader')).toBeVisible();
 const scan=await new AxeBuilder({page}).include('dialog[open]').analyze();expect(scan.violations).toEqual([]);
 await dialog.getByRole('button',{name:'Back',exact:true}).click();await expect(dialog).toHaveClass(/portalDrawer/);await expect(dialog.getByLabel('Internal rationale')).toHaveValue('Preserve this reviewed rationale');expect(commands).toHaveLength(0);
});

test('ordinary intake opens under moderation with matching fields and account-only handoff',async({page})=>{
 await setup(page,{view:'moderation',item:{queue:'moderation',classification:{reason_label:'Impersonation',detail_label:'They’re pretending to be me',targets:['account']},request:{...item.request,reason:'impersonation',detail:'impersonating_me'}},target:{kind:'account'}});
 await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();const dialog=page.locator('dialog[open]');
 await expect(dialog.getByLabel('Category',{exact:true})).toHaveValue('Impersonation');
 await expect(dialog.getByLabel('Specific concern',{exact:true})).toHaveValue('They’re pretending to be me');
 await expect(dialog.locator('#safetyKind option')).toHaveCount(1);
 await expect(dialog.locator('#safetyKind')).toHaveValue('account');
 await expect(dialog.getByRole('combobox',{name:'Content type',exact:true})).toContainText('Account');
 await dialog.getByLabel('Exact content ID',{exact:true}).fill(targetId);await dialog.getByRole('button',{name:'Inspect content'}).click();
 await expect(dialog.getByText('content stays unchanged until a staff decision.',{exact:false})).toBeVisible();
 await dialog.getByLabel('Content identification rationale').fill('The supplied reference identifies this exact account');await dialog.locator('[data-handoff] input[type=checkbox]').check();
 await dialog.getByRole('button',{name:'Review report creation'}).click();
 await expect(dialog.getByRole('button',{name:'Create moderation report',exact:true})).toBeVisible();
 await expect(dialog.getByText('without changing content visibility.',{exact:false})).toBeVisible();
});

async function reconcile(page: Page){
 await page.waitForFunction(()=>typeof window.safetyInvalidate==='function');
 await page.evaluate(()=>window.safetyInvalidate({name:'moderation.safety.updated',data:{}}));
}
const history=[{action:'not_actionable',occurred_at:'2026-09-29T16:37:36Z',internal_note:'Synthetic launch verification only. No member content was changed.',public_message:'Testing is complete; no real content was removed.'},{action:'received',occurred_at:'2026-09-29T16:20:49Z'}];
for (const restricted of [true, false]) test(`linked intake opens its exact ${restricted ? 'restricted' : 'ordinary'} moderation record without a command`, async ({page}) => {
 const detail={...reportCase,evidence:{...reportCase.evidence,caption:'Test post caption'},subject:restricted?'Synthetic restricted report':null,specific_concern:restricted?'Reviewed concern':null,category:restricted?'Reviewed category':null,triage_state:restricted?{queue:'restricted_safety',priority:'high'}:null};
 const commands=await setup(page,{reportCase:detail,item:{report_id:reportId}});
 await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();
 await page.getByRole('button',{name:'Open linked moderation case'}).click();
 await expect(page.locator('.safetyRemovalDialog[open]')).toHaveCount(0);
 await expect(page.locator('#caseDrawer')).toHaveAttribute('aria-hidden','false');
 await expect(page.locator('#drawerTitle')).toHaveText(restricted?'Synthetic restricted report · Reviewed concern':'Content report · External removal request');
 await expect(page.locator('#drawerContent')).toContainText('Test post caption');
 await page.locator('[data-drawer-tab="history"]').click();
 await expect(page.locator('.triageStateCard')).toContainText(restricted?'Restricted safety':'Trust & safety');
 expect(commands).toEqual([]);
});
for(const theme of ['light','dark'])for(const width of [390,1440])test(`history uses themed timeline and right-aligned action ${theme} ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});
 await setup(page,{item:{history,state:'not_actionable',closed_at:'2026-09-29T16:37:36Z',revision:2}});
 await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
 await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();const dialog=page.locator('dialog[open]');
 await expect(dialog.locator('.supportCard')).toHaveCount(0);
 await expect(dialog.locator('.drawerTimeline strong').first()).toHaveText('Not actionable');
 await expect(dialog.locator('.drawerTimeline')).toContainText('Requester response: Testing is complete');
 await expect(dialog.locator('[data-freshness]')).toBeEmpty();
 expect((await new AxeBuilder({page}).include('dialog[open]').analyze()).violations).toEqual([]);
 const action=dialog.locator('.caseOutcomeBar button[type="submit"]');await action.scrollIntoViewIfNeeded();
 const button=must(await action.boundingBox()),row=must(await action.locator('..').boundingBox());expect(Math.abs(button.x+button.width-row.x-row.width)).toBeLessThan(2);
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.screenshot({path:`test-results/safety-history-${theme}-${width}.png`});
});
test('unchanged reconciliation preserves draft and focus without a false warning or extra detail read',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();const dialog=page.locator('dialog[open]');const note=dialog.getByLabel('Internal rationale');
 await note.fill('Keep this draft while checking for changes');let pages=0,details=0;page.on('request',r=>{if(r.url().includes('get_admin_safety_removals_'))pages++;if(r.url().includes('get_admin_safety_removal_v1'))details++;});
 await reconcile(page);await expect.poll(()=>pages).toBeGreaterThan(0);await expect(page.locator('[data-portal-view="safety"] [aria-label="External removal requests"]')).toContainText('AAAAAAAA');
 await expect(dialog.locator('[data-freshness]')).toBeEmpty();await expect(note).toHaveValue('Keep this draft while checking for changes');await expect(note).toBeFocused();expect(details).toBe(0);
});
test('newer revision warns without overwriting draft, moving focus or permitting stale confirmation',async({page})=>{
 let revision=1;const commands=await setup(page,{getCase:()=>({revision})});await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();const dialog=page.locator('dialog[open]');const note=dialog.getByLabel('Internal rationale');await note.fill('Preserve this rationale when another reviewer changes the case');revision=2;
 await reconcile(page);await expect(dialog.locator('[data-freshness]')).toContainText('This case has changed');await expect(note).toBeFocused();await expect(note).toHaveValue('Preserve this rationale when another reviewer changes the case');await expect(dialog.locator('.caseOutcomeBar button[type="submit"]')).toBeDisabled();expect(commands).toHaveLength(0);
});
test('own confirmed save followed by reconciliation does not warn that the case is stale',async({page})=>{
 let saved=false;await setup(page,{onCommand:()=>saved=true,getCase:()=>saved?{revision:2,state:'not_actionable',closed_at:'2026-09-29T16:37:36Z',history}:{}});
 await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();const dialog=page.locator('dialog[open]');await dialog.getByLabel('Internal rationale').fill('Synthetic closure check only');
 await dialog.getByRole('combobox',{name:'Action',exact:true}).click();await dialog.getByRole('option',{name:'Close request',exact:true}).click();await dialog.getByLabel('Response visible to the requester',{exact:true}).fill('Synthetic check completed without content action.');await dialog.locator('.caseOutcomeBar button[type="submit"]').click();await dialog.locator('[data-confirm]').click();await expect(dialog.locator('.safetyHistory')).toContainText('Not actionable');
 let reads=0;page.on('request',r=>{if(r.url().includes('get_admin_safety_removals_'))reads++;});await reconcile(page);await expect.poll(()=>reads).toBeGreaterThan(0);await expect(page.locator('[data-portal-view="safety"] [aria-label="External removal requests"]')).toContainText('AAAAAAAA');await expect(dialog.locator('[data-freshness]')).toBeEmpty();
});
test('off-page freshness read failure is explicit and late responses cannot reopen a closed drawer',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();const dialog=page.locator('dialog[open]');await dialog.getByLabel('Internal rationale').fill('Preserve draft after a refresh failure');
 await page.route('**/rest/v1/rpc/get_admin_safety_removals_v1',route=>route.fulfill({json:{items:[],next_cursor:null}}));
 await page.route('**/rest/v1/rpc/get_admin_safety_removal_v1',route=>route.fulfill({status:503,json:{message:'Unavailable'}}));
 await reconcile(page);await expect(dialog.locator('[data-freshness]')).toContainText('Could not check');await expect(dialog.getByLabel('Internal rationale')).toHaveValue('Preserve draft after a refresh failure');
 let finish!: () => void,started=false;const gate=new Promise<void>(resolve=>{ finish=resolve; });await page.route('**/rest/v1/rpc/get_admin_safety_removal_v1',async route=>{started=true;await gate;await route.fulfill({json:{...item,revision:2}});});
 await reconcile(page);await expect.poll(()=>started).toBe(true);await dialog.getByRole('button',{name:'Back to queue',exact:true}).click();finish();await expect(page.locator('.safetyRemovalDialog[open]')).toHaveCount(0);
});
test('a newer revision during confirmation is visible and Back preserves the stale draft',async({page})=>{
 let revision=1;const commands=await setup(page,{getCase:()=>({revision})});await page.getByRole('button',{name:'AAAAAAAA',exact:true}).click();const dialog=page.locator('dialog[open]');await dialog.getByLabel('Internal rationale').fill('Preserve this draft through a stale confirmation');await dialog.locator('.caseOutcomeBar button[type="submit"]').click();revision=2;await reconcile(page);
 await expect(dialog.locator('[data-freshness]')).toContainText('This case has changed');await expect(dialog.locator('[data-confirm]')).toBeDisabled();await dialog.getByRole('button',{name:'Back',exact:true}).click();await expect(dialog.locator('[data-freshness]')).toContainText('This case has changed');await expect(dialog.getByLabel('Internal rationale')).toHaveValue('Preserve this draft through a stale confirmation');await expect(dialog.locator('.caseOutcomeBar button[type="submit"]')).toBeDisabled();expect(commands).toHaveLength(0);
});
