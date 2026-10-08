import { test, expect } from '../../coverage-fixture.mts';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { operatorSession } from './fixtures.mts';
import { businessId } from './workflow-fixture.mts';
import type { Page } from '@playwright/test';
declare global {
  interface Window {
    workflowLiveHint?: () => void;
    workflowSubscribed?: string[];
    healthLiveHint?: (revision: string) => void;
  }
}
async function install(
  page: Page,
  enabled = true,
  preview = false,
  limited = false,
  unifiedSafety = false,
  healthEvents = false,
) {
  const operator = limited
    ? {
        ...operatorSession,
        roles: ['business_reviewer'],
        capabilities: {
          moderation_read: false,
          moderation_write: false,
          restricted_review: false,
          operations_read: false,
          business_read: true,
          legal_read: false,
          operator_manage: false,
        },
      }
    : operatorSession;
  const prefix = preview ? '/identity/employee-preview' : '';
  const root = resolve(
    preview
      ? 'website/.business-admin-qa-20261007'
      : process.env.DOJI_WORKFLOW_RELEASE_DIR || 'website/.business-admin-qa-20261006',
  );
  await readFile(resolve(root, 'index.html'));
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  await page.addInitScript(() => {
    window.workflowSubscribed = [];
    class FixtureRealtime {
      connection = { on() {} };
      channels = {
        get: (name: string) => ({
          subscribe: async (callback: (message: unknown) => void) => {
            window.workflowSubscribed?.push(name);
            if (name === 'staff:health:operations')
              window.healthLiveHint = (revision) =>
                callback({ name: 'staff.health.changed', data: { source: 'delivery', revision } });
            if (name === 'staff:workflow:business')
              window.workflowLiveHint = () =>
                callback({
                  name: 'staff.queue.changed',
                  data: { kind: 'business_application', eventId: 'synthetic-live-event' },
                });
          },
        }),
      };
      connect() {}
      close() {}
    }
    window.Ably = {
      Realtime: FixtureRealtime as unknown as NonNullable<Window['Ably']>['Realtime'],
    };
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://admin.dojipro.com') return route.abort();
    if (url.pathname === '/api/session')
      return route.fulfill({
        json: {
          signedIn: true,
          assurance: 'aal2',
          csrf: 'c'.repeat(43),
          operator,
        },
      });
    if (url.pathname === '/api/rpc') {
      const body = route.request().postDataJSON() as {
        name: string;
        args: Record<string, unknown>;
      };
      calls.push(body);
      let json: unknown = { items: [], next_cursor: null };
      if (body.name === 'get_admin_portal_session_v3') json = operator;
      if (body.name.includes('command_center')) json = { metrics: {}, work_items: [] };
      if (body.name === 'get_admin_staff_event_channels_v1') json = ['staff:workflow:business'];
      if (body.name === 'get_admin_safety_work_page_v1')
        json = {
          scope: 'staff_safety_v1',
          order: 'oldest_first',
          queue: body.args.p_queue,
          closed: body.args.p_closed,
          authorized_queues: ['report', 'appeal', 'external_intake'],
          next_cursor: null,
          items: ['report', 'external_intake'].map((kind, i) => ({
            kind,
            id: `99000000-0000-4000-8000-00000000000${i + 3}`,
            key: `${kind}:99000000-0000-4000-8000-00000000000${i + 3}`,
            subject: kind === 'report' ? 'Synthetic content report' : 'Synthetic removal request',
            at: '2026-10-05T00:00:00Z',
            work_state: body.args.p_closed ? 'closed' : 'ready',
            status: body.args.p_closed ? 'resolved' : 'pending',
            origin: i ? 'external' : 'in_app',
            due_at: null,
            ownership_model: i ? 'existing_intake' : 'existing_report',
            assigned_to: null,
          })),
        };
      if (body.name === 'get_admin_staff_work_page_v1')
        json = {
          scope: 'staff_inbox_v1',
          order: 'oldest_first',
          authorized_queues: ['business_application'],
          next_cursor: null,
          items: [
            {
              kind: 'business_application',
              id: businessId,
              key: `business_application:${businessId}`,
              subject: 'Synthetic business request',
              at: '2026-10-05T00:00:00Z',
              work_state: 'ready',
              due_at: null,
              ownership_model: 'staff_workflow',
              assigned_to: null,
              revision: 0,
            },
          ],
        };
      if (body.name === 'get_admin_case_ownership_v1')
        json = {
          kind: 'business_application',
          id: businessId,
          source_version: '1',
          revision: 0,
          owner_label: 'Unassigned',
          assigned_to: null,
          actionable: true,
          can_claim: true,
          can_assign: true,
          can_release: false,
          can_decide: true,
        };
      if (body.name === 'get_admin_business_applications_page_v1')
        json = {
          items: [{ id: businessId, brand_name: 'Synthetic business request', state: 'pending' }],
          next_cursor: null,
        };
      if (body.name === 'get_admin_business_application_v1')
        json = {
          id: businessId,
          state: 'pending',
          revision: 1,
          details: {
            legal_name: 'Synthetic Business',
            brand_name: 'Synthetic business request',
            website: 'https://example.test',
            country: 'US',
            representative_name: 'Synthetic Owner',
            representative_role: 'Owner',
            category: 'Technology',
            purpose: 'A synthetic review journey',
          },
          latest_submission: { submission: 1 },
          history: [],
        };
      return route.fulfill({ json });
    }
    if (url.pathname === '/auth/logout') return route.fulfill({ json: { signedIn: false } });
    // Fail rather than silently serving candidate modules from the root portal.
    if (preview && !url.pathname.startsWith(prefix + '/'))
      return route.fulfill({ status: 404, body: '' });
    const assetPath = url.pathname.slice(prefix.length);
    const file = resolve(root, '.' + (assetPath === '/' ? '/index.html' : assetPath));
    if (!file.startsWith(root)) return route.abort();
    try {
      let body = await readFile(file);
      if (healthEvents && /admin-app-.*\.js$/.test(url.pathname))
        body = Buffer.from(
          body.toString().replace('"healthEventsEnabled": false', '"healthEventsEnabled": true'),
        );
      if (unifiedSafety && /admin-app-.*\.js$/.test(url.pathname))
        body = Buffer.from(
          body
            .toString()
            .replace('"unifiedSafetyEnabled": false', '"unifiedSafetyEnabled": true')
            .replace('"safetyRemovalEnabled": false', '"safetyRemovalEnabled": true'),
        );
      if (!enabled && /admin-app-.*\.js$/.test(url.pathname))
        body = Buffer.from(
          body.toString().replace('"staffWorkflowEnabled": true', '"staffWorkflowEnabled": false'),
        );
      return route.fulfill({
        body,
        contentType:
          (
            { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html' } as Record<
              string,
              string
            >
          )[extname(file)] || 'application/octet-stream',
      });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
  await page.goto('https://admin.dojipro.com' + prefix + '/');
  await expect(page.locator('#portalApp')).toBeVisible();
  if (enabled) await page.locator('.portalNav [data-view="inbox"]').click();
  return calls;
}

test('health channel refreshes only visible operations, deduplicates hints and stops on lock', async ({
  page,
}) => {
  const calls = await install(page, true, false, false, false, true);
  await expect.poll(() => page.evaluate(() => typeof window.healthLiveHint)).toBe('function');
  await page.locator('.portalNav [data-view="operations"]').click();
  await expect(page.locator('[data-portal-view="operations"]')).not.toHaveAttribute(
    'aria-busy',
    'true',
  );
  await expect(page.locator('.opsUpdateScope')).toContainText('automatically');
  await page.waitForLoadState('networkidle');
  const count = () => calls.filter((c) => c.name === 'portal_platform_health_v1').length;
  const dashboards = calls.filter((c) => c.name.includes('command_center')).length;
  const before = count();
  await page.evaluate(() => {
    window.healthLiveHint?.('2');
    window.healthLiveHint?.('2');
    window.healthLiveHint?.('1');
  });
  await expect.poll(count).toBe(before + 1);
  await page.waitForTimeout(700);
  expect(count()).toBe(before + 1);
  expect(calls.filter((c) => c.name.includes('command_center'))).toHaveLength(dashboards);
  await page.locator('.portalNav [data-view="businesses"]').click();
  await page.evaluate(() => window.healthLiveHint?.('3'));
  await page.waitForTimeout(700);
  expect(count()).toBe(before + 1);
  await page.getByRole('button', { name: 'Lock session', exact: true }).click();
  await page.evaluate(() => window.healthLiveHint?.('4'));
  await page.waitForTimeout(700);
  expect(count()).toBe(before + 1);
});

test('health event during navigation read queues one fresh follow-up', async ({ page }) => {
  const calls = await install(page, true, false, false, false, true);
  await expect.poll(() => page.evaluate(() => typeof window.healthLiveHint)).toBe('function');
  await page.waitForLoadState('networkidle');
  let requests = 0;
  let release: () => void = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/rpc', async (route) => {
    const body = route.request().postDataJSON() as { name: string };
    if (body.name !== 'portal_platform_health_v1') return route.fallback();
    requests++;
    if (requests === 1) await blocked;
    return route.fulfill({
      json: {
        generated_at: new Date().toISOString(),
        operational: { available: false },
        sentry: { available: false },
      },
    });
  });
  await page.locator('.portalNav [data-view="operations"]').click();
  await expect.poll(() => requests).toBe(1);
  await page.evaluate(() => window.healthLiveHint?.('1'));
  await page.waitForTimeout(600);
  expect(requests).toBe(1);
  release();
  await expect.poll(() => requests).toBe(2);
  await page.waitForTimeout(800);
  expect(requests).toBe(2);
  expect(
    calls.filter((c) => /assign|decide|resolve|set_|update_|submit|delete/.test(c.name)),
  ).toHaveLength(0);
});

test('health event gate never subscribes a non-operations reviewer', async ({ page }) => {
  await install(page, true, false, true, false, true);
  await expect
    .poll(() => page.evaluate(() => window.workflowSubscribed))
    .toEqual(['staff:workflow:business']);
});

test('independent employee portal loads bounded health and history without member writes', async ({
  page,
}) => {
  const calls = await install(page);
  await page.locator('.portalNav [data-view="operations"]').click();
  await expect(page.locator('.opsReadiness')).toBeVisible();
  await expect(page.locator('[data-portal-view="operations"]')).not.toHaveAttribute(
    'aria-busy',
    'true',
  );
  expect(calls.some((c) => c.name === 'portal_platform_health_v1')).toBe(true);
  const history = calls.filter((c) => c.name === 'get_admin_event_health_history_v1');
  expect(history.length).toBeGreaterThan(0);
  expect(history.every((c) => c.args.p_limit === 12)).toBe(true);
  await expect(page.locator('.opsUpdateScope')).toContainText('do not yet publish');
  await expect(page.getByRole('button', { name: 'Refresh health', exact: true })).toHaveCount(0);
  expect(
    calls.filter((c) => /assign|decide|resolve|set_|update_|submit|delete/.test(c.name)),
  ).toHaveLength(0);
});

test('built unified safety uses one merged read and hides both legacy queues', async ({
  page,
}, info) => {
  const calls = await install(page, true, false, false, true);
  for (const [view, queue] of [
    ['moderation', 'moderation'],
    ['safety', 'restricted_safety'],
  ]) {
    calls.length = 0;
    await page.locator(`.portalNav [data-view="${view}"]`).click();
    const section = page.locator(`[data-portal-view="${view}"]`);
    await expect(section.locator('.staffWorkflow tbody tr')).toHaveCount(2);
    await expect(section.locator('.queuePanel')).toBeHidden();
    await expect(section.locator('.safetyQueue')).toBeHidden();
    await expect(section.locator('.queueSummaryStrip')).toBeHidden();
    await expect(section.getByText('Work state', { exact: true })).toBeHidden();
    expect(
      calls.some((c) => c.name === 'get_admin_safety_work_page_v1' && c.args.p_queue === queue),
    ).toBe(true);
    expect(
      calls.some(
        (c) =>
          c.name === 'get_admin_safety_removals_v1' || c.name === 'get_admin_work_queue_page_v1',
      ),
    ).toBe(false);
    await page.screenshot({ path: info.outputPath(`${view}-unified.png`) });
  }
  await page
    .locator('.staffWorkflow')
    .getByRole('button', { name: 'Show closed', exact: true })
    .click();
  await expect(
    page.locator('.staffWorkflow').getByText('Closed · resolved', { exact: true }),
  ).toHaveCount(2);
});

test('limited business reviewer subscribes only to authorized workflow topics', async ({
  page,
}) => {
  await install(page, true, false, true);
  await expect
    .poll(() => page.evaluate(() => window.workflowSubscribed))
    .toEqual(['staff:workflow:business']);
  await expect(page.getByRole('region', { name: 'My work' })).toBeVisible();
});

test('Command center has shortcuts, no duplicate inbox and no hidden queue reads', async ({
  page,
}, info) => {
  const calls = await install(page);
  const first = calls.find((c) => c.name === 'get_admin_staff_work_page_v1');
  expect(first?.args.p_filter).toBe('mine');
  await page.locator('.portalNav [data-view="overview"]').click();
  await expect(page.locator('.staffOverview')).toBeVisible();
  await expect(page.locator('.staffWorkflow')).toBeHidden();
  const before = calls.filter((c) => c.name === 'get_admin_staff_work_page_v1').length;
  await page.evaluate(() => window.workflowLiveHint?.());
  await page.waitForTimeout(200);
  expect(calls.filter((c) => c.name === 'get_admin_staff_work_page_v1')).toHaveLength(before);
  await page.screenshot({ path: info.outputPath('command-center.png'), fullPage: true });
  await page
    .locator('.staffOverview')
    .getByRole('button', { name: 'My work', exact: true })
    .click();
  await expect(page.locator('.staffWorkflow')).toBeVisible();
});

test('prefixed preview loads its own workspace, realtime subscriber and business review modules', async ({
  page,
}) => {
  const calls = await install(page, true, true);
  await expect(page.getByRole('region', { name: 'My work' })).toBeVisible();
  await expect(page.locator('#urgentMetric').locator('..')).toBeHidden();
  await expect(page.locator('#overviewPlatformPulse')).toHaveAttribute('data-tone', 'attention');
  await expect(page.locator('#overviewPlatformPulse span')).toHaveCSS(
    'background-color',
    'rgb(255, 207, 138)',
  );
  await expect(page.locator('#campaignMetric').locator('..')).toBeHidden();
  await expect(page.locator('#inboxNavCount')).toBeHidden();
  await expect.poll(() => page.evaluate(() => typeof window.workflowLiveHint)).toBe('function');
  const before = calls.filter((c) => c.name === 'get_admin_staff_work_page_v1').length;
  await page.evaluate(() => window.workflowLiveHint?.());
  await expect
    .poll(() => calls.filter((c) => c.name === 'get_admin_staff_work_page_v1').length)
    .toBe(before + 1);
  await page.getByRole('button', { name: 'Manage ownership' }).click();
  await page.getByRole('button', { name: 'Open review', exact: true }).click();
  await expect(page.locator('dialog[open]')).toContainText('Synthetic business request');
});
test('built admin restores employee session, shows business request, opens existing review without writes', async ({
  page,
}, info) => {
  const calls = await install(page);
  await expect(page.getByRole('region', { name: 'My work' })).toBeVisible();
  await expect(
    page.getByRole('cell', { name: 'Synthetic business request', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('built-workflow.png'), fullPage: true });
  await page.getByRole('button', { name: 'Manage ownership' }).click();
  await page.getByRole('button', { name: 'Open review', exact: true }).click();
  await expect(page.locator('dialog[open]')).toContainText('Synthetic business request');
  expect(
    calls.some((c) => c.name === 'get_admin_business_application_v1' && c.args.p_id === businessId),
  ).toBe(true);
  expect(calls.filter((c) => c.name.includes('command'))).toEqual(
    calls.filter((c) => c.name.includes('command_center')),
  );
});
test('built admin flag off creates no workflow surface or new requests', async ({ page }) => {
  const calls = await install(page, false);
  await expect(page.locator('#portalPageTitle')).toContainText('Command center');
  await expect(page.locator('.staffWorkflow')).toHaveCount(0);
  expect(
    calls.some((c) => /staff_work|owned_work|case_ownership|case_assignees/.test(c.name)),
  ).toBe(false);
});
test('built workspace follows inbox navigation and clears business details on employee lock', async ({
  page,
}) => {
  await install(page);
  await page.locator('.portalNav [data-view="inbox"]').click();
  await expect(page.locator('[data-portal-view="inbox"] .staffWorkflow')).toBeVisible();
  await expect(page.locator('[data-portal-view="inbox"] > .queuePanel')).toBeHidden();
  await expect(page.locator('[data-portal-view="inbox"] [data-action="claim-next"]')).toBeHidden();
  await page.getByRole('button', { name: 'Lock session', exact: true }).click();
  await expect(page.locator('.staffWorkflow tbody')).toBeEmpty();
  await expect(page.locator('.staffWorkflowDialog')).not.toBeVisible();
});
test('built realtime subscriber routes staff hint to bounded workspace read, not global dashboard reload', async ({
  page,
}) => {
  const calls = await install(page);
  await expect(
    page.getByRole('cell', { name: 'Synthetic business request', exact: true }),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => typeof window.workflowLiveHint)).toBe('function');
  const inboxBefore = calls.filter((c) => c.name === 'get_admin_staff_work_page_v1').length;
  const dashboardBefore = calls.filter((c) => c.name.includes('command_center')).length;
  await page.evaluate(() => window.workflowLiveHint?.());
  await expect
    .poll(() => calls.filter((c) => c.name === 'get_admin_staff_work_page_v1').length)
    .toBe(inboxBefore + 1);
  expect(calls.filter((c) => c.name.includes('command_center'))).toHaveLength(dashboardBefore);
});

test('built section navigation keeps combined work on main pages only', async ({ page }, info) => {
  const calls = await install(page);
  await expect(page.locator('.staffWorkflow tbody tr')).toHaveCount(1);
  await page.waitForLoadState('networkidle');
  const before = calls.filter((c) => c.name === 'get_admin_staff_work_page_v1').length;
  for (const area of ['businesses', 'suggestions', 'moderation', 'safety']) {
    await page.locator(`.portalNav [data-view="${area}"]`).click();
    await expect(page.locator(`[data-portal-view="${area}"]`)).toBeVisible();
    const queue = area === 'moderation' ? 'moderation' : area === 'safety' ? 'restricted_safety' : null;
    if (process.env.DOJI_WORKFLOW_RELEASE_DIR && queue) {
      // Production enables unified safety: its area-specific table is expected,
      // but it must never render the personal/combined inbox here.
      await expect(page.locator(`[data-portal-view="${area}"] .staffWorkflow`)).toBeVisible();
      await expect(page.locator(`[data-portal-view="${area}"] .staffWorkflow tbody tr`)).toHaveCount(2);
      expect(calls.some(c => c.name === 'get_admin_safety_work_page_v1' && c.args.p_queue === queue)).toBe(true);
      await expect(page.getByRole('region', {name:'My work',exact:true})).toBeHidden();
    } else {
      await expect(page.locator('.staffWorkflow')).toBeHidden();
      await expect(page.locator(`[data-portal-view="${area}"] .staffWorkflow`)).toHaveCount(0);
    }
    expect(calls.filter((c) => c.name === 'get_admin_staff_work_page_v1')).toHaveLength(before);
    if (area === 'businesses')
      await page.screenshot({ path: info.outputPath('business-section.png'), fullPage: true });
  }
  await page.locator('.portalNav [data-view="overview"]').click();
  await expect(page.locator('.staffWorkflow')).toBeHidden();
  await expect(page.locator('.staffOverview')).toBeVisible();
  await page.locator('.portalNav [data-view="inbox"]').click();
  await expect(page.locator('.staffWorkflow tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Manage ownership' }).click();
  await expect(page.getByRole('button', { name: 'Assign to me', exact: true })).toBeVisible();
});

test('release queue shells have matching height, fixed paging and themed loading', async ({
  page,
}, info) => {
  test.skip(
    !process.env.DOJI_WORKFLOW_RELEASE_DIR,
    'Requires the exact production-flag artifact with safety enabled.',
  );
  await install(page, true, false, false, true);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  const heights: number[] = [];
  for (const [area, panel] of [
    ['businesses', '.businessQueuePanel'],
    ['campaigns', '.queuePanel'],
    ['safety', '.staffWorkflow'],
  ] as const) {
    await page.locator(`.portalNav [data-view="${area}"]`).click();
    const queue = page.locator(`[data-portal-view="${area}"] ${panel}`).first();
    await expect(queue).toBeVisible();
    await expect(queue.locator('.tableWrap')).not.toHaveAttribute('aria-busy', 'true');
    const height = await queue.evaluate((el) => el.getBoundingClientRect().height);
    heights.push(height);
    const footerInset = await queue.evaluate(
      (el) =>
        el.getBoundingClientRect().bottom -
        el.querySelector('.tableFooter')!.getBoundingClientRect().bottom,
    );
    expect(Math.abs(footerInset)).toBeLessThan(3);
    await expect(queue.getByRole('button', { name: 'Previous', exact: true })).toBeVisible();
    await expect(queue.getByRole('button', { name: 'Next', exact: true })).toBeVisible();
    await queue.screenshot({ path: info.outputPath(`${area}-queue.png`) });
  }
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(2);
});
