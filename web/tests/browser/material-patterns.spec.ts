import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('navigation drawer keeps keyboard focus and restores it on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4310/');
  const trigger = page.getByRole('button', { name: 'Menu', exact: true, includeHidden: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-controls', 'workspace-menu');
  const drawer = page.locator('#workspace-menu');
  await expect(drawer).toBeVisible();
  await page.getByRole('button', { name: 'Close menu' }).focus();
  await page.keyboard.press('Shift+Tab');
  expect(await drawer.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('table footer stays outside scroll content and select supports keyboard dismissal', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4310/trust-safety');
  const footer = page.locator('.MuiTablePagination-root');
  const before = await footer.boundingBox();
  const body = page.locator('.MuiTableContainer-root');
  await body.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.scrollLeft = el.scrollWidth;
  });
  expect(await footer.boundingBox()).toEqual(before);
  expect(await footer.locator('button').count()).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const select = page.getByRole('combobox', { name: 'Preview state' });
  await select.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).not.toBeVisible();
  await expect(select).toBeFocused();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('table-mobile.png'), fullPage: true });
});
