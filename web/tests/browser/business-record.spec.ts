import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { businessId, installBusinessFixture } from './business-fixture';

const base = 'https://admin.dojipro.com/connected.html#/businesses';
test('business rows open a full-page record and assign once without required fields', async ({
  page,
  request,
}, info) => {
  const f = await installBusinessFixture(page, request);
  await page.goto(base);
  const row = page.getByRole('row').filter({ hasText: 'Synthetic business' });
  await row.getByRole('link', { name: 'Synthetic business', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(base + '/' + businessId);
  await expect(page.getByRole('heading', { name: 'Submitted application' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.locator('dd').filter({ hasText: /^Unassigned$/ })).toBeVisible();
  expect(f.commands).toEqual([]);
  await page
    .getByRole('button', { name: 'Assign to me', exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(page.getByText('Synthetic reviewer (you)', { exact: true })).toBeVisible();
  expect(f.commands).toHaveLength(1);
  expect(f.commands[0]).toMatchObject({
    p_kind: 'business_application',
    p_id: businessId,
    p_revision: 0,
    p_source_version: '3',
    p_action: 'claim',
    p_target: null,
  });
  expect(f.commands[0]?.p_request_id).toMatch(/^[a-f\d-]{36}$/);
  await expect(page.getByRole('button', { name: 'Assign to me', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Synthetic reviewer (you)', { exact: true })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('business-record-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('business-record-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Lock and sign out' }).click();
  await expect(page.getByText('Synthetic review history', { exact: false })).toHaveCount(0);
  expect(f.external).toEqual([]);
});
test('uncertain assignment retries only the identical intent', async ({ page, request }) => {
  const f = await installBusinessFixture(page, request, 'uncertain');
  await page.goto(base + '/' + businessId);
  await page.getByRole('button', { name: 'Assign to me', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry same assignment' })).toBeEnabled();
  expect(f.commands).toHaveLength(1);
  await page.getByRole('button', { name: 'Retry same assignment' }).click();
  await expect(page.getByText('Synthetic reviewer (you)', { exact: true })).toBeVisible();
  expect(f.commands).toHaveLength(2);
  expect(f.commands[1]).toEqual(f.commands[0]);
});
test('conflict requires refresh and denied detail reads clear all private record content', async ({
  page,
  request,
}) => {
  const f = await installBusinessFixture(page, request, 'conflict');
  await page.goto(base + '/' + businessId);
  await page.getByRole('button', { name: 'Assign to me', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Assign to me', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Retry same assignment' })).toHaveCount(0);
  expect(f.commands).toHaveLength(1);
  f.deny();
  await page.getByRole('button', { name: 'Refresh record' }).click();
  await expect(page.getByRole('button', { name: 'Retry record read' })).toBeVisible();
  await expect(page.getByText('Synthetic company', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Assign to me', exact: true })).toHaveCount(0);
  expect(f.commands).toHaveLength(1);
});

test('leaving during assignment fences the old view without claiming server rollback', async ({
  page,
  request,
}) => {
  const f = await installBusinessFixture(page, request, 'deferred');
  await page.goto(base + '/' + businessId);
  await page.getByRole('button', { name: 'Assign to me', exact: true }).click();
  await expect.poll(() => f.commands.length).toBe(1);
  await page.getByRole('link', { name: '← Business applications' }).click();
  await expect(page).toHaveURL(base);
  f.releaseCommand();
  await expect(page.getByRole('row').filter({ hasText: 'Synthetic business' })).toBeVisible();
  await expect(page.getByText('Assignment recorded.', { exact: false })).toHaveCount(0);
  await page.getByRole('link', { name: 'Synthetic business', exact: true }).click();
  await expect(page.getByText('Synthetic reviewer (you)', { exact: true })).toBeVisible();
  expect(f.commands).toHaveLength(1);
});

test('returning to the app reconciles ownership through authorized reads without a command', async ({
  page,
  request,
}) => {
  const f = await installBusinessFixture(page, request);
  await page.goto(base + '/' + businessId);
  await expect(page.getByRole('button', { name: 'Assign to me', exact: true })).toBeVisible();
  const reads = f.reads.length;
  f.assignExternally();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Synthetic reviewer (you)', { exact: true })).toBeVisible();
  expect(f.reads.length).toBeGreaterThan(reads);
  expect(f.commands).toEqual([]);
  expect(f.external).toEqual([]);
});
