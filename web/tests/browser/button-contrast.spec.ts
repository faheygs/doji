import { expect, test } from '@playwright/test';

for (const [name, url, label] of [
  ['admin', 'http://127.0.0.1:4310/announcements', 'New announcement'],
  ['business', 'http://127.0.0.1:4311/', 'Register your business'],
  ['website', 'http://127.0.0.1:4312/', 'See how it works'],
] as const) {
  test(`${name} filled actions use the shared accessible Doji palette`, async ({ page }) => {
    await page.goto(url);
    const action = page.getByRole('link', { name: label, exact: true });
    const labelColor = 'rgb(255, 255, 255)';
    await expect(action).toHaveCSS('color', labelColor);
    await expect(action).toHaveCSS('background-color', 'rgb(184, 59, 27)');
  await expect(action).toHaveCSS('border-radius', '12px');
    await expect(action).toHaveCSS('text-transform', 'none');
    await expect(action).toHaveClass(/MuiButton-contained/);
    await expect(page.locator('img[src="/doji-icon.png"]')).toBeVisible();
    await action.hover();
    await expect(action).toHaveCSS('color', labelColor);
    await expect(action).toHaveCSS('background-color', 'rgb(150, 48, 22)');
  });
}
