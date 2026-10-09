import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installBusinessFixture } from './business-fixture';
test('branded overview is bounded, account menu is keyboard accessible, and business columns fit their job', async ({
  page,
  request,
}, testInfo) => {
  const fixture = await installBusinessFixture(page, request);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('https://admin.dojipro.com/connected.html#/');
  await expect(page.getByRole('heading', { name: 'Needs attention', exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  // One bounded page, with at most one initial socket/reconnect reconciliation.
  const intakeReads = fixture.reads.filter((name) => name === 'get_admin_staff_work_page_v1');
  expect(intakeReads.length).toBeGreaterThanOrEqual(1);
  expect(intakeReads.length).toBeLessThanOrEqual(2);
  await expect(page.getByText('not organization-wide totals', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Announcements', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'View platform health' })).toHaveCount(0);
  expect(
    await page.getByRole('main').evaluate((element) => element.getBoundingClientRect().width),
  ).toBeGreaterThan(1600);
  await page.screenshot({
    path: testInfo.outputPath('overview-connected-desktop.png'),
    fullPage: true,
  });
  const account = page.getByRole('button', { name: 'Account menu' });
  await account.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Lock and sign out' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(account).toBeFocused();
  await page.getByRole('link', { name: 'Business applications', exact: true }).click();
  const table = page.getByRole('table', { name: 'Business applications', exact: true });
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader')).toHaveText([
    'Business',
    'Received',
    'Assignee',
    'Status',
  ]);
  await page.screenshot({
    path: testInfo.outputPath('business-connected-desktop.png'),
    fullPage: true,
  });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Desktop-readable type can move the footer below the fold in a narrow window.
  // It must remain reachable without scrolling the table body to the last row.
  await page.getByRole('button', { name: 'Go to next page' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Go to next page' })).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath('business-connected-mobile.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Needs attention', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('overview-connected-mobile.png'),
    fullPage: true,
  });
  expect(fixture.commands).toEqual([]);
  expect(fixture.external).toEqual([]);
});

test('overview clears prior case content after a failed authorized read', async ({
  page,
  request,
}) => {
  const fixture = await installBusinessFixture(page, request);
  await page.goto('https://admin.dojipro.com/connected.html#/');
  await expect(page.getByRole('heading', { name: 'Needs attention', exact: true })).toBeVisible();
  await page.route('**/api/rpc', async (route) => {
    const body = route.request().postDataJSON() as { name: string };
    if (body.name === 'get_admin_staff_work_page_v1')
      return route.fulfill({ status: 503, json: {} });
    return route.fallback();
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Retry intake' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Items needing attention' })).toHaveCount(0);
  expect(fixture.commands).toEqual([]);
});
