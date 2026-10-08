import { must } from "../../test-contracts.mts";
import type { Page } from "@playwright/test";
import { test, expect } from '../../coverage-fixture.mts';
import type {BusinessReviewClient,createBusinessReview} from '../../admin-portal/business-applications.mts';
interface RealtimeFixture {closed:number;topics:string[];connection?:(state:{current:string;previous?:string})=>void;channel?:(state:{current:string;resumed?:boolean})=>void;message?:(message:{name:string;data:Record<string,unknown>})=>void}
declare global {interface Window {
 businessRealtimeTest:RealtimeFixture;
 reviewCommands:Parameters<BusinessReviewClient['command']>[0][];
 reviewRevision:number;reviewModule:ReturnType<typeof createBusinessReview>;
}}
const url = '/business-portal/application/';
test.beforeEach(async ({ page }) => {
  await page.route('**/business-portal/config.js', route => route.fulfill({contentType:'text/javascript',body:'// test config supplied by init script'}));
});
const details = {
  legal_name: 'Example LLC',
  brand_name: 'Example',
  website: 'https://example.test',
  country: 'US',
  business_address: '123 Example Street',
  representative_name: 'Example Owner',
  representative_role: 'Owner',
  category: 'Technology',
  purpose: 'A future campaign',
};
async function setup(
  page: Page,
  { terms = true, state = 'draft', realtime = false, readFailure = false }: {terms?:boolean;state?:string;realtime?:boolean;readFailure?:boolean|'malformed'} = {},
) {
  // Preserve the site's CSP while substituting only the fully intercepted test API origin.
  await page.route('http://127.0.0.1:*/business-portal/application/', async (route) => {
    const response = await route.fetch();
    const headers = response.headers();
    headers['content-security-policy'] = headers['content-security-policy']!.replaceAll(
      'https://tvixsmqxotuvyjqzmjla.supabase.co',
      'https://business-test.supabase.co',
    );
    await route.fulfill({ response, headers });
  });
  await page.addInitScript(
    ({ terms, realtime }) => {
      window.DOJI_BUSINESS_APPLICATION_CONFIG = {
        enabled: true,
        realtimeEnabled: realtime,
        supabaseUrl: 'https://business-test.supabase.co',
        anonKey: 'test-public',
        ...(terms
          ? {
              termsVersion: 'test-v1',
              privacyVersion: 'test-p1',
              termsUrl: 'https://example.test/terms',
              privacyUrl: 'https://example.test/privacy',
            }
          : {}),
      };
      if (realtime) {
        const state:RealtimeFixture = (window.businessRealtimeTest = { closed: 0, topics: [] });
        // This boundary deliberately supplies only the SDK methods exercised by the UI.
        Object.defineProperty(window,'Ably',{configurable:true,value:{
          Realtime: class {
            options:{authCallback:(params:Record<string,unknown>,callback:()=>void)=>void};
            constructor(options:{authCallback:(params:Record<string,unknown>,callback:()=>void)=>void}) {
              this.options = options;
            }
            connection = {
              on: (fn:NonNullable<RealtimeFixture['connection']>) => {
                state.connection = fn;
              },
              off() {},
            };
            channels = {
              get: (topic:string) => {
                state.topics.push(topic);
                return {
                  on: (fn:NonNullable<RealtimeFixture['channel']>) => {
                    state.channel = fn;
                  },
                  off() {},
                  unsubscribe() {},
                  subscribe: async (_name:string, fn:NonNullable<RealtimeFixture['message']>) => {
                    state.message = fn;
                  },
                };
              },
            };
            connect() {
              this.options.authCallback({}, () => {});
            }
            close() {
              state.closed++;
            }
          },
        }});
      }
    },
    { terms, realtime },
  );
  let application = {
    id: 'test-app',
    revision: 1,
    state,
    details,
    response: state === 'changes_requested' ? 'Please correct the address.' : '',
  };
  const commands:(Record<string,unknown>&{p_details:Record<string,unknown>})[] = [];
  let reads = 0,
    tokens = 0,
    readGate:Promise<void>|null = null;
  await page.route('https://business-test.supabase.co/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('business-auth'))
      return route.fulfill({
        json: {
          user: {
            id: '78000000-0000-4000-8000-000000000001',
            role: 'doji_business',
            app_metadata: { account_type: 'business' },
            email_confirmed_at: '2026-09-29',
          },
          access_token: 'test-access',
          refresh_token: 'test-refresh',
          expires_in: 3600,
        },
      });
    if (path.endsWith('business-realtime-token')) {
      tokens++;
      expect(route.request().headers().authorization).toBe('Bearer test-access');
      expect(route.request().postDataJSON()).toEqual({});
      return route.fulfill({
        json: {
          topic: 'business:78000000-0000-4000-8000-000000000001:events',
          tokenRequest: { clientId: 'business:78000000-0000-4000-8000-000000000001' },
        },
      });
    }
    if (path.endsWith('get_business_application_v1')) {
      reads++;
      if (readGate) await readGate;
      if (readFailure === 'malformed') return route.fulfill({ body: 'not-json', status: 200 });
      if (readFailure)
        return route.fulfill({ json: { message: 'Temporarily unavailable' }, status: 503 });
      return route.fulfill({ json: application });
    }
    if (path.endsWith('business_application_command_v1')) {
      const body = route.request().postDataJSON();
      commands.push(body);
      application = {
        ...application,
        revision: application.revision + 1,
        state: body.p_action === 'submit' ? 'pending' : 'draft',
        details: body.p_details,
      };
      return route.fulfill({ json: { application } });
    }
    if (path.endsWith('logout')) return route.fulfill({ json: {} });
    throw Error(`Unexpected request: ${path}`);
  });
  await page.goto(url);
  await page.getByLabel('Business email', { exact: true }).fill('owner@test.invalid');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your business application' })).toBeVisible();
  await expect(page.locator('#applicationRefresh')).toBeEnabled();
  return {
    commands,
    failReads: (value:boolean|'malformed') => {
      readFailure = value;
    },
    holdReads: (value:Promise<void>|null) => {
      readGate = value;
    },
    counts: () => ({ reads, tokens }),
    change: (value:Partial<typeof application>) => {
      application = { ...application, ...value };
    },
  };
}

const hint = {
  name: 'business.application.updated',
  data: {
    applicationId: '78000000-0000-4000-8000-000000000003',
    aggregateId: '78000000-0000-4000-8000-000000000003',
    applicantId: '78000000-0000-4000-8000-000000000001',
    eventId: '78000000-0000-4000-8000-000000000004',
    occurredAt: '2026-09-29T00:00:00Z',
    sendPush: false,
  },
};
test('business realtime handles private hint, preserves draft and clears on logout', async ({
  page,
}) => {
  const f = await setup(page, { realtime: true });
  await expect.poll(() => f.counts().reads).toBe(2);
  await page.getByLabel('Legal business name', { exact: true }).fill('Unsaved LLC');
  f.change({
    revision: 2,
    state: 'changes_requested',
    details: { ...details, legal_name: 'Server LLC' },
  });
  await page.evaluate((hint) => window.businessRealtimeTest.message!(hint), hint);
  await expect(page.locator('#applicationStale')).toBeVisible();
  await expect(page.getByLabel('Legal business name', { exact: true })).toHaveValue('Unsaved LLC');
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
  expect(f.counts().tokens).toBe(1);
  await page.locator('#businessSignout').click();
  await expect(page.locator('#applicationWorkspace')).toBeHidden();
  expect(await page.evaluate(() => window.businessRealtimeTest.closed)).toBe(1);
  const reads = f.counts().reads;
  await page.evaluate((hint) => window.businessRealtimeTest.message!(hint), {
    ...hint,
    data: { ...hint.data, eventId: hint.data.applicationId },
  });
  expect(f.counts().reads).toBe(reads);
});
test('business reconnect and channel discontinuity reload missed authoritative changes', async ({
  page,
}) => {
  const f = await setup(page, { realtime: true });
  await expect.poll(() => f.counts().reads).toBe(2);
  f.change({
    revision: 2,
    state: 'changes_requested',
    response: 'Review changed during disconnection.',
  });
  await page.evaluate(() => window.businessRealtimeTest.connection!({ current: 'connected' }));
  await expect(page.getByText('Review changed during disconnection.')).toBeVisible();
  f.change({ revision: 3, response: 'Recovered partial gap.' });
  await page.evaluate(() =>
    window.businessRealtimeTest.channel!({ current: 'attached', resumed: false }),
  );
  await expect(page.getByText('Recovered partial gap.')).toBeVisible();
});
test('business subscription rejects cross-account and duplicate hints; foreground restarts once', async ({
  page,
}) => {
  const f = await setup(page, { realtime: true });
  await expect.poll(() => f.counts().reads).toBe(2);
  await page.evaluate((h) => window.businessRealtimeTest.message!(h), {
    ...hint,
    data: { ...hint.data, applicantId: hint.data.eventId },
  });
  expect(f.counts().reads).toBe(2);
  await page.evaluate((h) => {
    window.businessRealtimeTest.message!(h);
    window.businessRealtimeTest.message!(h);
  }, hint);
  await expect.poll(() => f.counts().reads).toBe(3);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => window.businessRealtimeTest.closed)).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => f.counts().tokens).toBe(2);
  expect(await page.evaluate(() => window.businessRealtimeTest.topics)).toEqual([
    'business:78000000-0000-4000-8000-000000000001:events',
    'business:78000000-0000-4000-8000-000000000001:events',
  ]);
});
test('default off: no API request or demo fallback', async ({ page }) => {
  let external = 0;
  page.on('request', (r) => {
    if (!new URL(r.url()).hostname.match(/127.0.0.1/)) external++;
  });
  await page.goto(url);
  await expect(page.getByText('Applications are not open yet.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeHidden();
  expect(external).toBe(0);
});
for (const width of [390, 1440])
  for (const theme of ['light', 'dark'])
    test(`application shared form ${width} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 950 });
      await page.addInitScript((theme) => localStorage.setItem('doji-portal-theme', theme), theme);
      await setup(page, { state: 'changes_requested' });
      await expect(page.getByText('Please correct the address.')).toBeVisible();
      const refreshBox = must(await page.locator('#applicationRefresh').boundingBox());
      const headingBox = must(await page.locator('.applicationHeading').boundingBox());
      expect(
        Math.abs(refreshBox.x + refreshBox.width - headingBox.x - headingBox.width),
      ).toBeLessThan(2);
      await expect(page.getByRole('combobox', { name: 'Industry', exact: true })).toBeVisible();
      await page.getByRole('combobox', { name: 'Industry', exact: true }).click();
      await page.getByRole('option', { name: 'Other', exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: info.outputPath('application.png'), fullPage: true });
    });
test('save uses current record/revision, no PII stored in browser', async ({ page }) => {
  const f = await setup(page);
  await page.getByLabel('Legal business name', { exact: true }).fill('Changed LLC');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect.poll(() => f.commands.length).toBe(1);
  expect(f.commands[0]!.p_revision).toBe(1);
  expect(f.commands[0]!.p_details.legal_name).toBe('Changed LLC');
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toMatch(/Changed|test-access|test-refresh/);
});
test('terms required and exact versions submitted, pending is readonly', async ({ page }) => {
  const f = await setup(page);
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.locator('#businessApplicationMessage')).toContainText('Accept the current');
  expect(f.commands).toHaveLength(0);
  await page.locator('#businessTerms').check();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.locator('#applicationState')).toHaveText('Pending review');
  expect(f.commands[0]!.p_terms_version).toBe('test-v1');
  await expect(page.getByLabel('Legal business name', { exact: true })).toHaveAttribute(
    'readonly',
    '',
  );
  await expect(page.getByRole('button', { name: 'Submit for review' })).toBeHidden();
});
test('missing legal setup prevents submission but allows draft save', async ({ page }) => {
  await setup(page, { terms: false });
  await expect(page.getByRole('button', { name: 'Submit for review' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeEnabled();
});
test('refresh preserves dirty form and requires explicit discard when changed', async ({
  page,
}) => {
  const f = await setup(page);
  await page.getByLabel('Public brand name', { exact: true }).fill('Keep my draft');
  f.change({ revision: 2, state: 'changes_requested' });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.locator('#applicationStale')).toBeVisible();
  await expect(page.getByLabel('Public brand name', { exact: true })).toHaveValue('Keep my draft');
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Load current record' }).click();
  await expect(page.getByLabel('Public brand name', { exact: true })).toHaveValue('Example');
});
test('signout clears application and returning sign-in renders fields again', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.locator('#applicationFields')).toBeEmpty();
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Legal business name', { exact: true })).toHaveValue('Example LLC');
});

for (const failure of [true, 'malformed'] as const)
  test(`initial read failure (${failure}) cannot masquerade as a new application`, async ({
    page,
  }) => {
    const f = await setup(page, { readFailure: failure });
    await expect(page.locator('#applicationReadStatus')).toContainText('could not be loaded');
    await expect(page.locator('#businessApplicationForm')).toBeHidden();
    await expect(page.locator('#applicationFields')).toBeEmpty();
    expect(f.commands).toHaveLength(0);
    f.failReads(false);
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.getByLabel('Legal business name', { exact: true })).toHaveValue(
      'Example LLC',
    );
    await expect(page.locator('#applicationReadStatus')).toContainText('Last checked');
    expect(f.counts()).toEqual({ reads: 2, tokens: 0 });
  });

test('foreground refresh shows progress and preserves input focus, edits and consent on failure', async ({
  page,
}) => {
  const f = await setup(page);
  const name = page.getByLabel('Legal business name', { exact: true });
  await name.fill('Keep my draft');
  await page.locator('#businessTerms').check();
  await name.focus();
  f.failReads(true);
  let release!: () => void;
  f.holdReads(
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('#applicationReadStatus')).toContainText('Checking application status');
  await expect(page.locator('#applicationRefresh')).toBeDisabled();
  await expect(name).toBeFocused();
  await name.fill('Still typing');
  release();
  await expect(page.locator('#applicationReadStatus')).toContainText('could not be refreshed');
  await expect(name).toHaveValue('Still typing');
  await expect(name).toBeFocused();
  await expect(page.locator('#businessTerms')).toBeChecked();
  await expect(page.locator('#applicationStale')).toBeHidden();
  f.failReads(false);
  f.holdReads(null);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.locator('#applicationReadStatus')).toContainText('Last checked');
  await expect(name).toHaveValue('Still typing');
  expect(f.commands).toHaveLength(0);
  expect(f.counts()).toEqual({ reads: 3, tokens: 0 });
});

async function review(page: Page, write = true) {
  await page.goto(url);
  await page.addStyleTag({ url: '/admin-portal/admin.css' });
  await page.evaluate(
    async ({ details, write }) => {
      document.body.classList.add('adminPortalPage');
      const root = document.createElement('section');
      document.body.append(root);
      const moduleUrl='/admin-portal/business-applications.js';
      const { createBusinessReview }:typeof import('../../admin-portal/business-applications.mts') = await import(moduleUrl);
      window.reviewCommands = [];
      window.reviewRevision = 2;
      const item = {
        id: 'review-app',
        revision: 2,
        state: 'pending',
        details,
        latest_submission: { submission: 1, terms_version: 'v1', privacy_version: 'p1' },
        history: [{ action: 'submit', response: '', internal_note: '' }],
      };
      window.reviewModule = createBusinessReview({
        enabled: true,
        root,
        session: () => ({ capabilities: { business_read: true, operator_manage: write } }),
        epoch: () => 1,
        client: {
          detail: async () => ({ ...item, revision: window.reviewRevision }),
          page: async () => ({
            items: [{ ...item, brand_name: details.brand_name }],
            next_cursor: null,
          }),
          command: async (body) => {
            window.reviewCommands.push(body);
            return {
              application: {
                ...item,
                revision: 3,
                state: body.p_action === 'approve' ? 'approved' : 'declined',
              },
            };
          },
        },
      });
      await window.reviewModule.load();
    },
    { details, write },
  );
  await page.getByRole('row', { name: 'Review Example', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
for (const width of [390, 1440])
  test(`review uses readonly submitted form in right drawer ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 950 });
    await review(page);
    const dialog = page.getByRole('dialog');
    const bounds = must(await dialog.boundingBox());
    expect(Math.abs(bounds.x + bounds.width - width)).toBeLessThan(2);
    await expect(dialog.getByLabel('Legal business name', { exact: true })).toHaveAttribute(
      'readonly',
      '',
    );
    await expect(dialog.getByRole('combobox', { name: 'Decision', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('business-review.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
test('review requires explicit confirmation and preserves exact ID/revision', async ({ page }) => {
  await review(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Decision', exact: true }).click();
  await dialog.getByRole('option', { name: 'Approve', exact: true }).click();
  await dialog
    .getByLabel('Response to applicant', { exact: true })
    .fill('Your application is approved.');
  await dialog
    .getByLabel('Internal review rationale', { exact: true })
    .fill('Synthetic representative verification complete.');
  await dialog.getByRole('button', { name: 'Review decision', exact: true }).click();
  expect(await page.evaluate(() => window.reviewCommands.length)).toBe(0);
  await dialog.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(dialog.getByLabel('Internal review rationale', { exact: true })).toHaveValue(
    'Synthetic representative verification complete.',
  );
  await dialog.getByRole('button', { name: 'Review decision', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.reviewCommands.length)).toBe(1);
  const [body] = await page.evaluate(() => window.reviewCommands);
  expect(body!.p_id).toBe('review-app');
  expect(body!.p_revision).toBe(2);
  expect(body!.p_internal_note).toContain('verification');
});
test('read-only business reviewer cannot decide', async ({ page }) => {
  await review(page, false);
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Review decision' }),
  ).toBeHidden();
  expect(await page.evaluate(() => window.reviewCommands)).toEqual([]);
});
test('event while reviewing preserves notes and blocks decision; logout clears', async ({
  page,
}) => {
  await review(page);
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Internal review rationale', { exact: true })
    .fill('Keep my review draft.');
  await page.evaluate(() => {
    window.reviewRevision = 3;
    return window.reviewModule.reconcile();
  });
  await expect(dialog.getByRole('status')).toContainText('This case changed');
  await expect(dialog.getByLabel('Internal review rationale', { exact: true })).toHaveValue(
    'Keep my review draft.',
  );
  await page.evaluate(() => window.reviewModule.clear());
  await expect(dialog).toBeHidden();
  await expect(page.locator('dialog')).toBeEmpty();
});
test('unchanged review event does not invent a stale warning', async ({ page }) => {
  await review(page);
  await page.evaluate(() => window.reviewModule.reconcile());
  await expect(page.getByRole('dialog').getByRole('status')).toBeEmpty();
});
