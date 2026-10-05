import { expect, test } from '../../coverage-fixture.mts';
import type { Page, Route } from '@playwright/test';
const jwt = (aal: string) =>
  `test.${Buffer.from(JSON.stringify({ aal, role: 'doji_employee' })).toString('base64url')}.signature`;
const session = (
  aal = 'aal1',
  factors: { id: string; factor_type: string; status: string }[] = [],
) => ({
  access_token: jwt(aal),
  user: {
    id: 'test-employee',
    role: 'doji_employee',
    app_metadata: { account_type: 'employee' },
    factors,
  },
});
const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
async function signIn(page: Page) {
  await page.goto('/employee-setup/');
  await page.getByRole('button', { name: 'Already have a work account? Sign in' }).click();
  await page.getByLabel('Work email').fill('owner@example.test');
  await page.getByLabel('Password', { exact: true }).fill('test-only-password');
  await page.getByRole('button', { name: 'Continue securely' }).click();
}
async function backend(
  page: Page,
  { existing = false, accessFail = false, wrongCode = false } = {},
) {
  const calls: string[] = [];
  let reads = 0,
    attempts = 0;
  await page.route('**/functions/v1/employee-signin', (r) =>
    json(
      r,
      session('aal1', existing ? [{ id: 'factor', factor_type: 'totp', status: 'verified' }] : []),
    ),
  );
  await page.route('**/rest/v1/rpc/get_employee_registration_status_v1', (r) =>
    json(
      r,
      ++reads > 1 && accessFail ? { message: 'Access status unavailable' } : { status: 'pending' },
      reads > 1 && accessFail ? 503 : 200,
    ),
  );
  await page.route('**/auth/v1/**', async (r) => {
    const path = new URL(r.request().url()).pathname;
    calls.push(path);
    if (path.endsWith('/logout')) return r.fulfill({ status: 204 });
    if (path.endsWith('/challenge')) return json(r, { id: `challenge-${calls.length}` });
    if (path.endsWith('/verify'))
      return ++attempts === 1 && wrongCode
        ? json(r, { msg: 'Code is invalid. Try the current code.' }, 422)
        : json(r, session('aal2'));
    if (path.endsWith('/factors'))
      return json(r, {
        id: 'factor',
        type: 'totp',
        totp: {
          qr_code:
            '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100"/></svg>',
          secret: 'TESTONLYSETUPKEY',
        },
      });
    throw new Error(`Unexpected Auth call: ${path}`);
  });
  return calls;
}
test('signup replaces form with a focused confirmation screen and preserves existing portal storage', async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem('doji-admin-session-v1', 'existing-portal-session'),
  );
  await page.route('**/functions/v1/employee-register', (r) =>
    json(r, { message: 'Check your email.' }, 202),
  );
  await page.goto('/employee-setup/');
  await page.getByLabel('Full name').fill('Test Owner');
  await page.getByLabel('Work email').fill('owner@example.test');
  await page.getByLabel('Password', { exact: true }).fill('test-only-password');
  await page.getByRole('button', { name: 'Create employee account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check your email.' })).toBeFocused();
  await expect(page.locator('#setupForm')).toBeHidden();
  await expect(page.locator('#setupPassword')).toHaveValue('');
  await expect(page.locator('#confirmationEmail')).toHaveText('owner@example.test');
  expect(await page.evaluate(() => sessionStorage.getItem('doji-admin-session-v1'))).toBe(
    'existing-portal-session',
  );
  await page.screenshot({ path: 'test-results/employee-confirmation-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/employee-confirmation-mobile.png', fullPage: true });
});
test('existing authenticator completes pending setup without enrolling again or granting portal access', async ({
  page,
}) => {
  const calls = await backend(page, { existing: true });
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Verify it’s you.' })).toBeVisible();
  await expect(page.locator('#newAuthenticator')).toBeHidden();
  await page.getByLabel('Authenticator code', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Verify and finish setup' }).click();
  await expect(page.getByRole('heading', { name: 'Security setup complete.' })).toBeVisible();
  await expect(page.locator('#accessDescription')).toContainText('approve your permissions');
  expect(calls.filter((p) => p.endsWith('/factors'))).toHaveLength(0);
  expect(calls.filter((p) => p.endsWith('/logout'))).toHaveLength(1);
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
});
test('new setup retains its QR on invalid code and retries with a fresh challenge', async ({
  page,
}) => {
  const calls = await backend(page, { wrongCode: true });
  await signIn(page);
  await expect(page.locator('#setupQr')).toBeVisible();
  await page.getByLabel('Authenticator code', { exact: true }).fill('000000');
  await page.getByRole('button', { name: 'Verify and finish setup' }).click();
  await expect(page.getByRole('alert')).toContainText('Code is invalid');
  await expect(page.locator('#setupQr')).toBeVisible();
  await page.getByLabel('Authenticator code', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Verify and finish setup' }).click();
  await expect(page.getByRole('heading', { name: 'Security setup complete.' })).toBeVisible();
  expect(calls.filter((p) => p.endsWith('/challenge'))).toHaveLength(2);
  await expect(page.locator('#setupSecret')).toBeEmpty();
});
test('post-MFA access failure clears consumed QR and explains that authenticator is already verified', async ({
  page,
}) => {
  await backend(page, { accessFail: true });
  await signIn(page);
  await page.getByLabel('Authenticator code', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Verify and finish setup' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Authenticator verified, but access status could not be loaded',
  );
  await expect(page.locator('#securitySetup')).toBeHidden();
  await expect(page.locator('#setupQr')).not.toHaveAttribute('src');
  await expect(page.getByRole('button', { name: 'Continue securely' })).toBeVisible();
});
test('resend failures remain beside the action and focused', async ({ page }) => {
  await page.route('**/functions/v1/employee-register', (r) =>
    json(r, { message: 'Enrollment is limited during setup.' }, 403),
  );
  await page.goto('/employee-setup/');
  await page.getByLabel('Work email').fill('someone@example.test');
  await page.getByRole('button', { name: 'Resend verification email' }).click();
  await expect(page.getByRole('alert')).toContainText('Enrollment is limited');
  await expect(page.locator('#setupStatus')).toBeFocused();
});
test('email return discards tokens and requires real sign-in without touching existing portal storage', async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem('doji-admin-session-v1', 'existing'));
  await page.goto(`/#access_token=${jwt('aal1')}&refresh_token=private-test-refresh`);
  await expect(page).toHaveURL(/\/employee-setup\/$/);
  await expect(page.getByRole('button', { name: 'Continue securely' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('doji-admin-session-v1'))).toBe(
    'existing',
  );
  expect(await page.evaluate(() => location.hash)).toBe('');
});
