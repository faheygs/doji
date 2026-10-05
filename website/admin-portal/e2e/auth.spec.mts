import { expect, test } from '../../coverage-fixture.mts';
import { installMockBackend } from './fixtures.mts';
import { present } from '../../test-values.mts';

test('loads no administrator data before authentication and enters with AAL2', async ({ page }) => {
  const requests = await installMockBackend(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Admin sign in' })).toBeVisible();
  expect(requests.filter((request) => request.path.includes('/portal/admin/'))).toHaveLength(0);

  await page.getByLabel('Operator email').fill('operator@dojipro.com');
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page.locator('#portalApp')).toBeVisible();
  await expect(page.locator('#operatorName')).toHaveText('Gavin Fahey');
  const assurance = await page.evaluate(() => {
    const stored = sessionStorage.getItem('doji-admin-session-v1');
    if (!stored) throw Error('Missing synthetic session');
    const session: unknown = JSON.parse(stored);
    if (
      !session ||
      typeof session !== 'object' ||
      !('access_token' in session) ||
      typeof session.access_token !== 'string'
    )
      throw Error('Malformed synthetic session');
    const claims = session.access_token.split('.')[1];
    if (!claims) throw Error('Missing synthetic claims');
    const decoded: unknown = JSON.parse(atob(claims));
    if (!decoded || typeof decoded !== 'object' || !('aal' in decoded))
      throw Error('Missing assurance');
    return decoded.aal;
  });
  expect(assurance).toBe('aal2');
  await expect(page.locator('#operatorSession')).toContainText('Live updates');
  expect(requests.some((request) => request.path.endsWith('/portal/admin/session'))).toBe(true);
});

test('first-time administrator receives a named Doji Admin authenticator enrollment', async ({
  page,
}) => {
  const requests = await installMockBackend(page, { authMode: 'enrollment' });
  await page.goto('/');

  await page.getByLabel('Operator email').fill('new-admin@dojipro.com');
  await page.getByLabel('Password', { exact: true }).fill('secure-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Set up your authenticator app' })).toBeVisible();
  await expect(page.getByAltText('Authenticator setup QR code')).toHaveAttribute(
    'src',
    /^data:image\/svg\+xml/,
  );
  await expect(page.locator('#adminTotpSecret')).toHaveText('DOJITESTSECRET');
  const enrollmentRequest = requests.find(
    (request) => request.path.endsWith('/auth/v1/factors') && request.method === 'POST',
  );
  expect(enrollmentRequest).toBeTruthy();
  expect(JSON.parse(present(present(enrollmentRequest).body))).toMatchObject({
    factor_type: 'totp',
    friendly_name: 'Doji Admin',
    issuer: 'Doji Admin',
  });

  await page.getByLabel('Six-digit code').fill('123456');
  await page.getByRole('button', { name: 'Finish setup and enter admin' }).click();
  await expect(page.locator('#portalApp')).toBeVisible();
});

test('verified authenticator challenge gates the workspace', async ({ page }) => {
  await installMockBackend(page, { authMode: 'challenge' });
  await page.goto('/');

  await page.getByLabel('Operator email').fill('operator@dojipro.com');
  await page.getByLabel('Password', { exact: true }).fill('secure-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Verify it’s you')).toBeVisible();
  await expect(page.locator('#portalApp')).toBeHidden();

  await page.getByLabel('Verification code').fill('654321');
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await expect(page.locator('#portalApp')).toBeVisible();
});

test('successful MFA followed by denied workspace returns to credentials, not a dead QR form', async ({
  page,
}) => {
  await installMockBackend(page, { authMode: 'enrollment' });
  await page.route('**/portal/admin/session', (r) =>
    r.fulfill({
      status: 403,
      contentType: 'application/json',
      body: '{"message":"Workspace access is not approved."}',
    }),
  );
  await page.goto('/');
  await page.getByLabel('Operator email').fill('test@example.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Six-digit code').fill('123456');
  await page.getByRole('button', { name: 'Finish setup and enter admin' }).click();
  await expect(page.locator('#adminMfaSetup')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.locator('#adminTotpSecret')).toBeEmpty();
  await expect(
    page.getByText(/Sign-in verified, but portal access could not be loaded/),
  ).toBeVisible();
});

test('legacy portal directs an employee to setup without attempting another MFA enrollment', async ({
  page,
}) => {
  const requests = await installMockBackend(page);
  const token = `test.${Buffer.from(JSON.stringify({ aal: 'aal1', role: 'doji_employee' })).toString('base64url')}.signature`;
  await page.route('**/auth/v1/token?grant_type=password', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: token,
        user: { id: 'employee', role: 'doji_employee', factors: [] },
      }),
    }),
  );
  await page.goto('/');
  await page.getByLabel('Operator email').fill('work@example.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#adminSigninStatus')).toContainText('/employee-setup/');
  expect(requests.some((r) => r.path.includes('/factors'))).toBe(false);
  expect(requests.some((r) => r.path.includes('/portal/admin/'))).toBe(false);
  expect(requests.some((r) => r.path.includes('/logout?scope=local'))).toBe(true);
});
