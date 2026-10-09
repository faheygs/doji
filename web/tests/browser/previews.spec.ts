import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('admin deep links, responsive form and stable table geometry', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:4310/announcements');
  const table = page.getByRole('region', { name: 'announcements', exact: true });
  const initial = await table.boundingBox();
  await page.getByRole('combobox', { name: 'Preview table state' }).click();
  await page.getByRole('option', { name: 'Loading', exact: true }).click();
  await expect(page.getByRole('progressbar')).toBeVisible();
  const loading = await table.boundingBox();
  expect(loading?.height).toBe(initial?.height);
  await page.getByRole('link', { name: 'New announcement' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('A clear announcement');
  await expect(page.getByRole('heading', { name: 'A clear announcement' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish now' })).toBeDisabled();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('admin-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('textbox', { name: 'Title' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('admin-mobile.png'), fullPage: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'New announcement', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('business root stays public and preview never asks for credentials', async ({
  page,
}, testInfo) => {
  const calls: string[] = [];
  page.on('request', (request) => {
    if (/\/(api|auth)\//.test(request.url())) calls.push(request.url());
  });
  await page.goto('http://127.0.0.1:4311/');
  await expect(page.getByRole('heading', { name: 'Be part of the moment.' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('business-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('business-mobile.png'), fullPage: true });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('link', { name: 'Register your business' }).click();
  await expect(
    page.getByText('Authentication is not connected in this migration preview.'),
  ).toBeVisible();
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  expect(calls).toEqual([]);
});

test('public homepage renders without JavaScript and hydrates cleanly', async ({
  browser,
  page,
}, testInfo) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await context.newPage();
  await staticPage.goto('http://127.0.0.1:4312/');
  await expect(staticPage.getByRole('heading', { level: 1 })).toContainText('Ten minutes.');
  await expect(staticPage.locator('link[rel=canonical]')).toHaveAttribute(
    'href',
    'https://dojipro.com/',
  );
  await context.close();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:4312/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('site-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('site-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
});
