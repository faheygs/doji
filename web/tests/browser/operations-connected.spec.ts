import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installOperationsFixture } from './operations-fixture';
const url = 'https://admin.dojipro.com/connected.html#/operations';

test('authorized Operations renders real-contract graphs, issues and history without production traffic', async ({
  page,
  request,
}, info) => {
  const f = await installOperationsFixture(page, request);
  await page.goto(url);
  await expect(
    page.getByRole('heading', { name: 'Watch — review the affected signals' }),
  ).toBeVisible();
  await expect(page.getByText(/p95 180 ms/)).toBeVisible();
  const chart = page.getByRole('region', { name: 'Delivery latency by Doji', exact: true });
  await chart.getByRole('button', { name: 'View values' }).click();
  await expect(chart.getByRole('cell', { name: '620', exact: true })).toBeVisible();
  await expect(chart.locator('.MuiLineChart-mark')).toHaveCount(1);
  await expect(chart.locator('.MuiLineChart-mark')).toBeVisible();
  await expect(page.getByText('Illustrative dashboard only.', { exact: false })).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath('operations-connected.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('tab', { name: 'App issues', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Synthetic foreground timeout' })).toHaveAttribute(
    'href',
    'https://doji-i0.sentry.io/issues/1234567/',
  );
  await page.getByRole('tab', { name: 'Doji history', exact: true }).click();
  await expect(page.getByText('Synthetic Doji summary')).toBeVisible();
  await expect(page.getByText('Finalized', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const activeTab = page.getByRole('tab', { name: 'Doji history', exact: true });
  await expect(activeTab).toHaveAttribute('aria-selected', 'true');
  await activeTab.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: info.outputPath('operations-history-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(
    f.healthReads.every((x) =>
      x.name === 'portal_platform_health_v1'
        ? Object.keys(x.args).length === 0
        : x.args.p_limit === 12,
    ),
  ).toBe(true);
  expect(f.commands).toEqual([]);
  expect(f.external).toEqual([]);
});
test('denied Operations navigation does not dispatch health reads', async ({ page, request }) => {
  const f = await installOperationsFixture(page, request, false);
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Platform health', exact: true })).toHaveCount(0);
  expect(f.healthReads).toEqual([]);
});
test('expiry relabels in place without polling and foreground return reconciles', async ({
  page,
  request,
}) => {
  await page.clock.install();
  const f = await installOperationsFixture(page, request);
  await page.goto(url);
  await expect(page.getByText(/p95 180 ms/)).toBeVisible();
  const before = f.healthReads.length;
  await page.clock.fastForward(181000);
  await expect(page.getByText('Reading outdated').first()).toBeVisible();
  expect(f.healthReads).toHaveLength(before);
  f.change(await page.evaluate(() => Date.now()));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.clock.fastForward(300);
  await expect.poll(() => f.healthReads.length).toBe(before + 2);
  await expect(page.getByText(/8 overdue events/)).toBeVisible();
});
test('read failure clears prior issues and permission loss removes the protected view', async ({
  page,
  request,
}) => {
  const f = await installOperationsFixture(page, request);
  await page.goto(url);
  // Let the initial assessment settle before clicking a tab beneath it.
  await expect(page.getByText(/p95 180 ms/)).toBeVisible();
  await page.getByRole('tab', { name: 'App issues', exact: true }).click();
  await expect(page.getByText('Synthetic foreground timeout')).toBeVisible();
  f.fail();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('App-error monitoring is unavailable or outdated.')).toBeVisible();
  await expect(page.getByText('Synthetic foreground timeout')).toHaveCount(0);
  f.revoke();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'App issues', exact: true })).toHaveCount(0);
});
test('missing archived summaries cannot give a platform all clear', async ({ page, request }) => {
  const f = await installOperationsFixture(page, request);
  f.missingHistory();
  await page.goto(url);
  await expect(
    page.getByRole('heading', { name: 'Some health signals are unverified' }),
  ).toBeVisible();
  await expect(page.getByText('No recent summary', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Doji history', exact: true }).click();
  await expect(page.getByText('No archived Doji summaries returned.')).toBeVisible();
});
