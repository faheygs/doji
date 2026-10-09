import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installBusinessFixture } from './business-fixture';
import { announcementFixture, announcementId } from '../announcement-fixture';
test('Overview is distinct; announcements have bounded reads, record navigation and no writes', async ({
  page,
  request,
}, testInfo) => {
  const base = await installBusinessFixture(page, request);
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  let fail = false;
  await page.route('**/api/session', (route) =>
    route.fulfill({
      json: {
        signedIn: true,
        assurance: 'aal2',
        csrf: 'c'.repeat(43),
        operator: {
          user_id: '10000000-0000-4000-8000-000000000001',
          display_name: 'Synthetic reviewer',
          capabilities: { operations_read: true },
        },
      },
    }),
  );
  await page.route('**/api/rpc', (route) => {
    const call = route.request().postDataJSON() as (typeof calls)[number];
    calls.push(call);
    if (call.name === 'get_admin_staff_event_channels_v1') return route.fulfill({ json: [] });
    if (call.name === 'get_admin_editorial_page_v1')
      return route.fulfill({
        json: {
          items: call.args.p_filter === 'draft' ? [] : [announcementFixture()],
          next_cursor: null,
          can_write: false,
        },
      });
    if (call.name === 'get_admin_editorial_item_v1')
      return fail
        ? route.fulfill({ status: 503, json: {} })
        : route.fulfill({ json: announcementFixture() });
    return route.fulfill({ status: 403, json: {} });
  });
  await page.goto('https://admin.dojipro.com/connected.html#/');
  await expect(page.getByRole('heading', { name: /Welcome back,/ })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Open business applications', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: 'Announcements', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Announcements', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('announcements-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: testInfo.outputPath('announcements-desktop.png'), fullPage: true });
  await page.getByRole('link', { name: 'Synthetic member message', exact: true }).click();
  await expect(page.getByText('Synthetic announcement body.', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Up to 2 displays per eligible account, at least 24 hours apart.'),
  ).toBeVisible();
  fail = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Retry announcement', exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic announcement body.', { exact: true })).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'Retry announcement', exact: true }).click();
  await expect(page.getByText('Synthetic announcement body.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to announcements', exact: true }).click();
  await page.getByRole('combobox', { name: 'Announcement status' }).click();
  await page.getByRole('option', { name: 'Drafts', exact: true }).click();
  await expect(
    page.getByText('No announcements match this status.', { exact: true }),
  ).toBeVisible();
  expect(calls.filter((call) => call.name.startsWith('admin_'))).toEqual([]);
  expect(
    calls
      .filter((call) => call.name === 'get_admin_editorial_page_v1')
      .every((call) => call.args.p_kind === 'announcements' && call.args.p_limit === 25),
  ).toBe(true);
  expect(base.external).toEqual([]);
});
test('business-only employee cannot read announcement deep links', async ({ page, request }) => {
  const base = await installBusinessFixture(page, request);
  await page.goto('https://admin.dojipro.com/connected.html#/announcements/' + announcementId);
  await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible();
  expect(base.reads).not.toContain('get_admin_editorial_item_v1');
});
