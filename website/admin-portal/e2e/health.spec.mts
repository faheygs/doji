import { expect, test } from '../../coverage-fixture.mts';
import AxeBuilder from '@axe-core/playwright';
import { installMockBackend, seedAdminSession, operatorSession } from './fixtures.mts';
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
  await expect(page.locator('#platformStatusMetric')).toHaveText('Watch');
  await expect(page.locator('#operationsStatusPill')).toHaveText('Watch');
  await expect(page.locator('.sentryPanel')).toContainText('Could not load comments');
  await expect(page.getByRole('button', {name:'Refresh health',exact:true})).toHaveCount(0);
  await expect(page.locator('.opsAttention')).toContainText('App errors');
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
  await page.getByText('How health is assessed', {exact:true}).click();
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
  await expect(page.locator('.healthSignal').first()).toContainText('Reading outdated');
  await expect(page.locator('.sentryPanel .healthState')).toHaveText('Feed unavailable');
  expect(requests.length).toBe(before);
});

test('overview actually reads history and never reports unloaded history as missing', async ({page}) => {
  await seedAdminSession(page);
  const requests = await installMockBackend(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/platform-health-history?**', async route => {
    await gate;
    await route.fulfill({json: {items: []}});
  });
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  await page.locator('[data-view="operations"]').click();
  await expect(page.locator('.healthSignal').last()).toContainText('Loading history');
  await expect(page.locator('.eventHistoryPanel')).not.toContainText('No completed');
  release();
  await expect(page.locator('.healthSignal').last()).toContainText('No recent summary');
  expect(requests.filter(r => r.path.endsWith('/platform-health')).length).toBeLessThanOrEqual(2);
});

test('existing Doji events and reconnection update the visible health screen automatically', async ({page}) => {
  const requests = await open(page);
  await expect(page.locator('.opsReadiness')).toContainText('Event connection connected');
  await page.getByText('How health is assessed', {exact:true}).click();
  const before = requests.filter(r => r.path.endsWith('/platform-health')).length;
  let burstReads = 0;
  await page.route('**/portal/admin/platform-health', route => { burstReads++; return route.fulfill({json:{
    generated_at:new Date().toISOString(), operational:{...operational(),outbox_exhausted:1},
    sentry:{configured:true,available:true,issues:[]},
  }}); });
  await page.evaluate(() => {
    for (let i = 0; i < 20; i++) window.dispatchEvent(new CustomEvent('test-realtime-message', {detail:{channel:'doji:global',message:{name:'challenge.closed',data:{aggregateId:'fixture',eventId:String(i)}}}}));
  });
  await expect(page.locator('#operationsStatusPill')).toHaveText('Critical');
  expect(requests.filter(r => r.path.endsWith('/platform-health')).length).toBe(before);
  expect(burstReads).toBe(1);
  await expect(page.locator('.healthThresholds')).toHaveAttribute('open', '');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('test-realtime-connection',{detail:'disconnected'})));
  await expect(page.locator('.opsReadiness')).toContainText('Event connection interrupted');
  let reads = 0;
  await page.route('**/portal/admin/platform-health', route => { reads++; return route.fulfill({json:{generated_at:new Date().toISOString(),operational:operational(),sentry:{configured:true,available:true,issues:[]}}}); });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('test-realtime-connection',{detail:'connected'})));
  await expect(page.locator('#operationsStatusPill')).not.toHaveText('Critical');
  expect(reads).toBe(1);
});

test('event during a slow refresh is reconciled once after the pending read', async ({page}) => {
  await open(page);
  let reads = 0, active = 0, maxActive = 0;
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/portal/admin/platform-health', async route => {
    reads++; active++; maxActive=Math.max(maxActive,active);
    const first=reads===1;
    if (first) await gate;
    active--;
    await route.fulfill({json:{generated_at:new Date().toISOString(),operational:{...operational(),outbox_exhausted:first?0:1},sentry:{configured:true,available:true,issues:[]}}});
  });
  const event = () => page.evaluate(() => window.dispatchEvent(new CustomEvent('test-realtime-message',{detail:{channel:'doji:global',message:{name:'challenge.closed'}}})));
  await event();
  await expect.poll(()=>reads).toBe(1);
  for(let i=0;i<4;i++) await event();
  release();
  await expect(page.locator('#operationsStatusPill')).toHaveText('Critical');
  expect(reads).toBe(2);
  expect(maxActive).toBe(1);
});

test('operators without health permission do not fetch health or history', async ({page}) => {
  await seedAdminSession(page);
  const requests = await installMockBackend(page, {session:{...operatorSession, capabilities:{moderation_read:true,operations_read:false}}});
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  await expect(page.locator('[data-view="operations"]')).toBeHidden();
  expect(requests.filter(r => r.path.includes('platform-health'))).toHaveLength(0);
});

test('late health replies cannot restore protected readings after lock', async ({page}) => {
  await seedAdminSession(page);
  await installMockBackend(page);
  let release!:()=>void;
  const gate = new Promise<void>(resolve => { release=resolve; });
  await page.route('**/portal/admin/platform-health', async route => {await gate;await route.fulfill({json:{operational:operational(),sentry:{configured:true,available:true,issues:[{title:'Late protected issue'}]}}});});
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  await page.getByRole('button',{name:'Lock session'}).click();
  release();
  await expect(page.locator('#portalApp')).toBeHidden();
  await expect(page.locator('.opsGrid')).not.toContainText('Late protected issue');
});
