import { expect, test } from '@playwright/test';
import { installOperationsFixture } from './operations-fixture';

test('cached health stays visible on other pages and refreshes without aggregate reads or writes', async ({
  page,
  request,
}) => {
  const f = await installOperationsFixture(page, request, true, undefined, true);
  await page.clock.install();
  await page.goto('https://admin.dojipro.com/connected.html#/businesses');
  await expect(page.getByRole('button', { name: 'Health: limited coverage' })).toBeVisible();
  // Vite development StrictMode can abort/restart the initial read on remount.
  const initialReads = f.summaryReads.length;
  expect(initialReads).toBeGreaterThanOrEqual(1);
  expect(initialReads).toBeLessThanOrEqual(2);
  expect(f.healthReads).toHaveLength(0);
  f.changeSummary(false, new Date().toISOString());
  await page.clock.runFor(61000);
  await expect(page.getByRole('button', { name: 'Health: attention needed' })).toBeVisible();
  expect(f.summaryReads).toHaveLength(initialReads + 1);
  expect(f.healthReads).toHaveLength(0);
  await page.getByRole('button', { name: 'Health: attention needed' }).click();
  await expect(page.getByRole('heading', { name: 'Platform health', exact: true })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Live-update speed by Doji', exact: true })
      .locator('.MuiLineChart-mark'),
  ).toBeVisible();
  await expect(page.getByText('Updating authorized readings…')).toHaveCount(0);
  const operationsReads = f.healthReads.length;
  f.change();
  await page.clock.runFor(61000);
  await expect.poll(() => f.healthReads.length).toBeGreaterThan(operationsReads);
  await expect(page.getByText(/8 updates are overdue for publication/)).toBeVisible();
  await expect(page.getByText('Updating authorized readings…')).toHaveCount(0);
  expect(f.commands).toEqual([]);
  expect(f.external).toEqual([]);
});
