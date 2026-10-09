import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('every admin navigation destination has a stable full-page route', async ({ page }) => {
  await page.goto('http://127.0.0.1:4310/');
  const links = await page
    .getByRole('navigation', { name: 'Workspace navigation' })
    .getByRole('link')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('href')));
  expect(links).toHaveLength(12);
  for (const path of links) {
    await page.goto('http://127.0.0.1:4310' + path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toHaveCount(0);
    await expect(page.locator('a[aria-current=page]')).toHaveCount(1);
  }
});

test('admin overview, personal work, full-page records and queue state consistency', async ({
  page,
}, testInfo) => {
  const productionCalls: string[] = [];
  page.on('request', (request) => {
    if (/\/(api|auth|portal\/admin)\//.test(request.url())) productionCalls.push(request.url());
  });
  await page.goto('http://127.0.0.1:4310/');
  await expect(page.getByRole('heading', { name: /Welcome back,/ })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Daily Doji', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('overview-desktop.png'), fullPage: true });
  await page.getByRole('link', { name: 'My work', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Unassigned', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Trust & safety', exact: true }).click();
  const frame = page.getByRole('region', { name: 'Trust & safety', exact: true });
  const initial = await frame.boundingBox();
  await page.getByRole('button', { name: 'Go to next page', exact: true }).click();
  await expect(page.getByText('11–14 of 14')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to next page' })).toBeDisabled();
  expect((await frame.boundingBox())?.height).toBe(initial?.height);
  await page.getByRole('button', { name: 'Go to previous page', exact: true }).click();
  await page.getByRole('row', { name: 'Open Sample review record 1', exact: true }).click();
  await expect(page).toHaveURL(/trust-safety\/sample-1$/);
  await expect(page.getByRole('heading', { name: 'At a glance' })).toBeVisible();
  await expect(page.getByText('Assignee', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('record-desktop.png'), fullPage: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Record details' })).toBeVisible();
  await page.getByRole('link', { name: 'Audit log', exact: true }).click();
  await page.getByRole('combobox', { name: 'Preview state' }).click();
  await page.getByRole('option', { name: 'Loading', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Loading Audit log' })).toBeVisible();
  expect(
    (await page.getByRole('region', { name: 'Audit log', exact: true }).boundingBox())?.height,
  ).toBe(initial?.height);
  await page.getByRole('link', { name: 'Platform health', exact: true }).click();
  await expect(page.getByText('Preview · disconnected', { exact: true })).toBeVisible();
  await expect(page.getByText(/Every number and graph here is synthetic/)).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(productionCalls).toEqual([]);
});

test('mobile navigation, search reset and keyboard row activation', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4310/');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('link', { name: 'Business applications', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(
    page.getByRole('heading', { level: 1, name: 'Business applications' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Go to next page', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search records' }).fill('application 14');
  await expect(page.getByText('1–1 of 1', { exact: true })).toBeVisible();
  const row = page.getByRole('row', { name: 'Open Sample business application 14', exact: true });
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/businesses\/sample-14$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('record-mobile.png'), fullPage: true });
});

test('business shares the shell without making its public root an application', async ({
  page,
}, testInfo) => {
  await page.goto('http://127.0.0.1:4311/');
  await page.getByRole('link', { name: 'Explore workspace design' }).click();
  await expect(page.getByRole('heading', { name: 'Your business, in one place.' })).toBeVisible();
  await page.getByRole('link', { name: 'Your application', exact: true }).click();
  await expect(page.locator('a[aria-current=page]')).toHaveCount(1);
  await expect(page.getByText(/Actual status is unavailable/)).toBeVisible();
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('business-workspace.png'), fullPage: true });
  await page.getByRole('link', { name: 'Business website' }).click();
  await expect(page.getByRole('heading', { name: 'Be part of the moment.' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
