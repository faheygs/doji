import { test, expect } from '../../coverage-fixture.mts';
import type { Page } from '@playwright/test';
import type { BusinessConfig } from '../application-client.mts';

type Surface = 'access' | 'application';
interface Options {
  patch?: Partial<BusinessConfig>;
  remove?: string;
  failure?: string;
  primitive?: boolean;
  authResult?: unknown;
  recovery?: boolean;
}
// Real page modules and client, synthetic HTTP only. Non-Error failures test
// browser/provider boundary handling; they are never sent to a live service.
async function mount(page: Page, surface: Surface, options: Options = {}) {
  const calls: string[] = [];
  const config: BusinessConfig = {
    enabled: true,
    supabaseUrl: 'https://business-test.supabase.co',
    anonKey: 'synthetic-public',
    termsUrl: 'https://example.test/terms',
    privacyUrl: 'https://example.test/privacy',
    termsVersion: 'test-v1',
    privacyVersion: 'test-p1',
    ...options.patch,
  };
  await page.addInitScript((value) => { window.DOJI_BUSINESS_APPLICATION_CONFIG = value; }, config);
  await page.route('**/business-portal/config.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: `window.DOJI_BUSINESS_APPLICATION_CONFIG=${JSON.stringify(config)}` }),
  );
  await page.route(`**/business-portal/${surface}/`, async (route) => {
    const response = await route.fetch();
    const headers = response.headers();
    const csp = headers['content-security-policy'];
    if (csp) headers['content-security-policy'] = csp.replaceAll('https://tvixsmqxotuvyjqzmjla.supabase.co', config.supabaseUrl);
    let body = await response.text();
    if (options.remove) body = body.replace(`id="${options.remove}"`, 'id="removed-for-test"');
    await route.fulfill({ response, headers, body });
  });
  await page.addInitScript(({ failure, primitive }) => {
    if (!failure) return;
    const original = window.fetch;
    window.fetch = async (...args) => {
      const input = args[0];
      const url = input instanceof Request ? input.url : String(input);
      const method = args[1]?.method || 'GET';
      if (url.includes(failure) && (failure !== '/user' || method === 'PUT')) {
        if (primitive) throw 'Synthetic transport failure';
        throw Error('Synthetic transport failure');
      }
      return original(...args);
    };
  }, { failure: options.failure, primitive: options.primitive });
  const user = { id: 'synthetic-business', role: 'doji_business', email_confirmed_at: '2026-01-01', app_metadata: { account_type: 'business' }, factors: [] };
  const session = { user, access_token: `e30.${Buffer.from('{"aal":"aal2"}').toString('base64url')}.test`, refresh_token: 'synthetic', expires_in: 3600 };
  await page.route('https://business-test.supabase.co/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    calls.push(path);
    if (path.endsWith('/business-auth')) {
      const body: unknown = route.request().postDataJSON();
      const action = body && typeof body === 'object' && 'action' in body ? body.action : '';
      return route.fulfill({ json: action === 'signin' ? session : action === 'verify' ? { ...session, business_flow: 'recovery' } : options.authResult ?? {} });
    }
    if (path.endsWith('/user')) return route.fulfill({ json: user });
    if (path.endsWith('get_business_application_v1')) return route.fulfill({ json: { revision: 1, state: 'approved', details: {} } });
    return route.fulfill({ json: {} });
  });
  await page.goto(`/business-portal/${surface}/${options.recovery ? '#ticket=synthetic-ticket' : ''}`);
  return calls;
}
async function submit(page: Page, id: string, inputSubmitter = false) {
  await page.locator(`#${id}`).evaluate((node, useInput) => {
    if (!(node instanceof HTMLFormElement)) throw Error('Expected form');
    const button = document.createElement(useInput ? 'input' : 'button');
    button.type = 'submit';
    node.append(button);
    node.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: button }));
  }, inputSubmitter);
}
async function register(page: Page) {
  await page.locator('#accountTerms').check();
  await page.locator('#accountPrivacy').check();
  await submit(page, 'accountForm');
}

for (const surface of ['access', 'application'] as const) {
  test(`${surface}: missing required markup fails closed with useful feedback`, async ({ page }) => {
    const remove = surface === 'access' ? 'accessContent' : 'businessAccessForm';
    await mount(page, surface, { remove });
    await expect(page.locator(surface === 'access' ? '#accessMessage' : '#businessApplicationMessage')).toContainText(`Missing business ${surface} control: ${remove}`);
  });
  for (const primitive of [false, true]) {
    test(`${surface}: transport ${primitive ? 'string' : 'Error'} rejection unlocks the form`, async ({ page }) => {
      await mount(page, surface, { failure: '/business-auth', primitive });
      if (surface === 'access') await register(page);
      else await submit(page, 'businessAccessForm', true);
      await expect(page.locator(surface === 'access' ? '#accessMessage' : '#businessApplicationMessage')).toHaveText('Synthetic transport failure');
      await expect(page.locator(surface === 'access' ? '#accountSubmit' : '#businessAccessForm input[type=submit]')).toBeEnabled();
    });
  }
}
for (const key of ['termsUrl', 'privacyUrl', 'termsVersion', 'privacyVersion'] as const) {
  test(`access: absent ${key} keeps registration closed`, async ({ page }) => {
    const calls = await mount(page, 'access', { patch: { [key]: undefined } });
    await submit(page, 'accountForm');
    await expect(page.locator('#accessMessage')).toContainText('registration is closed');
    expect(calls).toEqual([]);
  });
}
for (const authResult of [{}, { message: 123 }, 'unexpected']) {
  test(`access: malformed success feedback stays blank (${JSON.stringify(authResult)})`, async ({ page }) => {
    const calls = await mount(page, 'access', { authResult });
    await register(page);
    await expect.poll(() => calls.length).toBe(1);
    await expect(page.locator('#accountSubmit')).toBeEnabled();
    await expect(page.locator('#accessMessage')).toHaveText('');
  });
}
for (const primitive of [false, true]) {
  test(`access: verification failure is recoverable (${primitive})`, async ({ page }) => {
    await mount(page, 'access', { recovery: true, failure: '/business-auth', primitive });
    await page.locator('#verifyLink').click();
    await expect(page.locator('#accessMessage')).toHaveText('Synthetic transport failure');
    await expect(page.locator('#verifyLink')).toBeEnabled();
  });
  test(`access: password rejection preserves recovery mode (${primitive})`, async ({ page }) => {
    await mount(page, 'access', { recovery: true, failure: '/user', primitive });
    await page.locator('#verifyLink').click();
    await expect(page.locator('#passwordForm')).toBeVisible();
    await page.locator('#replacementPassword').fill('synthetic-long-password');
    await page.locator('#repeatPassword').fill('synthetic-long-password');
    await submit(page, 'passwordForm', true);
    await expect(page.locator('#accessMessage')).toHaveText('Synthetic transport failure');
    await expect(page.locator('#passwordForm')).toBeVisible();
  });
  test(`application: workspace rejection unlocks action (${primitive})`, async ({ page }) => {
    await mount(page, 'application', { failure: 'get_business_workspace_v1', primitive });
    await submit(page, 'businessAccessForm');
    await page.locator('#businessOpenWorkspace').click();
    await expect(page.locator('#businessApplicationMessage')).toHaveText('Synthetic transport failure');
    await expect(page.locator('#businessOpenWorkspace')).toBeEnabled();
  });
}
test('access: password saved but logout failed locks recovery with truthful feedback', async ({ page }) => {
  await mount(page, 'access', { recovery: true, failure: '/logout' });
  await page.locator('#verifyLink').click();
  await expect(page.locator('#passwordForm')).toBeVisible();
  await page.locator('#replacementPassword').fill('synthetic-long-password');
  await page.locator('#repeatPassword').fill('synthetic-long-password');
  await submit(page, 'passwordForm');
  await expect(page.locator('#accessMessage')).toContainText('Password saved and this page is locked');
  await expect(page.locator('#passwordForm')).toBeHidden();
});
test('application: non-controls and unnamed controls do not dirty a draft', async ({ page }) => {
  await mount(page, 'application');
  await submit(page, 'businessAccessForm');
  await expect(page.locator('#applicationWorkspace')).toBeVisible();
  const result = await page.locator('#applicationFields').evaluate((root) => {
    for (const tag of ['div', 'input', 'select', 'textarea']) {
      const node = document.createElement(tag);
      root.append(node);
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
      node.remove();
    }
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    const textarea = document.createElement('textarea');
    textarea.name = 'purpose';
    textarea.value = 'Synthetic draft edit';
    root.append(textarea);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    return { clean: clean.defaultPrevented, dirty: dirty.defaultPrevented };
  });
  expect(result).toEqual({ clean: false, dirty: true });
});
test('application: a submit without a submitter does not authenticate', async ({ page }) => {
  const calls = await mount(page, 'application');
  await page.locator('#businessAccessForm').evaluate((node) => node.dispatchEvent(new SubmitEvent('submit', { cancelable: true })));
  expect(calls).toEqual([]);
  await expect(page.locator('#businessApplicationMessage')).toHaveText('');
});
