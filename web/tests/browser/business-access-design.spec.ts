import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
  );
  await page.goto('/preview/access');
});
test('closed registration is centered on desktop with compact aligned actions', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole('tab', { name: 'Registration closed' }).click();
  const heading = page.getByRole('heading', { name: 'Business registration is currently closed' });
  await expect(heading).toBeVisible();
  const card = page.locator('.MuiPaper-root').filter({ has: heading });
  const bounds = await card.boundingBox();
  expect(bounds).not.toBeNull();
  expect(Math.abs(bounds!.x + bounds!.width / 2 - 960)).toBeLessThan(2);
  expect(bounds!.width).toBeLessThanOrEqual(520);
  const button = await card.getByRole('button', { name: 'Sign in', exact: true }).boundingBox();
  expect(button!.width).toBeLessThan(180);
  expect(button!.height).toBeLessThan(50);
  await page.screenshot({ path: info.outputPath('closed-desktop.png'), fullPage: true });
});
test('sign in and recovery stay in the Doji screen with native MUI fields', async ({
  page,
}, info) => {
  await page.getByRole('textbox', { name: 'Work email' }).fill('sample@example.com');
  await page.getByLabel(/^Password/).fill('sample-password');
  await page.screenshot({ path: info.outputPath('signin-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible();
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
  await expect(page).toHaveURL(/127\.0\.0\.1:4314\/preview\/access/);
});
test('signup, email verification and MFA use the shared bounded card', async ({ page }) => {
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByRole('textbox', { name: 'Work email' }).fill('sample@example.com');
  await page.getByLabel(/^Password/).fill('sample-password');
  await page.getByRole('checkbox', { name: /I represent/ }).check();
  await page.getByRole('checkbox', { name: /I acknowledge/ }).check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Email verification code').fill('123456');
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'You’re ready' })).toBeVisible();
  await page.getByRole('tab', { name: 'mfa', exact: true }).click();
  await expect(page.getByLabel('Authenticator code')).toHaveAttribute(
    'autocomplete',
    'one-time-code',
  );
});
test('all account states fit narrow screens without stretching action buttons', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ['register', 'verify', 'recover', 'reset', 'mfa', 'Registration closed']) {
    await page.getByRole('tab', { name, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
  }
  await page.screenshot({ path: info.outputPath('closed-mobile.png'), fullPage: true });
});
