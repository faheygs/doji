import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
const base = 'https://business.dojipro.com';
const runtimeErrors = new WeakMap<Page, string[]>();
async function packageReleaseConfig() {
  const root = resolve(process.env.DOJI_BUSINESS_PACKAGE!);
  const html = await readFile(resolve(root, 'business-portal/access/index.html'), 'utf8');
  const path = html.match(/src="(\/react-business\/[a-z0-9-]+\/release-config\.js)"/)?.[1];
  expect(path).toBeTruthy();
  const body = await readFile(resolve(root, '.' + path!), 'utf8');
  return JSON.parse(body.match(/Object\.freeze\((.+)\);/)![1]!) as {
    registrationUntil: string;
    acceptanceExistingAccount?: boolean;
  };
}
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
});
const details = {
  legal_name: 'Synthetic company',
  brand_name: 'Synthetic brand',
  website: 'https://example.com',
  country: 'US',
  representative_name: 'Test owner',
  representative_role: 'Owner',
  category: 'Technology',
  purpose: 'Synthetic offline application',
};
async function fixture(
  page: Page,
  request: APIRequestContext,
  options: {
    signedIn?: boolean;
    setup?: boolean;
    state?: string;
    slow?: boolean;
    uncertain?: boolean;
    authUrl?: string;
    ownedAuth?: boolean;
    legacyAuth?: boolean;
    maintenance?: boolean;
    acceptanceUntil?: string;
    acceptanceExistingAccount?: boolean;
    ownedMfa?: boolean;
    ownedReset?: 'reset-done' | 'reset-pending' | 'lost';
  } = {},
) {
  let signedIn = options.signedIn ?? true;
  let assurance = 'aal1';
  let profile = {
    organization_id: '21000000-0000-4000-8000-000000000001',
    application_id: '20000000-0000-4000-8000-000000000002',
    brand_name: 'Synthetic brand',
    role: 'owner',
    revision: 0,
    setup_complete: false,
    campaigns_enabled: false,
    billing_enabled: false,
    details: {
      website: 'https://example.com',
      description: '',
      primary_color: '#123456',
      secondary_color: '#ABCDEF',
      logo: '',
    },
  };
  let application: Record<string, unknown> | null = options.state
    ? { id: '20000000-0000-4000-8000-000000000002', revision: 1, state: options.state, details }
    : null;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const calls: string[] = [];
  const commands: Record<string, unknown>[] = [];
  const authStarts: Record<string, unknown>[] = [];
  const external: string[] = [];
  const override =
    options.setup ||
    options.ownedAuth ||
    options.maintenance ||
    options.acceptanceUntil ||
    options.acceptanceExistingAccount
      ? {
          registrationUntil: '2099-01-01T00:00:00Z',
          ownedAuthEnabled: true,
          setupEnabled: options.setup === true,
          maintenanceEnabled: options.maintenance === true,
          ...(options.acceptanceUntil ? { acceptanceUntil: options.acceptanceUntil } : {}),
          ...(options.acceptanceExistingAccount ? { acceptanceExistingAccount: true } : {}),
        }
      : options.legacyAuth
        ? {
            registrationUntil: process.env.DOJI_BUSINESS_PACKAGE
              ? (await packageReleaseConfig()).registrationUntil
              : '2099-01-01T00:00:00Z',
            ownedAuthEnabled: false,
          setupEnabled: false,
          }
        : null;
  if (override)
    await page.addInitScript((config) => {
      window.DOJI_REACT_BUSINESS_CONFIG = config;
    }, override);
  await page.routeWebSocket('**/*', (socket) => socket.close());
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === 'https://challenges.cloudflare.com') {
      await route.fulfill({
        contentType: 'text/javascript',
        body: 'window.turnstile={render:(root,options)=>{options.callback("offline-proof");return "fixture"},remove:()=>{},reset:()=>{}};',
      });
      return;
    }
    if (url.origin !== base) {
      external.push(url.origin);
      if (url.origin === 'https://api.workos.com') {
        await route.fulfill({
          contentType: 'text/html',
          body: '<h1>Offline sign-in provider</h1>',
        });
        return;
      }
      await route.abort();
      return;
    }
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
      calls.push(url.pathname);
      if (url.pathname === '/api/setup' && options.setup) {
        if (route.request().method() === 'POST') {
          const input = route.request().postDataJSON();
          commands.push(input);
          profile = {
            ...profile,
            revision: profile.revision + 1,
            details: input.details ?? profile.details,
            setup_complete: input.action === 'complete',
          };
        }
        await route.fulfill({ json: { profile } });
        return;
      }
      if (options.ownedAuth && url.pathname.startsWith('/auth/owned/')) {
        if (url.pathname === '/auth/owned/bootstrap') {
          await route.fulfill({ json: { csrf: 'b'.repeat(64) } });
          return;
        }
        authStarts.push(route.request().postDataJSON());
        if (url.pathname === '/auth/owned/reset' && options.ownedReset) {
          if (options.ownedReset === 'lost') await route.abort();
          else await route.fulfill({ json: { step: options.ownedReset } });
          return;
        }
        if (options.ownedMfa && url.pathname === '/auth/owned/signin') {
          await route.fulfill({ json: { step: 'mfa' } });
          return;
        }
        if (
          options.ownedMfa &&
          url.pathname === '/auth/owned/mfa' &&
          calls.filter((p) => p === '/auth/owned/mfa').length === 1
        ) {
          await route.fulfill({ json: { step: 'mfa', codeRejected: true } });
          return;
        }
        if (url.pathname === '/auth/owned/recover') {
          await route.fulfill({ json: { step: 'check-email' } });
          return;
        }
        if (url.pathname === '/auth/owned/register') {
          await route.fulfill({ json: { step: 'verify' } });
          return;
        }
        signedIn = true;
        await route.fulfill({ json: { step: 'complete' } });
        return;
      }
      if (url.pathname === '/api/session') {
        if (options.slow) await gate;
        await route.fulfill({
          status: signedIn ? 200 : 401,
          json: signedIn ? { signedIn: true, csrf: 'a'.repeat(43), assurance } : {},
        });
        return;
      }
      if (!signedIn && url.pathname !== '/auth/start') {
        await route.fulfill({ status: 401, json: {} });
        return;
      }
      if (url.pathname === '/api/application') {
        if (route.request().method() === 'GET') {
          await route.fulfill({ json: application });
          return;
        }
        const body = route.request().postDataJSON() as Record<string, unknown>;
        commands.push(body);
        if (options.uncertain && commands.length === 1) {
          await route.abort();
          return;
        }
        application = {
          id: '20000000-0000-4000-8000-000000000002',
          revision: Number(application?.revision || 0) + 1,
          state: body.p_action === 'submit' ? 'pending' : 'draft',
          details: body.p_details,
          submitted_at: body.p_action === 'submit' ? '2026-10-09T18:00:00Z' : null,
          history: [{ action: body.p_action, occurred_at: '2026-10-09T18:00:00Z' }],
        };
        await route.fulfill({ json: { application } });
        return;
      }
      if (url.pathname === '/auth/logout') {
        signedIn = false;
        await route.fulfill({ json: { signedIn: false, remoteConfirmed: true } });
        return;
      }
      if (url.pathname === '/auth/start') {
        authStarts.push(route.request().postDataJSON());
        await route.fulfill({
          json: {
            authorizationUrl:
              options.authUrl ??
              'https://api.workos.com/user_management/authorize?redirect_uri=https%3A%2F%2Fbusiness.dojipro.com%2Fauth%2Fcallback&state=fixture-state&code_challenge=fixture-challenge',
          },
        });
        return;
      }
      if (url.pathname === '/auth/mfa/prepare') {
        if (options.setup) {
          await route.fulfill({
            json: route.request().postDataJSON().enroll
              ? {
                  challengeReady: true,
                  enrollmentSecret: 'ABCDEFGHIJKLMNOP',
                  enrollmentQr:
                    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
                }
              : { enrollmentRequired: true },
          });
          return;
        }
        await route.fulfill({ json: { challengeReady: true } });
        return;
      }
      if (url.pathname === '/auth/mfa/complete') {
        assurance = 'aal2';
        await route.fulfill({ json: { assurance } });
        return;
      }
      if (url.pathname === '/api/workspace') {
        if (options.setup) {
          await route.fulfill({ json: { profile } });
          return;
        }
        await route.fulfill({
          json: {
            organization_id: 'offline-org',
            brand_name: 'Synthetic brand',
            role: 'owner',
            campaigns_enabled: false,
            billing_enabled: false,
          },
        });
        return;
      }
      await route.fulfill({ status: 400, json: {} });
      return;
    }
    if (process.env.DOJI_BUSINESS_PACKAGE) {
      // Exercise the same immutable bundle under each release gate. Only fixture
      // responses change; no release file or live configuration is modified.
      if (override && /^\/react-business\/[a-z0-9-]+\/release-config\.js$/.test(url.pathname)) {
        await route.fulfill({
          contentType: 'text/javascript',
          body: `window.DOJI_REACT_BUSINESS_CONFIG=Object.freeze(${JSON.stringify(override)});`,
        });
        return;
      }
      const root = resolve(process.env.DOJI_BUSINESS_PACKAGE);
      const target = resolve(
        root,
        '.' + url.pathname + (url.pathname.endsWith('/') ? 'index.html' : ''),
      );
      if (!target.startsWith(root + sep)) throw Error('Invalid asset path');
      const headers = await readFile(resolve(root, '_headers'), 'utf8');
      const csp = headers.match(/Content-Security-Policy: (.+)/)?.[1];
      if (!csp) throw Error('Missing business CSP');
      await route.fulfill({
        body: await readFile(target),
        contentType: target.endsWith('.html')
          ? 'text/html'
          : target.endsWith('.js')
            ? 'text/javascript'
            : target.endsWith('.css')
              ? 'text/css'
              : 'image/png',
        headers: {
          'content-security-policy': csp,
          'referrer-policy': headers.match(/Referrer-Policy: (.+)/)?.[1] || '',
        },
      });
      return;
    }
    const asset = await request.get('http://127.0.0.1:4313' + url.pathname + url.search);
    if (asset.headers()['content-type']?.includes('text/html'))
      await route.fulfill({
        contentType: 'text/html',
        headers: { 'referrer-policy': asset.headers()['referrer-policy'] || '' },
        body: (await asset.text()).replace(
          '<head>',
          '<head><script>window.DOJI_BUSINESS_IDENTITY_CONFIG={enabled:true,origin:"https://business.dojipro.com",turnstileSiteKey:"offline",termsVersion:"business-terms-20260930-v1",privacyVersion:"business-privacy-20260930-v1",termsUrl:"https://business.dojipro.com/business-terms/",privacyUrl:"https://business.dojipro.com/business-privacy/"};</script>',
        ),
      });
    else await route.fulfill({ response: asset });
  });
  return {
    calls,
    commands,
    authStarts,
    external,
    release,
    expire: () => {
      signedIn = false;
    },
    change: () => {
      application = { ...application, revision: 99 };
    },
  };
}
async function fill(page: Page) {
  for (const [label, value] of [
    ['Legal business name', details.legal_name],
    ['Public brand name', details.brand_name],
    ['Business website', details.website],
    ['Your name', details.representative_name],
    ['Your role', details.representative_role],
    ['What would you like to do with Doji?', details.purpose],
  ])
    await page.getByRole('textbox', { name: label!, exact: true }).fill(value!);
  await page.getByRole('combobox', { name: 'Industry' }).click();
  await page.getByRole('option', { name: 'Technology', exact: true }).click();
}

test('unsaved brand changes guard navigation and sign-out', async ({ page, request }) => {
  const f = await fixture(page, request, { setup: true, state: 'approved' });
  await page.goto(base + '/business-portal/application/');
  await page.getByLabel('About your business').fill('Keep these unsaved changes');
  await page.getByRole('link', { name: 'Business home' }).click();
  await expect(page.getByRole('dialog', { name: 'Leave without saving?' })).toBeVisible();
  await page.getByRole('button', { name: 'Stay here' }).click();
  await expect(page.getByLabel('About your business')).toHaveValue('Keep these unsaved changes');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  expect(f.calls).not.toContain('/auth/logout');
  await page.getByRole('link', { name: 'Business home' }).click();
  await page.getByRole('button', { name: 'Leave page' }).click();
  await expect(page.getByRole('heading', { name: 'Be part of the moment.' })).toBeVisible();
  expect(f.commands).toEqual([]);
});

test('approved onboarding saves branding, shows QR and reaches the owner dashboard', async ({
  page,
  request,
}, info) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  const f = await fixture(page, request, { setup: true, state: 'approved' });
  await page.goto(base + '/business-portal/setup/');
  await expect(page.getByRole('heading', { name: 'Welcome, Synthetic brand.' })).toBeVisible();
  await page.getByLabel('About your business').fill('A synthetic brand for acceptance testing.');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('onboarding-brand.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByRole('button', { name: 'Continue with authenticator' }).click();
  await expect(page.getByRole('img', { name: /Scan to add/ })).toBeVisible();
  await expect(page.getByText('ABCDEFGHIJKLMNOP')).toHaveCount(0);
  await page.getByRole('button', { name: 'Can’t scan the code?' }).click();
  await expect(page.getByText('ABCDEFGHIJKLMNOP')).toBeVisible();
  await page.getByLabel('Authenticator code').fill('123456');
  await page.getByRole('button', { name: 'Verify and finish setup' }).click();
  await expect(page.getByText('Your business workspace')).toBeVisible();
  await expect(page.getByText('A synthetic brand for acceptance testing.')).toBeVisible();
  expect(f.commands.map((x) => x.action)).toEqual(['save', 'complete']);
  expect(f.calls.filter((x) => x === '/api/workspace')).toHaveLength(1);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('onboarding-dashboard.png'), fullPage: true });
  expect(f.external).toEqual([]);
});

for (const outcome of ['reset-done', 'reset-pending', 'lost'] as const) {
  test(`owned reset scrubs its link and handles ${outcome} without automatic retry or login`, async ({
    page,
    request,
  }, info) => {
    const token = 'synthetic-reset-token-123456';
    const referrers: string[] = [];
    const requestUrls: string[] = [];
    page.on('request', (r) => {
      requestUrls.push(r.url());
      if (r.headers().referer) referrers.push(r.headers().referer!);
    });
    const f = await fixture(page, request, {
      signedIn: false,
      ownedAuth: true,
      ownedReset: outcome,
    });
    await page.goto(base + '/business-portal/access/?mode=reset#token=' + token);
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    await expect(page).toHaveURL(base + '/business-portal/access/?mode=reset');
    await expect(page.getByText('Security check complete.')).toBeVisible();
    expect(
      await page.evaluate(() =>
        JSON.stringify({
          local: { ...localStorage },
          session: { ...sessionStorage },
          history: history.state,
        }),
      ),
    ).not.toContain(token);
    expect(await page.content()).not.toContain(token);
    expect(referrers.every((value) => !value.includes(token))).toBe(true);
    expect(requestUrls.every((value) => !value.includes(token))).toBe(true);
    await page.getByLabel(/New password/).fill('synthetic-new-password');
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(
      page.getByRole('heading', {
        name:
          outcome === 'reset-done'
            ? 'Password updated'
            : 'We couldn’t confirm your password update',
      }),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath(`reset-${outcome}.png`), fullPage: true });
    expect(f.calls.filter((path) => path === '/auth/owned/reset')).toHaveLength(1);
    expect(f.calls).not.toContain('/api/application');
    expect(f.authStarts).toEqual([
      { proof: 'offline-proof', token, password: 'synthetic-new-password' },
    ]);
    await expect(page.getByLabel(/New password/)).toHaveCount(0);
    expect(f.external).toEqual([]);
    await page.getByRole('button', { name: 'Back to sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    expect(f.calls.filter((path) => path === '/auth/owned/reset')).toHaveLength(1);
  });
}

test('duplicate and missing reset tokens show a safe non-submitting screen', async ({
  page,
  request,
}) => {
  const f = await fixture(page, request, { signedIn: false, ownedAuth: true });
  for (const suffix of [
    '',
    '&token=synthetic-reset-token-123456&token=synthetic-reset-token-123456',
  ]) {
    await page.goto(base + '/business-portal/access/?mode=reset' + suffix);
    await expect(page.getByRole('heading', { name: 'Open your reset link again' })).toBeVisible();
    await expect(page).toHaveURL(base + '/business-portal/access/?mode=reset');
    await expect(page.getByRole('button', { name: 'Update password' })).toHaveCount(0);
  }
  expect(f.calls).not.toContain('/auth/owned/reset');
});

test('owned MFA accepts a corrected code in the Doji form without opening the application early', async ({
  page,
  request,
}) => {
  const f = await fixture(page, request, { signedIn: false, ownedAuth: true, ownedMfa: true });
  await page.goto(base + '/business-portal/access/?mode=signin');
  await expect(page.getByText('Security check complete.')).toBeVisible();
  await page.getByRole('textbox', { name: /Work email/ }).fill('sample@example.com');
  await page
    .getByLabel(/^Password/)
    .and(page.locator('input'))
    .fill('sample-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verify it’s you' })).toBeVisible();
  await expect(page.getByText('Security check complete.')).toBeVisible();
  const code = page.getByLabel(/Authenticator code/);
  await code.fill('000000');
  await page.getByRole('button', { name: 'Verify code', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('That code wasn’t accepted');
  await expect(code).toHaveValue('');
  expect(f.calls.filter((p) => p === '/api/application')).toHaveLength(0);
  await expect(page.getByText('Security check complete.')).toBeVisible();
  await code.fill('123456');
  await page.getByRole('button', { name: 'Verify code', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to application' }).click();
  await expect(
    page.getByRole('textbox', { name: 'Legal business name', exact: true }),
  ).toBeVisible();
  expect(f.calls.filter((p) => p === '/auth/owned/mfa')).toHaveLength(2);
  expect(f.external.filter((v) => v.includes('workos'))).toEqual([]);
});

test('gated owned sign-in stays on Doji and restores application through the existing client', async ({
  page,
  request,
}) => {
  const f = await fixture(page, request, { signedIn: false, ownedAuth: true });
  await page.goto(base + '/business-portal/access/?mode=signin');
  await expect(page.getByText('Security check complete.')).toBeVisible();
  await page.getByRole('textbox', { name: /Work email/ }).fill('sample@example.com');
  await page
    .getByLabel(/^Password/)
    .and(page.locator('input'))
    .fill('sample-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to application', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Legal business name', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(base + '/business-portal/application/');
  expect(f.calls).toContain('/auth/owned/signin');
  expect(f.calls).not.toContain('/auth/start');
  expect(f.external.filter((v) => v.includes('workos'))).toEqual([]);
});

test('gated owned registration verifies email before application and recovery stays on Doji', async ({
  page,
  request,
}) => {
  const f = await fixture(page, request, { signedIn: false, ownedAuth: true });
  await page.goto(base + '/business-portal/access/?mode=signin');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByText('Security check complete.')).toBeVisible();
  await page.getByRole('textbox', { name: /Work email/ }).fill('sample@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await page.getByRole('button', { name: 'Create an account' }).click();
  await expect(page.getByText('Security check complete.')).toBeVisible();
  await page
    .getByLabel(/^Password/)
    .and(page.locator('input'))
    .fill('copper-lantern-orbit-582!');
  await page.getByRole('checkbox', { name: /I represent/ }).check();
  await page.getByRole('checkbox', { name: /I acknowledge/ }).check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  expect(f.calls.filter((p) => p === '/api/application')).toHaveLength(0);
  await expect(page.getByText('Security check complete.')).toBeVisible();
  await page.getByLabel(/Email verification code/).fill('123456');
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to application' }).click();
  await expect(
    page.getByRole('textbox', { name: 'Legal business name', exact: true }),
  ).toBeVisible();
  expect(f.authStarts[1]).toMatchObject({
    country: 'US',
    termsVersion: 'business-terms-20260930-v1',
    privacyVersion: 'business-privacy-20260930-v1',
  });
  expect(f.calls).not.toContain('/auth/start');
  expect(f.external.filter((v) => v.includes('workos'))).toEqual([]);
});
test('cutover maintenance uses a centered account card and never restores or submits', async ({
  page,
  request,
}) => {
  const api = await fixture(page, request, { signedIn: false, maintenance: true });
  await page.goto(base + '/business-portal/access/?mode=reset#token=synthetic-reset-token-123456');
  await expect(
    page.getByRole('heading', { name: 'Business access is temporarily paused' }),
  ).toBeVisible();
  expect(page.url()).toBe(base + '/business-portal/access/?mode=reset');
  await expect(page.getByRole('textbox')).toHaveCount(0);
  expect(api.calls).toEqual([]);
  expect(api.commands).toEqual([]);
  expect(api.authStarts).toEqual([]);
});

test('public business homepage never restores or redirects an existing session', async ({
  page,
  request,
}) => {
  const api = await fixture(page, request);
  await page.goto(base + '/');
  await expect(page.getByRole('heading', { name: 'Be part of the moment.' })).toBeVisible();
  expect(api.calls).toEqual([]);
  await expect(page).toHaveURL(base + '/');
});
test('slow restoration shows a loader, not the register form, then hands off once', async ({
  page,
  request,
}) => {
  const api = await fixture(page, request, { slow: true });
  await page.goto(base + '/business-portal/access/?mode=register');
  await expect(page.getByText('Opening your business account…')).toBeVisible();
  await expect(page.getByLabel('Work email')).toHaveCount(0);
  api.release();
  await expect(page.getByLabel('Legal business name')).toBeVisible();
  expect(api.calls.filter((path) => path === '/api/application')).toHaveLength(1);
});
test('check answers preserves edits, submits US default, and shows a server receipt', async ({
  page,
  request,
}) => {
  const api = await fixture(page, request);
  await page.goto(base + '/business-portal/application/');
  await fill(page);
  await page.getByRole('button', { name: 'Check answers' }).click();
  await expect(page.getByLabel('Legal business name')).toHaveValue(details.legal_name);
  await page.getByRole('button', { name: 'Edit details' }).click();
  await expect(page.getByLabel('Public brand name')).toHaveValue(details.brand_name);
  await page.getByRole('button', { name: 'Check answers' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByRole('heading', { name: 'Your application is with us.' })).toBeVisible();
  await expect(page.getByText('Reference: 20000000-0000-4000-8000-000000000002')).toBeVisible();
  expect(api.commands).toHaveLength(1);
  expect(api.commands[0]?.p_details).toEqual(details);
  expect(api.external).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('business-receipt.png'), fullPage: true });
});
test('unknown submission retry keeps the original idempotency key', async ({ page, request }) => {
  const api = await fixture(page, request, { uncertain: true });
  await page.goto(base + '/business-portal/application/');
  await fill(page);
  await page.getByRole('button', { name: 'Check answers' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByRole('heading', { name: 'Your application is with us.' })).toBeVisible();
  expect(api.commands).toHaveLength(2);
  expect(api.commands[0]).toEqual(api.commands[1]);
});
test('changed server revision preserves edits and blocks stale submission', async ({
  page,
  request,
}) => {
  const api = await fixture(page, request, { state: 'draft' });
  await page.goto(base + '/business-portal/application/');
  await page.getByLabel('Legal business name').fill('Unsaved business');
  api.change();
  await page.getByRole('button', { name: 'Refresh status' }).click();
  await expect(page.getByText('Your application changed.', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Legal business name')).toHaveValue('Unsaved business');
  await expect(page.getByRole('button', { name: 'Check answers' })).toBeDisabled();
  expect(api.commands).toEqual([]);
});
test('expired business access removes private application data', async ({ page, request }) => {
  const api = await fixture(page, request, { state: 'draft' });
  await page.goto(base + '/business-portal/application/');
  await expect(page.getByLabel('Legal business name')).toHaveValue(details.legal_name);
  api.expire();
  await page.getByRole('button', { name: 'Refresh status' }).click();
  await expect(page.getByLabel('Work email')).toBeVisible();
  await expect(page.getByLabel('Legal business name')).toHaveCount(0);
});
test('legacy approval requires confirmed MFA and workspace read; no billing or campaign activation', async ({
  page,
  request,
}) => {
  const api = await fixture(page, request, { state: 'approved', legacyAuth: true });
  await page.goto(base + '/business-portal/application/');
  await page.getByRole('button', { name: 'Open business workspace' }).click();
  await page.getByLabel('Authenticator code').fill('123456');
  await page.getByRole('button', { name: 'Verify and open workspace' }).click();
  await expect(page.getByText('Synthetic brand · owner')).toBeVisible();
  expect(api.calls).toContain('/auth/mfa/complete');
  expect(api.calls).toContain('/api/workspace');
  expect(api.commands).toEqual([]);
});

test('sign-in preserves provider state and callback, with email only as a display hint', async ({
  page,
  request,
}) => {
  const api = await fixture(page, request, { signedIn: false, legacyAuth: true });
  await page.goto(base + '/business-portal/access/?mode=signin');
  await page.getByRole('textbox', { name: 'Work email' }).fill('offline@example.com');
  await expect(page.getByText('Security check complete.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Offline sign-in provider' })).toBeVisible();
  const destination = new URL(page.url());
  expect(destination.searchParams.get('state')).toBe('fixture-state');
  expect(destination.searchParams.get('code_challenge')).toBe('fixture-challenge');
  expect(destination.searchParams.get('redirect_uri')).toBe(base + '/auth/callback');
  expect(destination.searchParams.get('login_hint')).toBe('offline@example.com');
  expect(api.authStarts).toEqual([{ signup: false, proof: 'offline-proof' }]);
});

test('untrusted sign-in destination is rejected before navigation', async ({ page, request }) => {
  const api = await fixture(page, request, {
    signedIn: false,
    authUrl: 'https://example.com/untrusted',
    legacyAuth: true,
  });
  await page.goto(base + '/business-portal/access/?mode=signin');
  await page.getByRole('textbox', { name: 'Work email' }).fill('offline@example.com');
  await expect(page.getByText('Security check complete.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('destination could not be verified');
  expect(api.external).toEqual([]);
});

test('declined applications are readable but cannot be edited or open a workspace', async ({
  page,
  request,
}) => {
  const api = await fixture(page, request, { state: 'declined' });
  await page.goto(base + '/business-portal/application/');
  await expect(
    page.getByRole('heading', { name: 'Your application has been reviewed.' }),
  ).toBeVisible();
  await expect(page.getByLabel('Legal business name')).toHaveAttribute('readonly', '');
  await expect(page.getByRole('button', { name: 'Open business workspace' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Check answers' })).toHaveCount(0);
  expect(api.commands).toEqual([]);
});

test('acceptance entry leaves public access paused and expires closed', async ({
  page,
  request,
}) => {
  const now = new Date();
  await page.clock.setFixedTime(now);
  const api = await fixture(page, request, {
    signedIn: false,
    ownedAuth: true,
    acceptanceUntil: new Date(now.getTime() + 3600000).toISOString(),
  });
  for (const mode of ['signin', 'register']) {
    await page.goto(base + '/business-portal/access/?mode=' + mode);
    await expect(
      page.getByRole('heading', { name: 'Business access is temporarily paused' }),
    ).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  }
  await page.goto(base + '/business-portal/access/?mode=acceptance');
  await expect(
    page.getByRole('heading', { name: 'Create your account', exact: true }),
  ).toBeVisible();
  await page.clock.setFixedTime(new Date(now.getTime() + 3600001));
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Business access is temporarily paused' }),
  ).toBeVisible();
  expect(api.authStarts).toEqual([]);
});

test('existing test account can return to sign-in after the original window expires', async ({
  page,
  request,
}) => {
  const api = await fixture(page, request, {
    signedIn: false,
    ownedAuth: true,
    acceptanceExistingAccount: true,
    acceptanceUntil: new Date(Date.now() - 86400000).toISOString(),
  });
  for (const mode of ['signin', 'acceptance']) {
    await page.goto(base + '/business-portal/access/?mode=' + mode);
    await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create an account', exact: true })).toHaveCount(
      0,
    );
  }
  await page.goto(base + '/business-portal/access/?mode=register');
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  expect(api.authStarts).toEqual([]);
});

test('acceptance does not hide an existing authorized application', async ({ page, request }) => {
  await fixture(page, request, {
    signedIn: true,
    ownedAuth: true,
    acceptanceUntil: new Date(Date.now() + 3600000).toISOString(),
  });
  await page.goto(base + '/business-portal/application/');
  await expect(page.getByLabel('Legal business name')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Business access is temporarily paused' }),
  ).toHaveCount(0);
});

test('release respects the current pilot cutoff without affecting sign-in', async ({
  page,
  request,
}) => {
  test.skip(
    !process.env.DOJI_BUSINESS_PACKAGE,
    'Current production pilot policy belongs to the exact release package',
  );
  // Qualify both open and expired packages against their actual public cutoff.
  const { registrationUntil: until, acceptanceExistingAccount } = await packageReleaseConfig();
  await page.clock.setFixedTime(new Date(Date.parse(until) + 1000));
  const api = await fixture(page, request, { signedIn: false });
  await page.goto(base + '/business-portal/access/?mode=register');
  await expect(
    page.getByRole('heading', {
      name: acceptanceExistingAccount
        ? 'Business access is temporarily paused'
        : 'Business registration is currently closed',
    }),
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Work email' })).toHaveCount(0);
  expect(api.authStarts).toEqual([]);
  await page.goto(base + '/business-portal/access/?mode=signin');
  await expect(page.getByRole('textbox', { name: 'Work email' })).toBeVisible();
});

test('registration uses consent and the existing verified provider handoff before the cutoff', async ({
  page,
  request,
}) => {
  test.skip(!process.env.DOJI_BUSINESS_PACKAGE, 'Exact release configuration');
  const { registrationUntil: until } = await packageReleaseConfig();
  await page.clock.setFixedTime(new Date(Date.parse(until) - 60000));
  const api = await fixture(page, request, { signedIn: false, legacyAuth: true });
  await page.goto(base + '/business-portal/access/?mode=register');
  await expect(page.getByRole('heading', { name: 'Create your business account' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Work email' }).fill('offline@example.com');
  await expect(page.getByText('Security check complete.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  expect(api.authStarts).toEqual([]);
  await page.getByRole('checkbox', { name: /I represent a United States business/ }).check();
  await page.getByRole('checkbox', { name: /I acknowledge the/ }).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Offline sign-in provider' })).toBeVisible();
  expect(api.authStarts).toEqual([
    {
      signup: true,
      proof: 'offline-proof',
      termsAccepted: true,
      privacyAcknowledged: true,
      country: 'US',
      termsVersion: 'business-terms-20260930-v1',
      privacyVersion: 'business-privacy-20260930-v1',
    },
  ]);
  expect(api.commands).toEqual([]);
});
