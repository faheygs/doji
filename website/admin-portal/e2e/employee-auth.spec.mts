import { expect, test } from '../../coverage-fixture.mts';
import { installMockBackend } from './fixtures.mts';
import type { Page } from '@playwright/test';

async function employeeMode(page: Page) {
  const requests = await installMockBackend(page);
  await page.route('**/admin-app-*.js', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      '"employeeAccountsEnabled": false',
      '"employeeAccountsEnabled": true',
    );
    await route.fulfill({ response, body });
  });
  return requests;
}

test('verification retry validates email and recovers from a service failure without signing in', async ({
  page,
}) => {
  const requests = await employeeMode(page);
  let calls = 0;
  await page.route('**/functions/v1/employee-register', (route) => {
    calls++;
    return route.fulfill({ status: 503, json: { message: 'Synthetic verification unavailable' } });
  });
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Resend verification email', exact: true });
  await button.click();
  await expect(page.locator('#adminEmail')).toBeFocused();
  expect(calls).toBe(0);
  await page.locator('#adminEmail').fill('synthetic@example.test');
  await button.click();
  await expect(page.locator('#adminSigninStatus')).toContainText(
    'Synthetic verification unavailable',
  );
  await expect(button).toBeEnabled();
  expect(calls).toBe(1);
  expect(requests).toEqual([]);
});

test('incorrect authenticator code preserves the challenge and permits retry without protected reads', async ({
  page,
}) => {
  const requests = await installMockBackend(page, { authMode: 'challenge' });
  await page.route('**/auth/v1/factors/*/verify', (route) =>
    route.fulfill({ status: 422, json: { message: 'Invalid synthetic code' } }),
  );
  await page.goto('/');
  await page.locator('#adminEmail').fill('synthetic@example.test');
  await page.locator('#adminPassword').fill('synthetic-password');
  await page.locator('#adminSigninForm button[type="submit"]').click();
  await page.locator('#adminChallengeCode').fill('123456');
  await page.locator('#adminMfaChallengeForm button[type="submit"]').click();
  await expect(page.locator('#adminSigninStatus')).toContainText('Invalid synthetic code');
  await expect(page.locator('#adminMfaChallengeForm')).toBeVisible();
  await expect(page.locator('#adminMfaChallengeForm button[type="submit"]')).toBeEnabled();
  expect(requests.filter((r) => r.path.includes('/portal/admin/'))).toEqual([]);
});

test('incomplete authenticator enrollment fails closed and clears temporary authentication', async ({
  page,
}) => {
  const requests = await installMockBackend(page, { authMode: 'enrollment' });
  await page.route('**/auth/v1/factors', (route) =>
    route.fulfill({ json: { id: 'factor-new', type: 'totp', totp: { secret: 'synthetic' } } }),
  );
  await page.goto('/');
  await page.locator('#adminEmail').fill('synthetic@example.test');
  await page.locator('#adminPassword').fill('synthetic-password');
  await page.locator('#adminSigninForm button[type="submit"]').click();
  await expect(page.locator('#adminSigninStatus')).toContainText(
    'did not return the authenticator QR code',
  );
  await expect(page.locator('#adminSigninForm')).toBeVisible();
  await expect(page.locator('#portalApp')).toBeHidden();
  expect(requests.filter((r) => r.path.includes('/portal/admin/'))).toEqual([]);
});

test('employee registration sends exact fields and never enters the workspace', async ({
  page,
}) => {
  const requests = await employeeMode(page);
  let registration: unknown;
  await page.route('**/functions/v1/employee-register', async (route) => {
    registration = route.request().postDataJSON();
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"message":"Check email"}',
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Register an employee account' }).click();
  await expect(page).toHaveURL(/\/employee-setup\/$/);
  await page.getByLabel('Full name', { exact: true }).fill('Test Employee');
  await page.getByLabel('Work email', { exact: true }).fill('work@example.test');
  await page.getByLabel('Password', { exact: true }).fill('test-employee-password');
  await page.getByRole('button', { name: 'Create employee account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check your email.' })).toBeVisible();
  expect(registration).toEqual({
    displayName: 'Test Employee',
    email: 'work@example.test',
    password: 'test-employee-password',
  });
  await expect(page.locator('#emailConfirmation')).toBeVisible();
  expect(requests.filter((r) => r.path.includes('/portal/admin/'))).toHaveLength(0);
  await expect(page.locator('#setupPassword')).toHaveValue('');
});

test('personal credentials rejected before Auth or MFA requests', async ({ page }) => {
  const requests = await employeeMode(page);
  await page.route('**/functions/v1/employee-signin', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: '{"message":"Use your separate employee credentials."}',
    }),
  );
  await page.goto('/');
  await page.getByLabel('Operator email').fill('personal@example.test');
  await page.getByLabel('Password', { exact: true }).fill('personal-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#adminSigninStatus')).toContainText('separate employee');
  await expect(page.locator('#portalApp')).toBeHidden();
  expect(requests).toHaveLength(0);
});

test('employee verification retry needs only email and does not create a session', async ({
  page,
}) => {
  const requests = await employeeMode(page);
  let payload: unknown;
  await page.route('**/functions/v1/employee-register', async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'If this is an unverified employee account, check your email.',
      }),
    });
  });
  await page.goto('/');
  await page.getByLabel('Operator email').fill('work@example.test');
  await page.getByRole('button', { name: 'Resend verification email', exact: true }).click();
  await expect(page.locator('#adminSigninStatus')).toContainText('unverified employee');
  expect(payload).toEqual({ action: 'resend_verification', email: 'work@example.test' });
  await expect(page.locator('#portalApp')).toBeHidden();
  expect(requests).toHaveLength(0);
});
