import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('operations exposes sample trends, coverage and issue details without network telemetry', async ({
  page,
}, testInfo) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:4310/')) external.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:4310/operations');
  await expect(page.getByText('Preview · disconnected', { exact: true })).toBeVisible();
  await expect(page.getByText(/Every number and graph here is synthetic/)).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Delivery latency by Doji', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('region', { name: 'Delivery latency by Doji', exact: true })
    .getByRole('button', { name: 'View values' })
    .click();
  await expect(
    page
      .getByRole('table', { name: 'Delivery latency by Doji values' })
      .getByRole('row', { name: 'Oct 5 Not measured' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Hide values' }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('operations-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Inspect services & coverage' }).click();
  await page.getByRole('button', { name: /API & database/ }).click();
  await expect(
    page.getByText('No qualified aggregate source in this migration').first(),
  ).toBeVisible();
  await page.getByRole('button', { name: /Realtime delivery/ }).click();
  await expect(page.getByText(/Not end-to-end device delivery/)).toBeVisible();
  await page.getByRole('tab', { name: 'App issues', exact: true }).click();
  await page.getByRole('button', { name: 'Push registration timeout' }).click();
  await expect(page.getByRole('region', { name: 'Example issue details' })).toBeVisible();
  await page.getByRole('button', { name: 'Close example detail' }).click();
  await page.getByRole('tab', { name: 'Doji history' }).click();
  await expect(
    page.getByRole('table', { name: 'Doji delivery history' }).getByRole('row'),
  ).toHaveCount(7);
  expect(external).toEqual([]);
});

test('operations preserves unknown and stale states, keyboard tabs and mobile layout', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4310/operations');
  await page.getByRole('combobox', { name: 'Preview scenario' }).click();
  await page.getByRole('option', { name: 'Not connected', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Platform status is unknown' })).toBeVisible();
  await expect(page.getByRole('img')).toHaveCount(0);
  await expect(page.getByText('No historical samples connected')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Overview', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: 'Services & coverage' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('Within target', { exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Preview scenario' }).click();
  await page.getByRole('option', { name: 'Stale readings' }).click();
  await expect(page.getByText('Stale', { exact: true })).toHaveCount(5);
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await expect(page.getByText('Current reading unavailable')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('operations-mobile-stale.png'),
    fullPage: true,
  });
});
