import { must } from "../../test-contracts.mts";
import type { Page, Route } from "@playwright/test";
import { test, expect } from '../../coverage-fixture.mts';
import AxeBuilder from '@axe-core/playwright';
import { installMockBackend, seedAdminSession, operatorSession } from './fixtures.mts';
import type {MockOptions} from './fixtures.mts';
interface EditorialCommand extends Record<string,unknown> {kind:string;action:string;input:Record<string,unknown>}
interface EditorialOptions extends MockOptions {
 readOnly?:boolean;
 command?:(route:Route,command:EditorialCommand,count:number)=>Promise<void>;
 read?:(route:Route,url:URL,item:typeof suggestion|typeof announcement)=>Promise<void>;
}
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const version = 'a'.repeat(32);
const announcement = {
  id,
  title: 'Test member notice',
  body: 'A safe synthetic announcement.',
  starts_at: '2026-09-27T12:00:00Z',
  ends_at: '2026-10-01T12:00:00Z',
  priority: 0,
  max_impressions_per_user: 1,
  min_hours_between_impressions: 24,
  cta_label: null,
  cta_url: null,
  created_at: '2026-09-27T10:00:00Z',
  state: 'draft',
  display_state: 'draft',
  managed: true,
  can_write: true,
  version,
  recent_history: [],
};
const suggestion = {
  id,
  title: 'Tea or coffee?',
  body: 'Would you rather drink tea or coffee?',
  kind: 'wyr',
  options: ['Tea', 'Coffee'],
  author: 'Synthetic Member',
  status: 'pending',
  state: 'pending',
  display_state: 'pending',
  created_at: '2026-09-27T10:00:00Z',
  can_write: true,
  version,
  recent_history: [],
};
async function setup(page: Page, options:EditorialOptions = {}) {
  await installMockBackend(page, { employeeMode: true, editorialMode: true, ...options });
  await seedAdminSession(page, true);
  const commands:EditorialCommand[] = [];
  const reads:URL[] = [];
  await page.route('**/portal/admin/editorial-*', async (route) => {
    const url = new URL(route.request().url());
    const kind = url.searchParams.get('kind');
    const item = kind === 'suggestions' ? suggestion : announcement;
    const json = (value:unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname.endsWith('editorial-command')) {
      const command = route.request().postDataJSON();
      commands.push(command);
      if (options.command) return options.command(route, command, commands.length);
      return json({
        ...item,
        ...(command.kind === 'suggestions' ? suggestion : announcement),
        ...command.input,
        state:
          command.action === 'publish'
            ? 'published'
            : command.action === 'cancel'
              ? 'cancelled'
              : 'draft',
        display_state:
          command.action === 'publish'
            ? 'scheduled'
            : command.action === 'cancel'
              ? 'cancelled'
              : 'draft',
        status: command.kind === 'suggestions' ? command.action : undefined,
        version: 'b'.repeat(32),
      });
    }
    reads.push(url);
    if (options.read) return options.read(route, url, item);
    return json(
      url.pathname.endsWith('editorial-page')
        ? { items: [item], next_cursor: null, can_write: options.readOnly ? false : true }
        : { ...item, can_write: !options.readOnly },
    );
  });
  await page.goto('/');
  await expect(page.locator('#operatorName')).toHaveText('Gavin Fahey');
  return { commands, reads };
}
const nav = (page: Page, kind:string) => page.locator(`.portalNav [data-view="${kind}"]`).click();
const dialog = (page: Page) => page.locator('dialog.editorialDialog');

for (const kind of ['suggestions', 'announcements']) for (const width of [390, 1440]) {
  test(`${kind} records use the shared right drawer at ${width}px`, async ({page}, testInfo) => {
    await page.setViewportSize({width,height:900});
    const {commands}=await setup(page);
    if(width<600)await page.locator('#mobileMenu').click();
    await nav(page,kind);
    const item=kind==='suggestions'?suggestion:announcement;
    const opener=page.getByRole('button',{name:item.title,exact:true});
    await opener.click();
    const d=dialog(page);
    await expect(d.locator('.drawerHeader')).toBeVisible();
    await expect(d).toHaveClass(/portalDrawer adminDrawer open/);
    const bounds=must(await d.boundingBox());
    expect(bounds.x).toBeCloseTo(Math.max(0,width-680),0);
    expect(bounds.y).toBe(0);expect(bounds.height).toBe(900);
    expect(bounds.x+bounds.width).toBeCloseTo(width,0);
    await d.getByRole('button',{name:'Refresh record',exact:true}).click();
    await expect(d.getByRole('button',{name:'Refresh record',exact:true})).toBeVisible();
    await page.screenshot({path:testInfo.outputPath(`record-drawer-${kind}-${width}.png`),fullPage:true});
    // Native modal focus may visit browser chrome, but never the inert queue.
    // WHATWG sequential focus navigation intentionally permits browser controls.
    for(let i=0;i<12;i++) {
      await page.keyboard.press('Tab');
      expect(await d.evaluate(el=>({modal:el.matches(':modal'),backgroundControlFocused:!el.contains(document.activeElement)&&document.activeElement!==document.body}))).toEqual({modal:true,backgroundControlFocused:false});
    }
    await d.getByRole('button',{name:'Close',exact:true}).focus();
    await page.keyboard.press('Escape');await expect(d).not.toBeVisible();await expect(opener).toBeFocused();
    if(width>600){await opener.click();await expect(d.locator('.drawerHeader')).toBeVisible();await page.mouse.click(40,400);await expect(d).not.toBeVisible();await expect(opener).toBeFocused();}
    expect(commands).toHaveLength(0);
  });
}

test('idea confirmation is centered and Back restores the drawer and rationale',async({page})=>{
  const {commands}=await setup(page);await nav(page,'suggestions');
  await page.getByRole('button',{name:suggestion.title,exact:true}).click();
  const d=dialog(page),reason='Review reason is preserved when going back';
  await d.getByLabel('Decision rationale (member-visible)').fill(reason);
  await d.getByRole('button',{name:'Accept into pool',exact:true}).click();
  await expect(d).not.toHaveClass(/portalDrawer/);await expect(d.locator('.modalHeader')).toBeVisible();
  await d.getByRole('button',{name:'Back',exact:true}).click();
  await expect(d).toHaveClass(/portalDrawer/);await expect(d.getByLabel('Decision rationale (member-visible)')).toHaveValue(reason);
  expect(commands).toHaveLength(0);
});

test('existing announcement edits stay in a drawer while creation and confirmation use dialogs',async({page})=>{
  const {commands}=await setup(page);await nav(page,'announcements');
  await page.getByRole('button',{name:announcement.title,exact:true}).click();
  const d=dialog(page);await d.getByRole('button',{name:'Edit draft',exact:true}).click();
  await expect(d).toHaveClass(/portalDrawer/);await expect(d.getByLabel('Title',{exact:true})).toHaveValue(announcement.title);
  await d.getByLabel('Change rationale').fill('Keep this existing draft unchanged');
  await d.getByRole('button',{name:'Review draft save',exact:true}).click();
  await expect(d).not.toHaveClass(/portalDrawer/);
  await d.getByRole('button',{name:'Back',exact:true}).click();
  await expect(d).toHaveClass(/portalDrawer/);await expect(d.getByLabel('Change rationale')).toHaveValue('Keep this existing draft unchanged');
  await d.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'New announcement',exact:true}).click();
  await expect(d).not.toHaveClass(/portalDrawer/);await expect(d.locator('.modalHeader')).toBeVisible();
  expect(commands).toHaveLength(0);
});

for (const [kind, options, label, response] of [
  ['poll', ['First exact choice', 'Second exact choice'], 'Poll', 'Choose one option'],
  ['wyr', ['First exact choice', 'Second exact choice'], 'Would you rather', 'Choose one option'],
  ['question', [], 'Question', 'Free-text answer'],
  ['photo_idea', [], 'Photo idea', 'Photo response'],
  ['format_question', {answer_rule:{type:'exact_word_count',count:2}}, 'Format question', 'Exact word count'],
  ['format_question', {answer_rule:{type:'exact_word_count',count:1}}, 'Format question', 'Exact word count (one)'],
  ['format_question', {answer_rule:{type:'starts_with_letter',letter:'s'}}, 'Format question', 'Starts with letter'],
] as const) test(`submission ${kind} ${response} stays identical in detail and confirmation`, async ({page}) => {
  // Same prompt can have different explicitly selected kinds. Never infer from text.
  const item={...suggestion,kind,options,body:'Would you rather <b>keep the exact prompt?</b>'};
  const {commands,reads}=await setup(page,{read:(route,url)=>route.fulfill({contentType:'application/json',body:JSON.stringify(url.pathname.endsWith('editorial-page')?{items:[item],can_write:true}:item)})});
  await nav(page,'suggestions');
  await expect(page.locator('.editorialWorkspace:visible tbody')).toContainText(label);
  await page.getByRole('button',{name:item.title,exact:true}).click();
  const d=dialog(page), preview=d.locator('.editorialSubmission');
  await expect(preview.getByLabel(kind==='photo_idea'?'Photo prompt':'Question',{exact:true})).toHaveValue(item.body);
  await expect(preview.locator('b')).toHaveCount(0);
  await expect(preview.getByLabel('Type',{exact:true})).toHaveValue(label);
  await expect(preview.getByLabel(kind==='format_question'?'Answer format':'Response format')).toHaveValue(response.replace(' (one)',''));
  if('answer_rule' in options && 'count' in options.answer_rule) await expect(preview.getByLabel('Word count')).toHaveValue(String(options.answer_rule.count));
  if('answer_rule' in options && 'letter' in options.answer_rule) await expect(preview.getByLabel('Starting letter')).toHaveValue(options.answer_rule.letter);
  await expect(preview).toContainText('Original submission · AAAAAAAA');
  await expect(preview).not.toContainText('answer_rule');
  if(kind==='poll'||kind==='wyr')for(const [i,value]of options.entries())await expect(preview.getByLabel(`Choice ${i+1}`,{exact:true})).toHaveValue(value);
  else await expect(preview.getByLabel(/^Choice /)).toHaveCount(0);
  for(const control of await preview.locator('input,textarea').all())await expect(control).toHaveAttribute('readonly','');
  expect(reads.find(url=>url.pathname.endsWith('editorial-item'))!.searchParams.get('id')).toBe(item.id);
  const original=await preview.locator('input,textarea').evaluateAll(nodes=>nodes.map(el=>{if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) throw Error("Expected form field"); return {id:el.id,value:el.value,readOnly:el.readOnly};}));
  await d.getByLabel('Decision rationale (member-visible)').fill('Reviewed exact original submission');
  await d.getByRole('button',{name:'Accept into pool',exact:true}).click();
  expect(await d.locator('.editorialSubmission input,.editorialSubmission textarea').evaluateAll(nodes=>nodes.map(el=>{if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) throw Error("Expected form field"); return {id:el.id,value:el.value,readOnly:el.readOnly};}))).toEqual(original);
  expect(commands).toHaveLength(0);
  await d.getByRole('button',{name:'Confirm action',exact:true}).click();
  await expect.poll(()=>commands.length).toBe(1);
  expect(commands[0]!).toMatchObject({id:item.id,version:item.version,kind:'suggestions',action:'approved',input:{}});
});

test('submission form preserves long literal values and cannot edit or submit them', async ({page}) => {
  await page.setViewportSize({width:390,height:900});
  const item={...suggestion,body:('</textarea><b>Literal question</b> & "text"\n'.repeat(12)).slice(0,500),options:['First & "exact" choice '.repeat(5).slice(0,100),'Second choice '.repeat(8).slice(0,100)]};
  const {commands}=await setup(page,{read:(route,url)=>route.fulfill({contentType:'application/json',body:JSON.stringify(url.pathname.endsWith('editorial-page')?{items:[item],can_write:true}:item)})});
  await page.locator('#mobileMenu').click();await nav(page,'suggestions');
  await page.getByRole('button',{name:item.title,exact:true}).click();
  const form=dialog(page).getByRole('region',{name:'Original submission'});
  await expect(form.getByLabel('Question',{exact:true})).toHaveValue(item.body);
  await expect(form.locator('b')).toHaveCount(0);
  await form.getByLabel('Question',{exact:true}).focus();await page.keyboard.type('Never overwrite');await page.keyboard.press('Enter');
  await expect(form.getByLabel('Question',{exact:true})).toHaveValue(item.body);
  for(const [i,value]of item.options.entries())await expect(form.getByLabel(`Choice ${i+1}`,{exact:true})).toHaveValue(value);
  expect(await form.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  for(const control of await form.locator('textarea').all())expect(await control.evaluate(el=>el.scrollHeight<=el.clientHeight+2)).toBe(true);
  expect(commands).toHaveLength(0);
});

test('same-title ideas still read and decide the selected submission ID', async ({page}) => {
  const other={...suggestion,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',author:'Different member',options:['Exact second idea A','Exact second idea B']};
  const {commands}=await setup(page,{read:(route,url)=>route.fulfill({contentType:'application/json',body:JSON.stringify(url.pathname.endsWith('editorial-page')?{items:[suggestion,other],can_write:true}:url.searchParams.get('id')===other.id?other:suggestion)})});
  await nav(page,'suggestions');
  await page.getByRole('button',{name:suggestion.title,exact:true}).nth(1).click();
  const d=dialog(page);
  await expect(d).toContainText('Different member');
  for(const [i,value]of other.options.entries())await expect(d.getByLabel(`Choice ${i+1}`,{exact:true})).toHaveValue(value);
  await d.getByLabel('Decision rationale (member-visible)').fill('Reviewed this exact second submission');
  await d.getByRole('button',{name:'Decline idea',exact:true}).click();
  await expect(d.locator('.editorialSubmission')).toContainText('BBBBBBBB');
  await d.getByRole('button',{name:'Confirm action',exact:true}).click();
  await expect.poll(()=>commands.length).toBe(1);
  expect(commands[0]!.id).toBe(other.id);
});

test('mismatched detail identity never displays or offers a decision',async({page})=>{
  const {commands}=await setup(page,{read:(route,url)=>route.fulfill({contentType:'application/json',body:JSON.stringify(url.pathname.endsWith('editorial-page')?{items:[suggestion],can_write:true}:{...suggestion,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'})})});
  await nav(page,'suggestions');await page.getByRole('button',{name:suggestion.title,exact:true}).click();
  await expect(dialog(page)).toContainText('does not match the selected submission');
  await expect(dialog(page).getByRole('button',{name:'Accept into pool'})).toHaveCount(0);
  expect(commands).toHaveLength(0);
});

for(const [kind,options]of[['format_question',{answer_rule:{type:'exact_word_count',count:0}}],['format_question',null],['unknown',[]],['question',['unexpected']],['wyr',['only one']]] as const)
test(`malformed ${kind} ${JSON.stringify(options)} cannot be accepted`,async({page})=>{
 const item={...suggestion,kind,options,allowed_actions:['approved','rejected']};
 const {commands}=await setup(page,{read:(route,url)=>route.fulfill({contentType:'application/json',body:JSON.stringify(url.pathname.endsWith('editorial-page')?{items:[item],can_write:true}:item)})});
 await nav(page,'suggestions');await page.getByRole('button',{name:item.title,exact:true}).click();
 await expect(dialog(page)).toContainText('Verify the original submission before accepting');
 await expect(dialog(page).getByRole('button',{name:'Accept into pool'})).toHaveCount(0);
 expect(commands).toHaveLength(0);
});

for (const width of [390, 1440]) for (const theme of ['light', 'dark']) {
  test(`idea detail fits ${width}px in ${theme} with accessible review controls`, async ({page},testInfo) => {
    await page.setViewportSize({width,height:900});
    const item={...suggestion,...(theme==='dark'?{kind:'format_question',options:{answer_rule:{type:'exact_word_count',count:2}},body:'Describe your perfect weekend in two words.'}:{}),status:'approved',display_state:'approved',allowed_actions:['rejected','pending'],pool_active:true,username:'synthetic',reviewer:'Reviewer',reviewed_at:suggestion.created_at};
    await setup(page,{read:(route,url)=>route.fulfill({contentType:'application/json',body:JSON.stringify(url.pathname.endsWith('editorial-page')?{items:[item],can_write:true}:item)})});
    await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);
    if(width<600)await page.locator('#mobileMenu').click();
    await nav(page,'suggestions');
    const opener=page.getByRole('button',{name:suggestion.title,exact:true});
    await opener.focus();await page.keyboard.press('Enter');
    const d=dialog(page);await expect(d).toBeVisible();
    expect(await d.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    const results=await new AxeBuilder({page}).include('.editorialDialog').analyze();
    expect(results.violations.filter(v=>['serious','critical'].includes(v.impact || ''))).toEqual([]);
    await page.screenshot({path:testInfo.outputPath(`idea-${theme}-${width}.png`),fullPage:true});
    await d.getByRole('button',{name:'Close',exact:true}).click();
    await expect(opener).toBeFocused();
  });
}

for (const status of ['approved', 'rejected']) {
  test(`${status} idea opens from its row and supports a confirmed reversal`, async ({ page }) => {
    const item = { ...suggestion, status, display_state: status, username: 'synthetic',
      pool_active: status === 'approved', reviewer: 'Reviewer', reviewed_at: suggestion.created_at,
      allowed_actions: status === 'approved' ? ['rejected', 'pending'] : ['approved', 'pending'],
      admin_note: 'Original decision reason', recent_history: [{ action: `editorial.${status}`, occurred_at: suggestion.created_at, reason: 'Original decision reason' }] };
    const { commands } = await setup(page, { read: (route, url) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(url.pathname.endsWith('editorial-page') ? {items:[item],can_write:true} : item) }) });
    await nav(page, 'suggestions');
    await page.locator('.editorialWorkspace:visible tbody td').nth(1).click();
    const d = dialog(page);
    await expect(d).toContainText('@synthetic');
    await expect(d).toContainText('Reviewer');
    await d.getByText('Decision history and reference', {exact:true}).click();
    await expect(d.locator('.editorialHistory')).toContainText('Original decision reason');
    await d.getByLabel('Decision rationale (member-visible)').fill('Reconsidered after complete review');
    await d.getByRole('button', {name:status === 'approved' ? 'Reverse acceptance' : 'Accept into pool',exact:true}).click();
    expect(commands).toHaveLength(0);
    await d.getByRole('button', {name:'Confirm action',exact:true}).click();
    await expect.poll(()=>commands.length).toBe(1);
    expect(commands[0]!.action).toBe(status === 'approved' ? 'rejected' : 'approved');
  });
}
test('reopen explains its effect and preserves the same retry intent on failure', async ({page}) => {
  const item={...suggestion,status:'approved',display_state:'approved',allowed_actions:['rejected','pending']};
  const {commands}=await setup(page,{read:(route,url)=>route.fulfill({contentType:'application/json',body:JSON.stringify(url.pathname.endsWith('editorial-page')?{items:[item],can_write:true}:item)}),command:route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic outage'})})});
  await nav(page,'suggestions');
  await page.getByRole('button',{name:suggestion.title,exact:true}).click();
  const d=dialog(page);
  await d.getByLabel('Decision rationale (member-visible)').fill('Additional review is needed');
  await d.getByRole('button',{name:'Reopen for review',exact:true}).click();
  await expect(d).toContainText('Reopening does not send a push');
  await d.getByRole('button',{name:'Confirm action',exact:true}).click();
  await expect(d.locator('.editorialFeedback')).toContainText('Could not confirm');
  await d.getByRole('button',{name:'Retry same action',exact:true}).click();
  await expect.poll(()=>commands.length).toBe(2);
  expect(commands[1]!).toEqual(commands[0]!);
  expect(commands[0]!.action).toBe('pending');
});
test('scheduled idea shows a concrete safeguard, no action controls, and refreshes safely', async ({page}) => {
 const item={...suggestion,status:'approved',display_state:'approved',allowed_actions:[],review_blocked_reason:'This challenge has a scheduled or unclosed Doji.',scheduled_at:'2026-09-29T00:12:00Z'};
 const {commands,reads}=await setup(page,{read:(route,url)=>route.fulfill({contentType:'application/json',body:JSON.stringify(url.pathname.endsWith('editorial-page')?{items:[item],can_write:true}:item)})});
 await nav(page,'suggestions');
 await page.getByRole('button',{name:suggestion.title,exact:true}).click();
 const d=dialog(page);
 await expect(d).toContainText('scheduled or unclosed');
 await expect(d.getByLabel('Decision rationale (member-visible)')).toHaveCount(0);
 await expect(d.getByRole('button',{name:'Reopen for review',exact:true})).toHaveCount(0);
 const count=reads.length;
 await d.getByRole('button',{name:'Refresh record',exact:true}).click();
 await expect.poll(()=>reads.length).toBeGreaterThan(count);
 expect(commands).toHaveLength(0);
});

test('campaign reward is configurable, previewed and explicitly confirmed as a draft', async ({ page }) => {
  const { commands } = await setup(page, { campaignMode: true });
  await nav(page, 'announcements');
  await page.getByRole('button', { name: 'New announcement', exact: true }).click();
  const d = dialog(page);
  await d.getByLabel('Title', { exact: true }).fill('Ideas earn Sparks');
  await d.getByLabel('Message', { exact: true }).fill('Share your own Doji idea.');
  await d.getByLabel('Change rationale').fill('Synthetic completion campaign');
  await expect(d.getByLabel('Sparks awarded', { exact: true })).not.toBeVisible();
  await d.getByRole('combobox', { name: 'Destination', exact: true }).click();
  await expect(d.getByRole('option', { name: 'Feed', exact: true })).toHaveCount(0);
  await expect(d.getByRole('option', { name: 'Profile', exact: true })).toHaveCount(0);
  await d.getByRole('option', { name: 'Suggest a Doji', exact: true }).click();
  await d.getByLabel('Action button label (optional)').fill('Submit an idea');
  await d.getByRole('combobox', { name: 'Reward', exact: true }).click();
  await d.getByRole('option', { name: 'Sparks on completion', exact: true }).click();
  await d.getByLabel('Sparks awarded', { exact: true }).fill('750');
  await d.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(d.locator('.editorialRewardTerms')).toContainText('750 Sparks');
  await expect(d.locator('.editorialPreview')).toContainText('Not now');
  await d.getByRole('button', { name: 'Review draft save' }).click();
  await expect(d).toContainText('Once per member for this campaign');
  await expect(d).toContainText('Members will not see it');
  expect(commands).toHaveLength(0);
  await d.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(d.getByLabel('Sparks awarded', { exact: true })).toHaveValue('750');
  await d.getByRole('button', { name: 'Review draft save' }).click();
  await d.getByRole('button', { name: 'Confirm action', exact: true }).click();
  await expect(d).toContainText('Saved successfully');
  expect(commands[0]!.input).toMatchObject({ reward_action: 'submit_idea', reward_sparks: 750, cta_url: '/(app)/suggest-challenge' });
  expect(commands[0]!.input).not.toHaveProperty('reward_mode');
  expect(commands[0]!.action).toBe('create');
});

test('shop uses no reward and switching reward off removes stale reward values', async ({ page }) => {
  const { commands } = await setup(page, { campaignMode: true });
  await nav(page, 'announcements');
  await page.getByRole('button', { name: 'New announcement', exact: true }).click();
  const d = dialog(page);
  await d.getByLabel('Title', { exact: true }).fill('New shop items');
  await d.getByLabel('Message', { exact: true }).fill('Browse the Sparks shop.');
  await d.getByLabel('Change rationale').fill('Synthetic shop campaign');
  await d.getByLabel('Action button label (optional)').fill('Browse shop');
  await d.getByRole('combobox', { name: 'Destination', exact: true }).click();
  await d.getByRole('option', { name: 'Sparks shop', exact: true }).click();
  await d.getByRole('combobox', { name: 'Reward', exact: true }).click();
  await d.getByRole('option', { name: 'Sparks on completion', exact: true }).click();
  await d.getByLabel('Sparks awarded', { exact: true }).fill('500');
  await d.getByRole('button', { name: 'Review draft save' }).click();
  await expect(d.locator('.editorialFeedback')).toContainText('needs the Suggest a Doji destination');
  expect(commands).toHaveLength(0);
  await d.getByRole('combobox', { name: 'Reward', exact: true }).click();
  await d.getByRole('option', { name: 'No reward', exact: true }).click();
  await expect(d.getByLabel('Sparks awarded', { exact: true })).not.toBeVisible();
  await d.getByRole('button', { name: 'Review draft save' }).click();
  await expect(d.locator('.editorialRewardTerms')).toHaveCount(0);
  await d.getByRole('button', { name: 'Confirm action', exact: true }).click();
  await expect(d).toContainText('Saved successfully');
  expect(commands[0]!.input).toMatchObject({ reward_action: null, reward_sparks: 0, cta_url: '/(app)/profile/shop' });
});

test('campaign reward form retains shared accessible controls in a narrow dark layout', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await setup(page, { campaignMode: true });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.locator('#mobileMenu').click();
  await nav(page, 'announcements');
  await page.getByRole('button', { name: 'New announcement', exact: true }).click();
  const d = dialog(page);
  await d.getByRole('combobox', { name: 'Reward', exact: true }).click();
  await d.getByRole('option', { name: 'Sparks on completion', exact: true }).click();
  await d.getByLabel('Sparks awarded', { exact: true }).fill('500');
  const results = await new AxeBuilder({ page }).include('.editorialDialog').analyze();
  expect(results.violations.filter(v => ['serious', 'critical'].includes(v.impact || ''))).toEqual([]);
  expect(await d.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('campaign-reward-dark-390.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(d).not.toBeVisible();
});
test('draft creation requires confirmation; preserves draft-only intent and safe form values', async ({
  page,
}) => {
  const { commands } = await setup(page);
  await nav(page, 'announcements');
  await page.getByRole('button', { name: 'New announcement', exact: true }).click();
  const d = dialog(page);
  await d.getByLabel('Title', { exact: true }).fill('New member message');
  await d
    .getByLabel('Message', { exact: true })
    .fill('<img src=x onerror=alert(1)> is displayed as text.');
  await d.getByLabel('Change rationale').fill('Reviewed member communication');
  await d.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(d.locator('.editorialPreview')).toContainText('<img src=x');
  await expect(d.locator('.editorialPreview img')).toHaveCount(0);
  await d.getByRole('button', { name: 'Review draft save' }).click();
  await expect(d).toContainText('Members will not see it');
  expect(commands).toHaveLength(0);
  await d.getByRole('button', { name: 'Confirm action', exact: true }).click();
  await expect(d).toContainText('Saved successfully');
  expect(commands).toHaveLength(1);
  expect(commands[0]!).toMatchObject({
    action: 'create',
    kind: 'announcements',
    id: null,
    version: null,
  });
  expect(commands[0]!.input).not.toHaveProperty('enabled');
});
test('publish explains eligible claims and retries with an identical key/payload', async ({
  page,
}) => {
  const { commands } = await setup(page, {
    command: async (route, command, count) =>
      route.fulfill({
        status: count === 1 ? 503 : 200,
        contentType: 'application/json',
        body: JSON.stringify(
          count === 1
            ? { message: 'Temporary offline fixture' }
            : {
                ...announcement,
                state: 'published',
                display_state: 'scheduled',
                version: 'b'.repeat(32),
              },
        ),
      }),
  });
  await nav(page, 'announcements');
  await page.getByRole('button', { name: announcement.title, exact: true }).click();
  const d = dialog(page);
  await d.getByLabel('Decision rationale').fill('Approved member communication');
  await d.getByRole('button', { name: 'Review publication' }).click();
  await expect(d).toContainText('does not send a push');
  await d.getByRole('button', { name: 'Confirm action', exact: true }).click();
  await expect(d.getByRole('button', { name: 'Retry same action' })).toBeVisible();
  await d.getByRole('button', { name: 'Retry same action' }).click();
  await expect(d).toContainText('Saved successfully');
  expect(commands).toHaveLength(2);
  expect(commands[1]!).toEqual(commands[0]!);
});
test('community review shows exact options and confirms effect before accepting', async ({
  page,
}) => {
  const { commands } = await setup(page);
  await nav(page, 'suggestions');
  await page.getByRole('button', { name: suggestion.title, exact: true }).click();
  const d = dialog(page);
  await expect(d).toContainText('Synthetic Member');
  await expect(d.getByLabel('Choice 1',{exact:true})).toHaveValue('Tea');
  await expect(d.getByLabel('Choice 2',{exact:true})).toHaveValue('Coffee');
  await d.getByLabel('Decision rationale').fill('Balanced and suitable choices');
  await d.getByRole('button', { name: 'Accept into pool' }).click();
  await expect(d).toContainText('No Doji will be scheduled');
  await d.getByRole('button', { name: 'Confirm action', exact: true }).click();
  await expect(d).toContainText('Saved successfully');
  expect(commands[0]!).toMatchObject({
    kind: 'suggestions',
    action: 'approved',
    id,
    version,
    input: {},
  });
});
test('read-only employee sees no publishing or review controls', async ({ page }) => {
  await setup(page, {
    readOnly: true,
    session: {
      ...operatorSession,
      roles: ['operations'],
      capabilities: { ...operatorSession.capabilities, operator_manage: false },
    },
  });
  await nav(page, 'announcements');
  await expect(page.getByRole('button', { name: 'New announcement', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: announcement.title, exact: true }).click();
  await expect(dialog(page).getByRole('button', { name: 'Review publication' })).toHaveCount(0);
});
test('late command completion cannot reopen content after locking the workspace', async ({
  page,
}) => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { commands } = await setup(page, {
    command: async (route) => {
      await wait;
      await route
        .fulfill({ contentType: 'application/json', body: JSON.stringify(announcement) })
        .catch(() => {});
    },
  });
  await nav(page, 'announcements');
  await page.getByRole('button', { name: announcement.title, exact: true }).click();
  const d = dialog(page);
  await d.getByLabel('Decision rationale').fill('Approved synthetic notice');
  await d.getByRole('button', { name: 'Review publication' }).click();
  await d.getByRole('button', { name: 'Confirm action', exact: true }).click();
  await expect.poll(() => commands.length).toBe(1);
  // Session invalidation is dispatched by the existing lock action; modal makes the normal toolbar inert.
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-action="exit-demo"]')!.click());
  release();
  await expect(d).not.toBeVisible();
  await expect(d).toBeEmpty();
});
test('bounded pages use authoritative cursor, not local slicing', async ({ page }) => {
  const { reads } = await setup(page, {
    read: async (route, url, item) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          items: [item],
          can_write: true,
          next_cursor: url.searchParams.has('beforeId')
            ? null
            : { at: item.created_at, id: item.id },
        }),
      }),
  });
  await nav(page, 'announcements');
  const host = page.locator('[data-portal-view="announcements"] .editorialWorkspace');
  await host.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(host).toContainText('Page 2');
  expect(reads.at(-1)!.searchParams.get('beforeId')).toBe(id);
  await host.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(host).toContainText('Page 1');
});
test('failed read stays visibly unavailable rather than showing an empty healthy queue', async ({
  page,
}) => {
  await setup(page, {
    read: async (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Offline fixture' }),
      }),
  });
  await nav(page, 'suggestions');
  await expect(page.locator('.editorialPageStatus.error')).toContainText('Could not load records');
});
test('status filters are server-side and reset the paging cursor', async ({ page }) => {
  const { reads } = await setup(page);
  await nav(page, 'suggestions');
  const host = page.locator('[data-portal-view="suggestions"] .editorialWorkspace');
  await host.getByRole('combobox', { name: 'Status', exact: true }).click();
  await host.getByRole('option', { name: 'Pending review', exact: true }).click();
  await expect.poll(() => reads.at(-1)!.searchParams.get('filter')).toBe('pending');
  expect(reads.at(-1)!.searchParams.has('beforeId')).toBe(false);
});

test('editorial dialogs reuse portal controls with keyboard selection and independent Escape', async ({ page }) => {
  const { commands } = await setup(page);
  await nav(page, 'announcements');
  const opener = page.getByRole('button', { name: 'New announcement', exact: true });
  await opener.click();
  const d = dialog(page);
  await expect(d).toHaveClass(/portalModal/);
  await expect(d.locator('.modalHeader .drawerCloseButton')).toBeVisible();
  const destination = d.getByRole('combobox', { name: 'Destination', exact: true });
  await expect(destination).toHaveClass('portalSelectTrigger');
  await destination.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.press('Escape');
  await expect(destination).toHaveAttribute('aria-expanded', 'false');
  await expect(d.locator('select[name="cta_url"]')).toHaveValue('');
  await expect(d).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(d.locator('select[name="cta_url"]')).toHaveValue('/(app)/suggest-challenge');
  await expect(destination).toBeFocused();
  await expect(d.locator('.portalSelect .portalSelect')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(d).not.toBeVisible();
  await expect(opener).toBeFocused();
  expect(commands).toHaveLength(0);
  await nav(page, 'suggestions');
  await page.getByRole('button', { name: suggestion.title, exact: true }).click();
  await expect(d.locator('.field textarea#editorialReason')).toBeVisible();
  await expect(d.locator('.drawerHeader .drawerCloseButton')).toBeVisible();
});
test('saved receipt for a deleted record is not presented as a failed decision', async ({
  page,
}) => {
  await setup(page, {
    command: async (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ id, outcome: 'saved', item_unavailable: true }),
      }),
  });
  await nav(page, 'suggestions');
  await page.getByRole('button', { name: suggestion.title, exact: true }).click();
  const d = dialog(page);
  await d
    .getByLabel('Decision rationale (member-visible)')
    .fill('Previously reviewed synthetic idea');
  await d.getByRole('button', { name: 'Decline idea' }).click();
  await d.getByRole('button', { name: 'Confirm action', exact: true }).click();
  await expect(d).toContainText('Action already recorded');
  await expect(d).toContainText('not submitted again');
  await expect(d.getByRole('button', { name: 'Confirm action', exact: true })).toHaveCount(0);
});
for (const width of [390, 1440])
  for (const theme of ['light', 'dark']) {
    test(`editorial form is accessible and fits ${width}px in ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await setup(page);
      await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
      if (width < 600) await page.locator('#mobileMenu').click();
      await nav(page, 'announcements');
      await page.getByRole('button', { name: 'New announcement', exact: true }).click();
      const d = dialog(page);
      await expect(d).toBeVisible();
      const results = await new AxeBuilder({ page }).include('.editorialDialog').analyze();
      expect(results.violations.filter((v) => ['serious', 'critical'].includes(v.impact || ''))).toEqual(
        [],
      );
      expect(await d.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      const actions=d.locator('.editorialActions');
      await expect(actions).toHaveCSS('justify-content','flex-end');
      if (width > 600) {
        const start = must(await d.locator('[name="starts_at"]').boundingBox());
        const end = must(await d.locator('[name="ends_at"]').boundingBox());
        expect(Math.abs(start.y - end.y)).toBeLessThanOrEqual(1);
      }
      await d.getByRole('button', { name: 'Help: Starts at', exact: true }).click();
      await expect(d.locator('.contextualHelp:popover-open')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(d).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`editorial-${theme}-${width}.png`),
        fullPage: true,
      });
      await page.keyboard.press('Escape');
      await expect(d).not.toBeVisible();
    });
  }
