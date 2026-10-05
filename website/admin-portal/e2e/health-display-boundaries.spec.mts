import type { Page } from "@playwright/test";
import type {MockOptions} from './fixtures.mts';
import type {MockRequest} from '../../test-contracts.mts';
import { test, expect } from '../../coverage-fixture.mts';
import { seedAdminSession, installMockBackend, commandCenter } from './fixtures.mts';

const healthy = () => ({
  available: true,
  healthy: true,
  checked_at: new Date().toISOString(),
  realtime_p95_ms_5m: 100,
  realtime_max_ms_5m: 120,
  realtime_sample_count_5m: 30,
  realtime_over_5s_5m: 0,
  outbox_overdue: 0,
  outbox_exhausted: 0,
  push_stale_shards: 0,
  push_exhausted_shards: 0,
  apns_provider_credential_errors: 0,
});
async function open(page: Page, options:MockOptions = {}, routes?:()=>Promise<void>) {
  await seedAdminSession(page, true);
  const requests = await installMockBackend(page, { employeeMode: true, ...options });
  if (routes) await routes();
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  return requests;
}
const operations = (page: Page) => page.locator('.portalNav [data-view="operations"]').click();
function readonly(requests:MockRequest[]) {
  expect(
    requests.filter((r) => r.method === 'POST' && !r.path.endsWith('/realtime-token')),
  ).toEqual([]);
}

for (const stage of ['absent', 'prepared', 'prelive', 'active', 'completed'] as const) {
  test(`event ${stage} is described from authoritative timestamps without activating anything`, async ({
    page,
  }) => {
    const now = Date.now();
    const event =
      stage === 'absent'
        ? null
        : {
            fires_at: new Date(now - 60000).toISOString(),
            title: stage === 'prepared' ? '' : '<b>Synthetic event</b>',
            ...(stage !== 'prepared' ? { prelive_at: new Date(now - 1200000).toISOString() } : {}),
            ...(['active', 'completed'].includes(stage)
              ? {
                  activated_at: new Date(now - 60000).toISOString(),
                  closes_at: new Date(now + (stage === 'completed' ? -1000 : 540000)).toISOString(),
                }
              : {}),
          };
    const requests = await open(page, { commandCenter: { ...commandCenter, next_event: event } });
    await operations(page);
    const context = page.locator('.eventHealthContext');
    await expect(context).toContainText(
      {
        absent: 'No Daily Doji occurrence',
        prepared: 'Prepared',
        prelive: 'Pre-live',
        active: 'Live window',
        completed: 'Completed',
      }[stage],
    );
    if (stage === 'prepared') await expect(context).toContainText('Not activated');
    if (event?.title) {
      await expect(context).toContainText('<b>Synthetic event</b>');
      await expect(context.locator('b')).toHaveCount(0);
    }
    readonly(requests);
  });
}

for (const policies of [
  null,
  {},
  [],
  [
    { platform: 'android', enabled: false },
    {
      platform: 'ios',
      enabled: true,
      minimum_version: '1.0.8',
      latest_version: '1.0.8',
      minimum_build: 101,
      latest_build: 101,
    },
  ],
]) {
  test(`release display is read-only for ${JSON.stringify(policies)}`, async ({ page }) => {
    const requests = await open(page, {
      commandCenter: { ...commandCenter, release_policies: policies },
    });
    await operations(page);
    const rows = page.locator('.releaseRows');
    if (!Array.isArray(policies) || !policies.length)
      await expect(rows).toContainText('No release policy rows');
    else {
      await expect(rows).toContainText('ANDROID');
      await expect(rows).toContainText('Disabled');
      await expect(rows).toContainText('Minimum 1.0.8 (101)');
      await expect(rows).toContainText('Enforced');
    }
    readonly(requests);
  });
}

for (const kind of ['missing', 'unavailable', 'empty', 'malformed', 'linked', 'capped']) {
  test(`Sentry ${kind} results retain their measurement limits and safe rendering`, async ({
    page,
  }) => {
    const issue = {
      title: '<img src=x> failure',
      short_id: 'SYN-1',
      project: 'synthetic',
      culprit: 'request',
      first_seen: '2026-09-29T01:00:00Z',
      last_seen: new Date().toISOString(),
      event_count: 3,
      affected_users: 2,
      permalink: 'https://example.test/issue/SYN-1',
      level: 'warning',
    };
    const sentry =
      kind === 'missing'
        ? undefined
        : {
            configured: true,
            available: kind !== 'unavailable',
            issues:
              kind === 'malformed'
                ? {}
                : kind === 'linked'
                  ? [issue, {}]
                  : kind === 'capped'
                    ? Array.from({ length: 25 }, () => issue)
                    : [],
          };
    await open(page, { platformHealth: { operational: healthy(), sentry } });
    await operations(page);
    const panel = page.locator('.sentryPanel');
    await expect(panel).toContainText('Counts are Sentry group totals, not per-Doji totals.');
    if (['missing', 'unavailable'].includes(kind))
      await expect(panel).toContainText('No all-clear can be inferred');
    else if (['empty', 'malformed'].includes(kind))
      await expect(panel).toContainText('cannot verify account loading or comment success');
    else {
      await expect(panel.locator('a.sentryIssueRow').first()).toHaveAttribute(
        'href',
        issue.permalink,
      );
      await expect(panel.locator('a.sentryIssueRow').first()).toHaveAttribute(
        'rel',
        'noopener noreferrer',
      );
      await expect(panel.locator('img')).toHaveCount(0);
      await expect(panel).toContainText(issue.title);
      if (kind === 'capped')
        await expect(panel.locator('.healthState')).toHaveText('25+ unresolved');
      else await expect(panel.locator('div.sentryIssueRow')).toContainText('Production issue');
    }
  });
}

for (const shape of ['settling', 'finalized', 'missing-metrics', 'unavailable-sentry']) {
  test(`event history ${shape} keeps issue-lifetime overlap distinct from event counts`, async ({
    page,
  }) => {
    const row = {
      fires_at: '2026-09-29T01:00:00Z',
      activated_at: '2026-09-29T01:00:01Z',
      closes_at: '2026-09-29T01:10:01Z',
      ...(shape === 'settling' ? {} : { finalized_at: '2026-09-29T01:15:00Z' }),
      ...(shape === 'missing-metrics'
        ? {}
        : {
            realtime_p95_ms: 100,
            realtime_max_ms: 150,
            realtime_sample_count: 30,
            realtime_over_5s: 0,
            outbox_unpublished: 0,
            outbox_exhausted: 0,
            push_shards_completed: 2,
            push_shards_total: 2,
            push_shards_expired: 0,
            push_shards_exhausted: 0,
            participant_count: 2,
            post_count: 1,
          }),
    };
    await open(page, {
      healthHistory: [row],
      platformHealth: {
        operational: healthy(),
        sentry: {
          configured: true,
          available: shape !== 'unavailable-sentry',
          issues: [
            {
              title: 'Overlap',
              first_seen: '2026-09-29T00:59:00Z',
              last_seen: '2026-09-29T01:01:00Z',
            },
            { title: 'After', first_seen: '2026-09-29T01:11:00Z' },
            { title: 'Before', last_seen: '2026-09-29T00:58:00Z' },
            { title: 'Invalid', first_seen: 'invalid', last_seen: 'invalid' },
          ],
        },
      },
    });
    await operations(page);
    const history = page.locator('.eventHealthRow');
    await expect(history).toContainText(shape === 'settling' ? 'Settling' : 'Finalized');
    await expect(history).toContainText(shape === 'unavailable-sentry' ? 'Unknown' : '1 groups');
    await expect(history).toContainText('Not confirmed events in this window');
    if (shape === 'missing-metrics') await expect(history).toContainText('— samples');
    else await expect(history).toContainText('2 people · 1 posts');
  });
}

for (const count of [null, -1, 1.5, '2', 0, 2]) {
  test(`queue overview never presents ${JSON.stringify(count)} as a valid total unless nonnegative integer`, async ({
    page,
  }) => {
    await open(page, {
      commandCenter: {
        ...commandCenter,
        queue_health: [
          { key: 'moderation', label: 'Trust & safety', count },
          { key: 'suggestions', label: 'Community ideas', count },
          { label: 'Unknown queue', note: 'Synthetic queue note', count },
        ],
      },
    });
    const valid = typeof count === 'number' && Number.isInteger(count) && count >= 0;
    const queue = page.locator('[data-queue-health="moderation"]');
    await expect(queue.locator('strong[aria-label]')).toHaveText(valid ? String(count) : '—');
    await expect(queue.locator('strong[aria-label]')).toHaveAttribute(
      'aria-label',
      `${valid ? count : 'Unknown'} open items`,
    );
    await expect(page.locator('[data-queue-health="suggestions"]')).toContainText(
      count === 0 ? 'No open ideas' : 'Editorial review · No timed target',
    );
    await expect(page.locator('[data-queue-health="other"]')).toContainText('Synthetic queue note');
  });
}

test('history read failure is visible without treating missing history as no incidents', async ({
  page,
}) => {
  await open(page, {}, async () => {
    await page.route('**/portal/admin/platform-health-history?*', (route) =>
      route.fulfill({ status: 503, json: { error: 'Synthetic history unavailable' } }),
    );
  });
  await operations(page);
  await expect(page.locator('.eventHistoryPanel')).toContainText(
    'Recent Doji health could not be refreshed',
  );
  await expect(page.locator('.eventHistoryPanel')).not.toContainText(
    'No completed Doji health summaries',
  );
});

test('operational read failure does not render stale realtime p95 as current', async ({ page }) => {
  await open(page, { failPlatform: true });
  await operations(page);
  await expect(page.locator('.opsHeroMetric strong')).toHaveText('—');
  await expect(page.locator('.opsHeroMetric')).toContainText('stale / unavailable');
  await expect(page.locator('.opsGrid')).toContainText(
    'No unavailable signal is being treated as healthy',
  );
});
