import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installOperationsFixture, installHealthRealtime } from './operations-fixture';
const url = 'https://admin.dojipro.com/connected.html#/operations';

test('monitor history preserves uncertainty, source age and bounded pagination without commands', async ({
  page,
  request,
}) => {
  const f = await installOperationsFixture(page, request);
  const at = new Date(Date.now() - 240000).toISOString();
  f.monitorHistory({
    enabled: true,
    available: true,
    latest: [
      { monitor: 'worker', state: 'healthy', family: null, observed_at: at },
      { monitor: 'watchdog', state: null, family: null, observed_at: null },
    ],
    incidents: Array.from({ length: 6 }, (_, index) => ({
      id: 6 - index,
      monitor: 'worker',
      family: 'domain-outbox-delayed',
      opened_at: at,
      last_observed_at: at,
      ended_at: index === 0 ? null : at,
      ended_reason: index === 0 ? null : index === 1 ? 'superseded' : 'recovered',
    })),
  });
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Platform health', exact: true })).toBeVisible();
  await expect(
    page.getByText(/95% of measured updates were published within 0.18 seconds/),
  ).toBeVisible();
  await expect(page.getByText('Updating authorized readings…')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Monitor incidents' }).click();
  await expect(page.getByRole('tab', { name: 'Monitor incidents' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('Report is outdated', { exact: true })).toBeVisible();
  await expect(page.getByText('No observation recorded', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('cell', { name: 'Issue changed; recovery not confirmed' }),
  ).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Open at last observation' })).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Recorded monitor incidents' }).getByRole('row'),
  ).toHaveCount(6);
  await page.getByRole('button', { name: 'Go to next page' }).click();
  await expect(
    page.getByRole('table', { name: 'Recorded monitor incidents' }).getByRole('row'),
  ).toHaveCount(2);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  f.monitorHistory({ enabled: true, available: false });
  await page.getByRole('button', { name: 'Refresh readings' }).click();
  await expect(page.getByText(/Monitor history is unavailable/)).toBeVisible();
  expect(f.commands).toEqual([]);
  expect(f.external).toEqual([]);
});

test('monitor observation expires locally without manufacturing a new report or request', async ({
  page,
  request,
}) => {
  await page.clock.install();
  const f = await installOperationsFixture(page, request);
  const at = new Date(await page.evaluate(() => Date.now())).toISOString();
  f.monitorHistory({
    enabled: true,
    available: true,
    incidents: [],
    latest: [
      { monitor: 'worker', state: 'healthy', family: null, observed_at: at },
      { monitor: 'watchdog', state: null, family: null, observed_at: null },
    ],
  });
  await page.goto(url);
  await expect(
    page.getByText(/95% of measured updates were published within 0.18 seconds/),
  ).toBeVisible();
  await expect(page.getByText('Updating authorized readings…')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Monitor incidents' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Monitor incidents' });
  await expect(panel.getByText('Measured checks passed', { exact: true })).toBeVisible();
  const before = f.healthReads.length;
  await page.clock.fastForward(181000);
  await expect(panel.getByText('Report is outdated', { exact: true })).toBeVisible();
  await expect(panel.getByText('No observation recorded', { exact: true })).toBeVisible();
  expect(f.healthReads).toHaveLength(before);
  expect(f.commands).toEqual([]);
  expect(f.external).toEqual([]);
});

test('open health screen updates automatically and recovers missed observations after channel interruption', async ({
  page,
  request,
}) => {
  const f = await installOperationsFixture(page, request, true, installHealthRealtime);
  f.healthEvents(true);
  await page.goto(url);
  await expect(page.getByText('Health updates: connected', { exact: true })).toBeVisible();
  await expect(
    page.getByText(/95% of measured updates were published within 0.18 seconds/),
  ).toBeVisible();
  await expect(page.getByText('Updating authorized readings…')).toHaveCount(0);
  f.change();
  f.healthEvents(true);
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('test-health-message', {
        detail: { name: 'staff.health.changed', data: { source: 'delivery', revision: '1' } },
      }),
    ),
  );
  await expect(page.getByText(/8 updates are overdue for publication/)).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('test-health-channel', { detail: 'suspended' })),
  );
  await expect(page.getByText('Health updates: interrupted', { exact: true })).toBeVisible();
  f.sentry({
    configured: true,
    available: true,
    observed_at: new Date().toISOString(),
    issues: [],
  });
  // No message is replayed: reattachment must reconcile authoritative data itself.
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('test-health-channel', { detail: 'attached' })),
  );
  await expect(page.getByText('Health updates: connected', { exact: true })).toBeVisible();
  await expect(page.getByText(/No unresolved issues returned for this environment/)).toBeVisible();
  await expect(page.getByText('Updating authorized readings…')).toHaveCount(0);
  const reads = f.healthReads.length;
  f.revoke();
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('test-health-message', {
        detail: { name: 'staff.health.changed', data: { source: 'delivery', revision: '2' } },
      }),
    ),
  );
  await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible();
  expect(f.healthReads).toHaveLength(reads);
  expect(f.commands).toEqual([]);
  expect(f.external).toEqual([]);
});

test('backend receipts explain partial cleanup, pagination and stale readings without writes', async ({
  page,
  request,
}) => {
  const f = await installOperationsFixture(page, request);
  const at = new Date().toISOString();
  const hour = new Date(Math.floor(Date.now() / 3600000) * 3600000).toISOString();
  f.workflows({
    available: true,
    enabled: true,
    retention_enabled: false,
    observed_at: at,
    hours: [
      {
        workflow: 'maintenance',
        outcome: 'failed',
        hour,
        attempts: 2,
        elapsed_ms: 1500,
        counts: { deleted_post_media: 3 },
      },
    ],
    receipts: [
      {
        workflow: 'maintenance',
        outcome: 'failed',
        observed_at: at,
        phase: 'post_media',
        counts: { deleted_post_media: 3 },
      },
    ],
    scheduler_receipt: null,
  });
  await page.goto(url);
  await expect(
    page.getByRole('heading', { name: 'Needs attention — review the affected signals' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Backend & cleanup' }).click();
  await expect(page.getByRole('heading', { name: 'Backend processing & cleanup' })).toBeVisible();
  await expect(
    page.getByRole('cell', { name: 'Post media objects removed: 3', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Disabled. This screen does not enable deletion.')).toBeVisible();
  await expect(page.getByRole('combobox', { name: /Rows per page/ })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  f.workflows({
    available: true,
    enabled: true,
    retention_enabled: false,
    observed_at: new Date(Date.now() - 240000).toISOString(),
    hours: [],
    receipts: [],
    scheduler_receipt: null,
  });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Needs attention — review the affected signals' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Backend & cleanup' }).click();
  await expect(page.getByText(/Backend workflow readings are outdated/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  expect(f.commands).toEqual([]);
  expect(f.external).toEqual([]);
});

test('authorized Operations renders real-contract graphs, issues and history without production traffic', async ({
  page,
  request,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await installOperationsFixture(page, request);
  await page.goto(url);
  await expect(
    page.getByRole('heading', { name: 'Needs attention — review the affected signals' }),
  ).toBeVisible();
  await expect(
    page.getByText(/95% of measured updates were published within 0.18 seconds/),
  ).toBeVisible();
  const chart = page.getByRole('region', { name: 'Live-update speed by Doji', exact: true });
  await chart.getByRole('button', { name: 'View values' }).click();
  await expect(chart.getByRole('cell', { name: '0.62', exact: true })).toBeVisible();
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
  await page.getByRole('tab', { name: 'Services & coverage', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Not yet verified by this screen' }),
  ).toBeVisible();
  await expect(page.getByText('Not measured', { exact: true })).toHaveCount(7);
  await expect(page.getByRole('heading', { name: 'Content cleanup', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'App issues', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Synthetic foreground timeout' })).toHaveAttribute(
    'href',
    'https://doji-i0.sentry.io/issues/1234567/',
  );
  await page.getByRole('tab', { name: 'Doji history', exact: true }).click();
  await expect(page.getByText('Synthetic Doji summary')).toBeVisible();
  await expect(page.getByText('Finalized', { exact: true })).toBeVisible();
  await expect(page.getByText('95% within 0.62 seconds')).toBeVisible();
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
  await expect(
    page.getByText(/95% of measured updates were published within 0.18 seconds/),
  ).toBeVisible();
  await expect(page.getByText('Updating authorized readings…')).toHaveCount(0);
  const before = f.healthReads.length;
  await page.clock.fastForward(181000);
  await expect(page.getByText('Reading outdated').first()).toBeVisible();
  expect(f.healthReads).toHaveLength(before);
  f.change(await page.evaluate(() => Date.now()));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.clock.fastForward(300);
  await expect.poll(() => f.healthReads.length).toBe(before + 2);
  await expect(page.getByText(/8 updates are overdue for publication/)).toBeVisible();
});
test('read failure clears prior issues and permission loss removes the protected view', async ({
  page,
  request,
}) => {
  const f = await installOperationsFixture(page, request);
  await page.goto(url);
  // Let the initial assessment settle before clicking a tab beneath it.
  await expect(
    page.getByText(/95% of measured updates were published within 0.18 seconds/),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'App issues', exact: true }).click();
  await expect(page.getByText('Synthetic foreground timeout')).toBeVisible();
  f.fail();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(
    page.getByText('The platform-health read failed. Retry to reconnect.'),
  ).toBeVisible();
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

test('provider timeout is actionable and a manual refresh recovers without reloading', async ({
  page,
  request,
}) => {
  const f = await installOperationsFixture(page, request);
  f.sentry({
    configured: true,
    available: false,
    issues: [],
    failure: 'timeout',
    phase: 'headers',
    attempted_at: new Date().toISOString(),
    elapsed_ms: 10000,
  });
  f.healthEvents(false);
  await page.goto(url);
  await expect(page.getByText(/Sentry did not respond in time/)).toBeVisible();
  await expect(page.getByText(/verified Sentry observation time/)).toHaveCount(0);
  await page.getByRole('tab', { name: 'Services & coverage', exact: true }).click();
  await expect(page.getByText('Not enabled', { exact: true })).toBeVisible();
  f.change();
  f.healthEvents(true);
  await page.getByRole('button', { name: 'Refresh readings', exact: true }).click();
  await expect(page.getByText('Enabled by server', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'App issues', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Synthetic foreground timeout' })).toBeVisible();
  expect(f.commands).toEqual([]);
  expect(f.external).toEqual([]);
});

test('changing health sections refreshes expired observations without recurring polling', async ({
  page,
  request,
}) => {
  await page.clock.install();
  const f = await installOperationsFixture(page, request);
  await page.goto(url);
  await expect(
    page.getByText(/95% of measured updates were published within 0.18 seconds/),
  ).toBeVisible();
  await expect(page.getByText('Updating authorized readings…')).toHaveCount(0);
  const before = f.healthReads.length;
  await page.clock.fastForward(181000);
  expect(f.healthReads).toHaveLength(before);
  f.change(await page.evaluate(() => Date.now()));
  await page.getByRole('tab', { name: 'App issues', exact: true }).click();
  await expect.poll(() => f.healthReads.length).toBe(before + 2);
  await expect(page.getByRole('link', { name: 'Synthetic foreground timeout' })).toBeVisible();
  expect(f.external).toEqual([]);
});
