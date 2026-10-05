import type { Page } from "@playwright/test";
import { test, expect } from '../../coverage-fixture.mts';
import type {BusinessTurnstile} from '../business-verification.mts';
declare global {interface Window {challengeOptions:Parameters<BusinessTurnstile['render']>[1][]}}
const access = '/business-portal/access/';
test.beforeEach(async ({ page }) => {
  await page.route('**/business-portal/config.js', route => route.fulfill({contentType:'text/javascript',body:'// test config supplied by init script'}));
});
async function setup(
  page: Page,
  { flow = 'signup', factor = false, publicAdmission = false, siteKey = 'synthetic-sitekey' } = {},
) {
  const calls:{path:string;body:Record<string,unknown>;method:string}[] = [];
  await page.route('http://127.0.0.1:*/business-portal/**', async (route) => {
    if(route.request().url().endsWith('/config.js')) return route.fulfill({contentType:'text/javascript',body:'// test config supplied by init script'});
    const response = await route.fetch(),
      headers = response.headers();
    if (headers['content-security-policy'])
      headers['content-security-policy'] = headers['content-security-policy']!.replaceAll(
        'https://tvixsmqxotuvyjqzmjla.supabase.co',
        'https://business-test.supabase.co',
      );
    await route.fulfill({ response, headers });
  });
  await page.addInitScript(
    ({ publicAdmission, siteKey }) => {
      window.DOJI_BUSINESS_APPLICATION_CONFIG = {
        enabled: true,
        supabaseUrl: 'https://business-test.supabase.co',
        anonKey: 'test-public',
        publicAdmission,
        turnstileSiteKey: siteKey,
        termsUrl: 'https://business.example.test/terms',
        privacyUrl: 'https://business.example.test/privacy',
        termsVersion: 'test-terms-v1',
        privacyVersion: 'test-privacy-v1',
      };
      // Provider remains stubbed; tests validate UI token lifecycle, not bot detection.
      window.challengeOptions = [];
      window.turnstile = {
        render(root, options) {
          window.challengeOptions.push(options);
          if (!(root instanceof HTMLElement)) throw Error('Expected challenge element');
          root.textContent = 'Synthetic security check';
          return String(window.challengeOptions.length);
        },
        remove() {},
        reset() {},
      };
    },
    { publicAdmission, siteKey },
  );
  const user = {
    id: 'business-test',
    role: 'doji_business',
    email_confirmed_at: '2026-09-29',
    app_metadata: { account_type: 'business' },
    factors: factor ? [{ id: 'factor-test', factor_type: 'totp', status: 'verified' }] : [],
  };
  const session = (aal:string) => ({
    user,
    access_token: `e30.${Buffer.from(JSON.stringify({ aal })).toString('base64url')}.test`,
    refresh_token: 'synthetic-refresh',
    expires_in: 3600,
  });
  await page.route('https://business-test.supabase.co/**', async (route) => {
    const path = new URL(route.request().url()).pathname,
      body = route.request().postDataJSON();
    calls.push({ path, body, method: route.request().method() });
    if (path.endsWith('/business-auth')) {
      if (body.action === 'verify')
        return route.fulfill({ json: { ...session('aal1'), business_flow: flow } });
      if (body.action === 'signin') return route.fulfill({ json: session('aal1') });
      return route.fulfill({ status: 202, json: { message: 'If eligible, check your email.' } });
    }
    if (path.endsWith('/user')) return route.fulfill({ json: user });
    if (path.endsWith('/logout')) return route.fulfill({ json: {} });
    if (path.endsWith('/challenge')) return route.fulfill({ json: { id: 'challenge-test' } });
    if (path.endsWith('/verify')) {
      if (body.code !== '123456')
        return route.fulfill({ status: 422, json: { message: 'Invalid authenticator code.' } });
      return route.fulfill({ json: session('aal2') });
    }
    if (path.endsWith('/factors'))
      return route.fulfill({
        json: {
          id: 'factor-test',
          totp: {
            secret: 'SYNTHETICSETUPKEY',
            qr_code:
              '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="black"/></svg>',
          },
        },
      });
    if (path.endsWith('get_business_application_v1'))
      return route.fulfill({
        json: {
          id: 'app-test',
          state: 'approved',
          revision: 1,
          details: { brand_name: 'Example business' },
        },
      });
    if (path.endsWith('get_business_workspace_v1'))
      return route.fulfill({
        json: { brand_name: 'Example business', campaigns_enabled: false, billing_enabled: false },
      });
    throw Error(`Unexpected local test request ${path}`);
  });
  return calls;
}
test('access is default-off without network activity', async ({ page }) => {
  let external = 0;
  page.on('request', (r) => {
    if (new URL(r.url()).hostname !== '127.0.0.1') external++;
  });
  await page.goto(access);
  await expect(page.getByText('Business account access is not open yet.')).toBeVisible();
  await expect(page.locator('#accountForm')).toBeHidden();
  expect(external).toBe(0);
});
test('signup agreements start unchecked and cannot be bypassed by scripted submit', async ({
  page,
}) => {
  const calls = await setup(page);
  await page.goto(access);
  await expect(page.locator('#accountTerms')).not.toBeChecked();
  await expect(page.locator('#accountPrivacy')).not.toBeChecked();
  await page
    .locator('#accountForm')
    .evaluate((form) => form.dispatchEvent(new Event('submit', { cancelable: true })));
  await expect(page.locator('#accessMessage')).toContainText('accept the terms and acknowledge');
  expect(calls).toHaveLength(0);
  await page.locator('#accountTerms').check();
  await page.locator('#accountPrivacy').check();
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Reset password', exact: true }).click();
  await expect(page.locator('#accountAgreements')).toBeHidden();
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Create an account', exact: true }).click();
  await expect(page.locator('#accountTerms')).not.toBeChecked();
  await expect(page.locator('#accountPrivacy')).not.toBeChecked();
});
test('missing signup legal versions fails closed even with both boxes checked', async ({
  page,
}) => {
  const calls = await setup(page);
  await page.addInitScript(() => {
    delete window.DOJI_BUSINESS_APPLICATION_CONFIG!.termsVersion;
  });
  await page.goto(access);
  await page.locator('#accountTerms').check();
  await page.locator('#accountPrivacy').check();
  await page
    .locator('#accountForm')
    .evaluate((form) => form.dispatchEvent(new Event('submit', { cancelable: true })));
  await expect(page.locator('#accessMessage')).toContainText('registration is closed');
  expect(calls).toHaveLength(0);
});
for (const width of [390, 1440])
  for (const theme of ['light', 'dark'])
    test(`registration shared components ${width} ${theme}`, async ({ page }, info) => {
      await setup(page);
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((theme) => localStorage.setItem('doji-portal-theme', theme), theme);
      await page.goto(access);
      await expect(page.locator('.portalSelect')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: info.outputPath('business-access.png'), fullPage: true });
    });
test('registration sends exact fields once, clears password, no session persistence', async ({
  page,
}) => {
  const calls = await setup(page);
  await page.goto(access);
  await page.getByLabel('Your name', { exact: true }).fill('Example owner');
  await page.getByLabel('Business email', { exact: true }).fill('owner@test.invalid');
  await page
    .locator('#accountForm')
    .getByLabel('New password', { exact: true })
    .fill('synthetic-password');
  await page.locator('#accountTerms').check();
  await page.locator('#accountPrivacy').check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText('If eligible, check your email.')).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(calls[0]!.body).toEqual({
    action: 'register',
    email: 'owner@test.invalid',
    displayName: 'Example owner',
    country: 'US',
    password: 'synthetic-password',
    termsAccepted: true,
    privacyAcknowledged: true,
    termsVersion: 'test-terms-v1',
    privacyVersion: 'test-privacy-v1',
  });
  await expect(
    page.locator('#accountForm').getByLabel('New password', { exact: true }),
  ).toHaveValue('');
  expect(
    await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage })),
  ).not.toContain('synthetic');
});
test('shared dropdown changes recovery fields and avoids password payload', async ({ page }) => {
  const calls = await setup(page);
  await page.goto(access);
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Reset password', exact: true }).click();
  await expect(
    page.locator('#accountForm').getByLabel('New password', { exact: true }),
  ).toBeHidden();
  await page.getByLabel('Business email', { exact: true }).fill('owner@test.invalid');
  await page.getByRole('button', { name: 'Send email', exact: true }).click();
  await expect(page.getByText('If eligible, check your email.')).toBeVisible();
  expect(calls[0]!.body).toEqual({ action: 'recover', email: 'owner@test.invalid' });
});
test('email opens without redeeming, scrubs fragment, requires explicit click then local logout', async ({
  page,
}) => {
  const calls = await setup(page);
  await page.goto(`${access}#ticket=synthetic-ticket`);
  await expect(page).toHaveURL(/\/access\/$/);
  expect(calls).toHaveLength(0);
  await page.getByRole('button', { name: 'Continue securely' }).click();
  await expect(page.getByText('Your business email is verified.', { exact: false })).toBeVisible();
  expect(calls.map((c) => c.path)).toEqual(['/functions/v1/business-auth', '/auth/v1/logout']);
  expect(
    await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage })),
  ).not.toContain('synthetic-ticket');
});
test('recovery requires existing MFA; wrong code keeps password form closed', async ({ page }) => {
  const calls = await setup(page, { flow: 'recovery', factor: true });
  await page.goto(`${access}#ticket=synthetic-recovery`);
  await page.getByRole('button', { name: 'Continue securely' }).click();
  await expect(page.locator('#passwordForm')).toBeHidden();
  await page.getByLabel('Authenticator code').fill('000000');
  await page.getByRole('button', { name: 'Verify authenticator' }).click();
  await expect(page.getByText('Invalid authenticator code.')).toBeVisible();
  await expect(page.locator('#passwordForm')).toBeHidden();
  expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
  await page.getByLabel('Authenticator code').fill('123456');
  await page.getByRole('button', { name: 'Verify authenticator' }).click();
  await expect(page.locator('#passwordForm')).toBeVisible();
  await page
    .locator('#passwordForm')
    .getByLabel('New password', { exact: true })
    .fill('replacement-password');
  await page.getByLabel('Confirm new password').fill('different-password');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByText('The passwords must match.')).toBeVisible();
  await page.getByLabel('Confirm new password').fill('replacement-password');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByText('Password saved.', { exact: false })).toBeVisible();
  await expect(page.locator('#passwordForm')).toBeHidden();
  expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
});
test('approved workspace enrolls MFA and clears secret after verification', async ({ page }) => {
  const calls = await setup(page);
  await page.goto('/business-portal/application/');
  await page.getByLabel('Business email', { exact: true }).fill('owner@test.invalid');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Open business workspace' }).click();
  await expect(page.locator('[data-mfa-secret]')).toHaveText('SYNTHETICSETUPKEY');
  expect(calls.filter((c) => c.path.endsWith('get_business_workspace_v1'))).toHaveLength(0);
  await page.getByLabel('Authenticator code').fill('123456');
  await page.getByRole('button', { name: 'Verify authenticator' }).click();
  await expect(page.getByText('Campaign publishing and billing are not enabled.')).toBeVisible();
  await expect(page.locator('[data-mfa-secret]')).toHaveText('');
  await expect(page.locator('.businessMfaQr')).not.toHaveAttribute('src');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.locator('#businessVerifiedWorkspace')).toBeHidden();
});
test('recovery verification can be cancelled and resumed without consuming another link', async ({
  page,
}) => {
  const calls = await setup(page, { flow: 'recovery', factor: true });
  await page.goto(`${access}#ticket=synthetic-recovery`);
  await page.getByRole('button', { name: 'Continue securely' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('#passwordForm')).toBeHidden();
  await page.getByRole('button', { name: 'Resume verification' }).click();
  await expect(page.getByLabel('Authenticator code')).toBeVisible();
  expect(calls.filter((c) => c.body?.action === 'verify')).toHaveLength(1);
});
test('business workspace read failure remains visible after successful MFA', async ({ page }) => {
  await setup(page);
  await page.route('**/rest/v1/rpc/get_business_workspace_v1', (route) =>
    route.fulfill({ status: 503, json: { message: 'Workspace temporarily unavailable.' } }),
  );
  await page.goto('/business-portal/application/');
  await page.getByLabel('Business email', { exact: true }).fill('owner@test.invalid');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Open business workspace' }).click();
  await page.getByLabel('Authenticator code').fill('123456');
  await page.getByRole('button', { name: 'Verify authenticator' }).click();
  await expect(page.getByText('Workspace temporarily unavailable.')).toBeVisible();
  await expect(page.locator('#businessVerifiedWorkspace')).toBeHidden();
});

test('public signup requires proof, retains password before proof, consumes token once', async ({
  page,
}, info) => {
  const calls = await setup(page, { publicAdmission: true });
  await page.goto(access);
  await page.screenshot({ path: info.outputPath('public-signup.png'), fullPage: true });
  await expect(
    page.getByText('Create an account, verify your email, then submit your business for review.'),
  ).toBeVisible();
  await page.getByLabel('Your name', { exact: true }).fill('Example owner');
  await page.getByLabel('Business email', { exact: true }).fill('owner@test.invalid');
  await page.locator('#accountPassword').fill('synthetic-password');
  await page.locator('#accountTerms').check();
  await page.locator('#accountPrivacy').check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('#accessMessage')).toHaveText(
    'Complete the security check before continuing.',
  );
  await expect(page.locator('#accountPassword')).toHaveValue('synthetic-password');
  expect(calls).toHaveLength(0);
  await page.evaluate(() => window.challengeOptions.at(-1)!.callback('synthetic-proof'));
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText('If eligible, check your email.')).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(calls[0]!.body.verificationToken).toBe('synthetic-proof');
  await expect(page.locator('#accountPassword')).toHaveValue('');
  await page.locator('#accountPassword').fill('synthetic-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  expect(calls).toHaveLength(1);
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toContain('synthetic');
});

test('public action change ignores old callbacks and expired tokens require manual retry', async ({
  page,
}) => {
  const calls = await setup(page, { publicAdmission: true });
  await page.goto(access);
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Reset password', exact: true }).click();
  await page.getByLabel('Business email', { exact: true }).fill('owner@test.invalid');
  await page.evaluate(() => window.challengeOptions[0]!.callback('stale-register-proof'));
  await page.getByRole('button', { name: 'Send email', exact: true }).click();
  expect(calls).toHaveLength(0);
  expect(await page.evaluate(() => window.challengeOptions.at(-1)!.action)).toBe('business_recover');
  await page.evaluate(() => {
    const c = window.challengeOptions.at(-1)!;
    c.callback('expired-proof');
    c['expired-callback']();
  });
  await page.getByRole('button', { name: 'Send email', exact: true }).click();
  expect(calls).toHaveLength(0);
  await page.getByRole('button', { name: 'Retry security check' }).click();
  await page.evaluate(() => window.challengeOptions.at(-1)!.callback('fresh-proof'));
  await page.getByRole('button', { name: 'Send email', exact: true }).click();
  await expect(page.getByText('If eligible, check your email.')).toBeVisible();
  expect(calls[0]!.body).toEqual({
    action: 'recover',
    email: 'owner@test.invalid',
    verificationToken: 'fresh-proof',
  });
});

test('public missing site key fails closed with visible retry, not invitation fallback', async ({
  page,
}) => {
  const calls = await setup(page, { publicAdmission: true, siteKey: '' });
  await page.goto(access);
  await expect(page.getByRole('button', { name: 'Retry security check' })).toBeVisible();
  expect(await page.evaluate(() => window.challengeOptions.length)).toBe(0);
  expect(calls).toHaveLength(0);
});

test('public signed email links do not load a security widget or redeem on opening', async ({
  page,
}) => {
  const calls = await setup(page, { publicAdmission: true });
  await page.goto(`${access}#ticket=synthetic-ticket`);
  await expect(page.getByRole('button', { name: 'Continue securely' })).toBeVisible();
  expect(await page.evaluate(() => window.challengeOptions.length)).toBe(0);
  expect(calls).toHaveLength(0);
  await page.getByRole('button', { name: 'Continue securely' }).click();
  await expect(page.getByText('Your business email is verified.', { exact: false })).toBeVisible();
  expect(calls[0]!.body).toEqual({ action: 'verify', ticket: 'synthetic-ticket' });
});

test('public sign-in requires operation-bound proof before credentials leave page', async ({
  page,
}) => {
  const calls = await setup(page, { publicAdmission: true });
  await page.goto('/business-portal/application/');
  await page.getByLabel('Business email', { exact: true }).fill('owner@test.invalid');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  expect(calls).toHaveLength(0);
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('synthetic-password');
  expect(await page.evaluate(() => window.challengeOptions.at(-1)!.action)).toBe('business_signin');
  await page.evaluate(() => window.challengeOptions.at(-1)!.callback('signin-proof'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open business workspace' })).toBeVisible();
  expect(calls[0]!.body.verificationToken).toBe('signin-proof');
});
