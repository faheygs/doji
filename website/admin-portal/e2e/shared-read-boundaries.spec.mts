import type { Page } from "@playwright/test";
import { test, expect } from '../../coverage-fixture.mts';
import {
  seedAdminSession,
  installMockBackend,
  operatorSession,
  reportCase,
  reportId,
  commandCenter,
} from './fixtures.mts';

async function start(page: Page, options = {}, configure = async () => {}) {
  await seedAdminSession(page, true);
  const requests = await installMockBackend(page, { employeeMode: true, ...options });
  await configure();
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  return requests;
}
async function openReport(page: Page) {
  await page.locator('.portalNav [data-view="moderation"]').click();
  await page.locator(`[data-queue-body="moderation"] [data-work-id="${reportId}"]`).click();
  await expect(page.locator('#drawerContent')).toContainText('Case context');
}
async function settledUI(page: Page) {
  await page.evaluate(
    () => new Promise((resolve) => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }),
  );
}

test('missing summary metadata keeps queue reads authoritative and announcement summaries read-only', async ({
  page,
}) => {
  const requests = await start(page, {
    commandCenter: {
      ...commandCenter,
      metrics: null,
      work_items: null,
      announcements: [
        {
          id: 'one',
          title: 'Synthetic enabled',
          max_impressions_per_user: 1,
          starts_at: '2026-10-01',
          ends_at: null,
          enabled: true,
        },
        {
          id: 'two',
          title: 'Synthetic disabled',
          max_impressions_per_user: 2,
          starts_at: '2026-10-01',
          ends_at: '2026-10-03',
          enabled: false,
        },
      ],
    },
    workQueue: () => ({ items: [], next_cursor: null }),
  });
  await expect(page.locator('#urgentMetric')).toHaveText('0');
  await expect(page.locator('#campaignMetric')).toHaveText('0');
  await page.locator('.portalNav [data-view="announcements"]').click();
  await expect(page.locator('#announcementList')).toContainText('1 impression maximum');
  await expect(page.locator('#announcementList')).toContainText('2 impressions maximum');
  await expect(page.locator('#announcementList')).toContainText('No end date');
  expect(
    requests.filter((r) => r.method === 'POST' && !r.path.endsWith('/realtime-token')),
  ).toEqual([]);
});

test('missing summary queue totals count only unresolved restricted work', async ({ page }) => {
  await start(page, {
    commandCenter: {
      ...commandCenter,
      metrics: {},
      work_items: [
        { ...commandCenter.work_items[1], status: 'open' },
        { ...commandCenter.work_items[1], id: 'closed', status: 'resolved' },
        { ...commandCenter.work_items[0] },
      ],
    },
  });
  await expect(page.locator('#campaignMetric')).toHaveText('1');
});

for (const [minutes, label] of [
  [-5, 'Overdue by 5m'],
  [30, '30m to target'],
  [2880, '2d to target'],
] as const) {
  test(`queue deadline ${minutes} minutes retains the actual review target`, async ({ page }) => {
    await start(page, {
      commandCenter: {
        ...commandCenter,
        work_items: [
          {
            ...commandCenter.work_items[0],
            secondary: 'Post report',
            history: null,
            options: ['One', 'Two'],
            submitted_at: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
            deadline_at: new Date(Date.now() + minutes * 60_000).toISOString(),
          },
        ],
      },
    });
    await page.locator('.portalNav [data-view="moderation"]').click();
    const row = page.locator('[data-queue-body="moderation"]');
    await expect(row).toContainText(label);
    await expect(row).toContainText('3h ago');
  });
}

for (const mode of ['failed', 'malformed']) {
  test(`audit search ${mode} response is not presented as fresh activity`, async ({ page }) => {
    await start(page);
    await page.route('**/portal/admin/audit?*', (route) =>
      route.fulfill(
        mode === 'failed'
          ? { status: 503, json: { error: 'Synthetic audit unavailable' } }
          : { json: { items: null } },
      ),
    );
    await page.locator('.portalNav [data-view="audit"]').click();
    await page.locator('#auditSearch').fill('first');
    await page.locator('#auditSearch').fill('latest');
    if (mode === 'failed')
      await expect(page.locator('#toast')).toContainText('Synthetic audit unavailable');
    else await expect(page.locator('#auditList')).toContainText('No audit events');
  });
}

for (const stage of ['session', 'command-center', 'audit', 'work-queue']) {
  test(`lock discards a late ${stage} refresh and never restores protected data`, async ({
    page,
  }) => {
    await start(page);
    let release!: () => void,
      started = false;
    // Secondary reads now belong to the visible screen, not every refresh.
    if (stage === 'audit') await page.locator('.portalNav [data-view="audit"]').click();
    if (stage === 'work-queue') await page.locator('.portalNav [data-view="inbox"]').click();
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/portal/admin/${stage}*`, async (route) => {
      started = true;
      await gate;
      await route.fallback().catch(() => {});
    });
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(() => started).toBe(true);
    await page.getByRole('button', { name: 'Lock session', exact: true }).click();
    release();
    await settledUI(page);
    await expect(page.locator('#portalApp')).toBeHidden();
    await expect(page.locator('#drawerContent')).toBeEmpty();
    await expect(page.locator('#globalSearchResults')).toBeEmpty();
  });
}

test('foreground bursts coalesce while an authorized refresh is pending', async ({ page }) => {
  await start(page);
  let release!: () => void,
    started = false,
    reads = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/portal/admin/command-center*', async (route) => {
    reads++;
    if (reads === 1) {
      started = true;
      await gate;
    }
    await route.fulfill({ json: commandCenter });
  });
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => started).toBe(true);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  // The second scheduled request must encounter the existing in-flight refresh.
  await page.waitForTimeout(700);
  expect(reads).toBe(1);
  release();
  await expect.poll(() => reads).toBe(2);
  await expect(page.locator('#portalApp')).toBeVisible();
  await expect(page.locator('#urgentMetric')).toHaveText('1');
});

test('partial historical report has no invented media or account context', async ({ page }) => {
  await start(page, {
    reportCase: {
      ...reportCase,
      evidence: null,
      case_context: null,
      priority: null,
      owner: {},
      status: null,
      triage_state: null,
      history: [{ action: null }],
      workflow_history: null,
    },
    commandCenter: {
      ...commandCenter,
      work_items: [{ ...commandCenter.work_items[0], owner: null, priority: null }],
    },
  });
  await openReport(page);
  await expect(page.locator('.moderationEvidence')).toHaveCount(0);
  await expect(page.locator('#drawerContent')).toContainText('Not available');
  await page.locator('[data-drawer-tab="history"]').click();
  await expect(page.locator('.triageStateCard')).toContainText('Normal');
  await expect(page.locator('.drawerTimeline')).toContainText('Report Activity');
});

test('archive metadata gaps and unnamed audit actors remain explicitly unknown', async ({
  page,
}) => {
  await start(page, {}, async () => {
    await page.route('**/portal/admin/resolved-reports?*', (route) =>
      route.fulfill({ json: { items: null } }),
    );
    await page.route('**/portal/admin/audit?*', (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: 'synthetic-audit',
              actor: {},
              action: 'report.received',
              entity_type: 'configuration',
              entity_id: 'synthetic',
              metadata: null,
            },
          ],
        },
      }),
    );
  });
  await page.locator('.portalNav [data-view="audit"]').click();
  await page.locator('[data-audit-id="synthetic-audit"]').click();
  await expect(page.locator('#auditDetailBody')).toContainText('Authorized operator');
  await expect(page.locator('#auditDetailBody')).toContainText('No rationale was recorded');
  await expect(page.locator('#auditDetailActions')).toBeEmpty();
});

for (const manifest of [
  { access_gaps: true, items: [] },
  {
    items: [
      {
        slot: 'historical',
        kind: 'image',
        availability: 'object_missing',
        desired: 'restored',
        phase: 'pending',
      },
    ],
  },
  {
    items: [
      { slot: 'photo', kind: 'image', availability: 'object_missing', phase: 'legacy_unknown' },
    ],
  },
]) {
  test(`preserved evidence explains incomplete verification ${JSON.stringify(manifest)}`, async ({
    page,
  }) => {
    await start(page, {
      reportCase: {
        ...reportCase,
        preserved_media_manifest: {
          source: 'preserved_decision_media',
          decision_id: null,
          ...manifest,
        },
      },
    });
    await openReport(page);
    await expect(page.locator('.evidenceProvenance')).toContainText(
      'not a complete historical content snapshot',
    );
    await expect(page.locator('.evidenceProvenance')).toContainText(
      manifest.access_gaps
        ? 'Keep the removal request open'
        : manifest.items[0] && 'desired' in manifest.items[0] && manifest.items[0].desired
          ? 'Restoration checks pending'
          : 'Verification status unavailable',
    );
    await expect(page.locator('.evidenceProvenance img')).toHaveCount(0);
  });
}

for (const [name, patch, display, role] of [
  [
    'username fallback',
    { display_name: null, username: 'synthetic-reviewer' },
    'synthetic-reviewer',
    'super admin',
  ],
  [
    'missing display identity',
    { display_name: null, username: null, roles: [] },
    'Doji operator',
    'Authorized operator',
  ],
  ['non-array roles', { roles: null }, 'Gavin Fahey', 'Authorized operator'],
] as const) {
  test(`authorized session renders ${name} without inventing a role`, async ({ page }) => {
    await start(page, { session: { ...operatorSession, ...patch } });
    await expect(page.locator('#operatorName')).toHaveText(display);
    await expect(page.locator('#operatorRole')).toHaveText(role);
  });
}

for (const caps of [{ moderation_read: true }, { business_read: true }, {}]) {
  test(`limited session ${JSON.stringify(caps)} does not request operational or employee-directory data`, async ({
    page,
  }) => {
    const requests = await start(page, {
      session: { ...operatorSession, roles: [], capabilities: caps },
      commandCenter: { ...commandCenter, work_items: [] },
    });
    await expect(page.locator('#operatorRole')).toHaveText('Authorized operator');
    for (const endpoint of [
      'command-center',
      'audit',
      'platform-health',
      'platform-health-history',
      'operators',
    ]) {
      expect(
        requests.filter((r) =>
          new URL(r.path, 'https://fixture.invalid').pathname.endsWith(`/${endpoint}`),
        ),
      ).toHaveLength(0);
    }
    await expect(page.locator('.portalNav [data-view="access"]')).toBeHidden();
    await expect(page.locator('.portalNav [data-view="operations"]')).toBeHidden();
  });
}

for (const [name, patch, category, concern] of [
  [
    'raw legacy codes',
    {
      reason_label: null,
      reason_detail_label: null,
      reason: 'legacy_category',
      reason_detail: 'legacy_concern',
    },
    'legacy category',
    'legacy concern',
  ],
  [
    'missing legacy codes',
    { reason_label: null, reason_detail_label: null, reason: null, reason_detail: null },
    'Not provided',
    'Legacy report',
  ],
] as const) {
  test(`${name} are presented honestly in the case details`, async ({ page }) => {
    await start(page, { reportCase: { ...reportCase, ...patch } });
    await openReport(page);
    const facts = page.locator('.caseFactsGrid');
    await expect(facts).toContainText(category);
    await expect(facts).toContainText(concern);
  });
}

for (const [name, catalog, suggestion] of [
  ['missing catalogue', null, null],
  ['malformed catalogue', {}, 'restricted_goods'],
  ['missing suggestion', reportCase.policy_catalog, null],
  ['unknown suggestion', reportCase.policy_catalog, 'not_in_catalogue'],
] as const) {
  test(`${name} never preselects an unsupported policy`, async ({ page }) => {
    const requests = await start(page, {
      reportCase: { ...reportCase, policy_catalog: catalog, suggested_policy_code: suggestion },
    });
    await openReport(page);
    await expect(page.locator('#moderationPolicy')).toHaveValue('');
    await expect(page.locator('#moderationPolicyHint')).toHaveText(
      'Confirm the applicable policy after reviewing the evidence.',
    );
    await page.locator('#decisionReason').fill('Independent review of the synthetic report.');
    await page.locator('[data-admin-decision="remove_content"]').click();
    await expect(page.locator('#decisionError')).toContainText('Choose the policy area');
    expect(requests.filter((r) => r.path.endsWith('/report-decision'))).toHaveLength(0);
  });
}

test('evidence access without timestamps or viewer identity does not manufacture those details', async ({
  page,
}) => {
  await start(page, {
    reportCase: {
      ...reportCase,
      triage_state: null,
      priority: null,
      workflow_history: null,
      history: null,
      evidence_access: { view_count: 1, last_viewer: {} },
    },
  });
  await openReport(page);
  await page.locator('[data-drawer-tab="history"]').click();
  await expect(page.locator('.historyAccessSummary')).toContainText(
    'Opened 1 time by Authorized operator.',
  );
  await expect(page.locator('.historyAccessSummary')).not.toContainText('Last opened');
  await expect(page.locator('#drawerContent')).toContainText('No workflow activity');
  await page.locator('[data-drawer-tab="related"]').click();
  await expect(page.locator('#drawerContent')).toContainText('Test Reporter');
});

test('resolved legacy records without decision metadata remain inspectable', async ({ page }) => {
  const archivedId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const archived = {
    ...commandCenter.work_items[0],
    id: archivedId,
    status: 'resolved',
    resolved_at: '2026-09-29T12:00:00Z',
  };
  await start(
    page,
    { reportCase: { ...reportCase, id: archivedId, status: 'actioned' } },
    async () => {
      await page.route('**/portal/admin/resolved-reports?*', (route) =>
        route.fulfill({ json: { items: [archived], next_cursor: null } }),
      );
    },
  );
  await page.locator('.portalNav [data-view="moderation"]').click();
  await page.locator('[data-queue-filters="moderation"] [data-queue-filter="resolved"]').click();
  await expect(page.locator('[data-queue-body="moderation"] [data-work-id]')).toHaveCount(1);
  await page.locator(`[data-queue-body="moderation"] [data-work-id="${archivedId}"]`).click();
  await expect(page.locator('#drawerContent')).toContainText('Case context');
  await expect(page.locator('#drawerContent')).not.toContainText('undefined');
});

for (const failed of [false, true]) {
  test(`superseded ${failed ? 'failed' : 'successful'} queue search cannot replace the newest result`, async ({
    page,
  }) => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = false;
    await start(page, {}, async () => {
      await page.route('**/portal/admin/work-queue?*', async (route) => {
        const search = new URL(route.request().url()).searchParams.get('search');
        if (search === 'older') {
          started = true;
          await pending;
          return route.fulfill(
            failed
              ? { status: 503, json: { error: 'Obsolete read failed' } }
              : {
                  json: {
                    items: [{ ...commandCenter.work_items[0], subject: 'Obsolete report' }],
                    next_cursor: null,
                  },
                },
          );
        }
        return route.fulfill({
          json: {
            items: [
              {
                ...commandCenter.work_items[0],
                subject: search === 'newer' ? 'Latest report' : 'Initial report',
              },
            ],
            next_cursor: null,
          },
        });
      });
    });
    await page.locator('.portalNav [data-view="moderation"]').click();
    const search = page.locator('[data-queue-search="moderation"]');
    await search.fill('older');
    await expect.poll(() => started).toBe(true);
    await search.fill('newer');
    await expect(page.locator('[data-queue-body="moderation"]')).toContainText('Latest report');
    const response = page.waitForResponse((r) => r.url().includes('search=older'));
    release();
    await response;
    await settledUI(page);
    await expect(page.locator('[data-queue-body="moderation"]')).toContainText('Latest report');
    await expect(page.locator('[data-portal-view="moderation"]')).not.toContainText('Obsolete');
  });
}

test('active queue read failure is explicit and changing a filter performs a fresh bounded read', async ({
  page,
}) => {
  let attempts = 0;
  await start(page, {}, async () => {
    await page.route('**/portal/admin/work-queue?*', (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('queue') !== 'moderation') return route.fallback();
      attempts++;
      return route.fulfill(
        attempts === 1
          ? { status: 503, json: { error: 'Synthetic queue unavailable' } }
          : { json: { items: [commandCenter.work_items[0]], next_cursor: null } },
      );
    });
  });
  await page.locator('.portalNav [data-view="moderation"]').click();
  await expect(page.locator('[data-portal-view="moderation"]')).toContainText(
    'Synthetic queue unavailable',
  );
  await page.locator('[data-queue-filters="moderation"] [data-queue-filter="open"]').click();
  await expect(page.locator('[data-queue-body="moderation"] [data-work-id]')).toHaveCount(1);
  expect(attempts).toBe(2);
});

for (const endpoint of ['audit', 'resolved-reports']) {
  test(`${endpoint} pagination with an empty response cannot invent another record`, async ({
    page,
  }) => {
    let pages = 0;
    await start(page, { commandCenter: { ...commandCenter, work_items: [] } }, async () => {
      await page.route(`**/portal/admin/${endpoint}?*`, (route) => {
        const url = new URL(route.request().url());
        if (url.searchParams.has('beforeId') || url.searchParams.has('beforeReportId')) {
          pages++;
          return route.fulfill({ json: { items: null, next_cursor: null } });
        }
        return route.fulfill({
          json:
            endpoint === 'audit'
              ? {
                  items: [
                    {
                      id: reportId,
                      action: 'report.received',
                      entity_type: 'report',
                      entity_id: reportId,
                      occurred_at: '2026-09-29T12:00:00Z',
                    },
                  ],
                  next_cursor: { id: reportId, occurred_at: '2026-09-29T12:00:00Z' },
                }
              : {
                  items: [
                    {
                      ...commandCenter.work_items[0],
                      status: 'resolved',
                      resolved_at: '2026-09-29T12:00:00Z',
                    },
                  ],
                  next_cursor: { report_id: reportId, resolved_at: '2026-09-29T12:00:00Z' },
                },
        });
      });
    });
    await page
      .locator(`.portalNav [data-view="${endpoint === 'audit' ? 'audit' : 'moderation'}"]`)
      .click();
    if (endpoint !== 'audit')
      await page
        .locator('[data-queue-filters="moderation"] [data-queue-filter="resolved"]')
        .click();
    const pager = page.locator(
      `[data-active-paging="${endpoint === 'audit' ? 'audit' : 'moderation'}"]`,
    );
    await pager.getByRole('button', { name: 'Next', exact: true }).click();
    await expect.poll(() => pages).toBe(1);
    await expect(pager.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    await expect(
      page.locator(
        endpoint === 'audit'
          ? '#auditList [data-audit-id]'
          : '[data-queue-body="moderation"] [data-work-id]',
      ),
    ).toHaveCount(1);
  });
}
