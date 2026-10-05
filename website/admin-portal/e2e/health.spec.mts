import { expect, test } from '../../coverage-fixture.mts';
import AxeBuilder from '@axe-core/playwright';
import { installMockBackend, seedAdminSession } from './fixtures.mts';
import type { MockOptions } from './fixtures.mts';
import type { Page } from '@playwright/test';

const operational = () => ({
  available: true,
  healthy: true,
  checked_at: new Date().toISOString(),
  realtime_p95_ms_5m: 180,
  realtime_max_ms_5m: 220,
  realtime_sample_count_5m: 66,
  realtime_over_5s_5m: 0,
  outbox_overdue: 0,
  outbox_exhausted: 0,
  push_stale_shards: 0,
  push_exhausted_shards: 0,
  apns_provider_credential_errors: 0,
});
async function open(page: Page, options: MockOptions = {}) {
  await seedAdminSession(page);
  const requests = await installMockBackend(page, options);
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  await page.getByRole('button', { name: 'Platform operations', exact: true }).click();
  await expect(page.locator('.healthSignalGrid')).toBeVisible();
  await expect(page.locator('[data-portal-view="operations"]')).not.toHaveAttribute(
    'aria-busy',
    'true',
  );
  return requests;
}

test('app errors prevent an all-clear even after delivery recovers', async ({ page }) => {
  const requests = await open(page, {
    platformHealth: {
      operational: operational(),
      sentry: {
        configured: true,
        available: true,
        issues: [
          { title: 'Could not load comments', level: 'error', event_count: 4, affected_users: 2 },
        ],
      },
    },
  });
  await expect(page.locator('#platformStatusMetric')).toHaveText('Degraded');
  await expect(page.locator('#operationsStatusPill')).toHaveText('Degraded');
  await expect(page.locator('.sentryPanel')).toContainText('Could not load comments');
  const before = requests.filter((r) => r.path.endsWith('/platform-health')).length;
  await page.getByRole('button', { name: 'Refresh health', exact: true }).click();
  await expect
    .poll(() => requests.filter((r) => r.path.endsWith('/platform-health')).length)
    .toBeGreaterThan(before);
  expect(
    requests.filter((r) => r.method === 'POST' && !r.path.endsWith('/realtime-token')),
  ).toHaveLength(0);
});

test('recent incident remains visible and empty Sentry failure is unknown', async ({ page }) => {
  await open(page, {
    platformHealth: {
      operational: operational(),
      sentry: { configured: true, available: false, issues: [] },
    },
    healthHistory: [
      {
        title: 'Test Doji',
        healthy: true,
        fires_at: new Date(Date.now() - 7200000).toISOString(),
        observed_through: new Date(Date.now() - 3600000).toISOString(),
        finalized_at: new Date().toISOString(),
        realtime_p95_ms: 22656,
        realtime_max_ms: 103938,
        realtime_sample_count: 66,
        realtime_over_5s: 18,
      },
    ],
  });
  await expect(page.locator('#operationsStatusPill')).toHaveText('Watch');
  await expect(page.locator('.eventHealthRow')).toContainText('Critical');
  await expect(page.locator('.eventHealthRow')).toContainText('103938');
  await expect(page.locator('.sentryPanel .healthState')).toHaveText('Feed unavailable');
});

for (const width of [1440, 900, 390]) {
  test(`header stays flush with viewport when scrolled at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await seedAdminSession(page);
    await installMockBackend(page);
    await page.goto('/');
    await expect(page.locator('#portalApp')).toBeVisible();
    if (width <= 1080) await page.locator('#mobileMenu').click();
    await page.getByRole('button', { name: 'Platform operations', exact: true }).click();
    await expect(page.locator('.healthSignalGrid')).toBeVisible();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
      await page.evaluate(() => window.scrollTo(0, 600));
      const rect = await page.evaluate(() => {
        const header = document.querySelector('.adminTopbar');
        const bar = document.querySelector('#adminEnvironmentBar');
        if (!header || !bar) throw Error('Missing portal header');
        return {
          top: header.getBoundingClientRect().top,
          barBottom: bar.getBoundingClientRect().bottom,
          background: getComputedStyle(header).backgroundColor,
          width: document.documentElement.clientWidth,
          scrollWidth: document.body.scrollWidth,
        };
      });
      expect(rect.top).toBe(0);
      expect(rect.barBottom).toBe(0);
      expect(rect.background).toMatch(/^rgb\(/);
      expect(rect.scrollWidth).toBeLessThanOrEqual(rect.width + 1);
    }
    await page.screenshot({ path: `test-results/operations-scrolled-${width}.png` });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `test-results/operations-${width}.png`, fullPage: true });
  });
}

test('operations has no serious accessibility violations', async ({ page }) => {
  await open(page);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    const colors = await page
      .locator('.healthThresholds .healthState')
      .evaluateAll((items) => items.map((item) => getComputedStyle(item).color));
    expect(new Set(colors).size).toBe(5);
    const result = await new AxeBuilder({ page })
      .include('[data-portal-view="operations"]')
      .analyze();
    expect(
      result.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? '')),
    ).toEqual([]);
  }
});

test('stale data reclassifies in place without new network polling', async ({ page }) => {
  await page.clock.install();
  const requests = await open(page);
  const before = requests.length;
  await page.clock.fastForward(241000);
  await expect(page.locator('.healthSignal').first()).toContainText('Refresh needed');
  await expect(page.locator('.sentryPanel .healthState')).toHaveText('Feed unavailable');
  expect(requests.length).toBe(before);
});
