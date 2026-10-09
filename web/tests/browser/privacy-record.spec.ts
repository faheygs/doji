import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { privacyId } from '../privacy-fixture';
import { installPrivacyFixture, privacyUrl } from './privacy-fixture';
test('privacy queue has server state paging, row navigation, and full-page history without commands', async ({
  page,
  request,
}) => {
  const f = await installPrivacyFixture(page, request);
  await page.goto(privacyUrl);
  await expect(page.getByRole('table', { name: 'Business privacy requests' })).toBeVisible();
  await page.getByRole('button', { name: 'Go to next page', exact: true }).click();
  await expect(page.getByText('No requests match this status.')).toBeVisible();
  await page.getByRole('button', { name: 'Go to previous page', exact: true }).click();
  await page.getByRole('combobox', { name: 'Request status' }).click();
  await page.getByRole('option', { name: 'Completed', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Request status' })).toHaveText('Completed');
  await page.getByRole('table').getByRole('row').nth(1).getByRole('cell').last().click();
  await expect(
    page.getByRole('heading', { name: 'Business privacy request', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Privacy reviewer (you)', { exact: true })).toBeVisible();
  await expect(page.getByText('protected-reference-1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Go to next page', exact: true }).click();
  await expect(page.getByText('protected-reference-31', { exact: true })).toBeVisible();
  await expect(page.getByText('protected-reference-1', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Go to previous page', exact: true }).click();
  await expect(page.getByText('protected-reference-1', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to privacy requests' }).click();
  await expect(page.getByRole('combobox', { name: 'Request status' })).toHaveText('Completed');
  expect(
    f.calls
      .filter((call) => call.name === 'get_admin_business_privacy_page_v1')
      .some((call) => call.args.p_state === 'completed' && call.args.p_after_id === null),
  ).toBe(true);
  expect(f.calls.every((call) => call.name.startsWith('get_admin_'))).toBe(true);
  expect(f.external).toEqual([]);
});
test('privacy foreground reconciliation updates the read and denial removes all private evidence', async ({
  page,
  request,
}) => {
  const f = await installPrivacyFixture(page, request);
  await page.goto(privacyUrl + '/' + privacyId);
  await expect(page.getByText('verified-support-001', { exact: true })).toBeVisible();
  f.data.verification_reference = 'verified-support-002';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('verified-support-002', { exact: true })).toBeVisible();
  f.deny();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Retry privacy record' })).toBeVisible();
  await expect(page.getByText('verified-support-002', { exact: true })).toHaveCount(0);
  await expect(page.getByText('protected-reference-1', { exact: true })).toHaveCount(0);
});
test('privacy requires management permission for direct links, not only navigation', async ({
  page,
  request,
}) => {
  const f = await installPrivacyFixture(page, request, false);
  await page.goto(privacyUrl + '/' + privacyId);
  await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible();
  expect(
    f.calls.filter((call) => call.name.includes('privacy') || call.name.includes('ownership')),
  ).toEqual([]);
});
test('personal privacy rows preserve return navigation and mobile accessible record layout', async ({
  page,
  request,
}, info) => {
  const f = await installPrivacyFixture(page, request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('https://admin.dojipro.com/connected.html#/my-work');
  await page.getByRole('link', { name: 'Business privacy request', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Request details' })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('privacy-record-mobile.png') });
  await page.getByRole('link', { name: 'Back to my work' }).click();
  await expect(page.getByRole('heading', { name: 'My work' })).toBeVisible();
  expect(f.calls.every((call) => call.name.startsWith('get_admin_'))).toBe(true);
});
