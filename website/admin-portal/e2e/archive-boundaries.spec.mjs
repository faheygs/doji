import { test, expect } from '../../coverage-fixture.mjs';
import { seedAdminSession, installMockBackend, commandCenter, auditPage } from './fixtures.mjs';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const resolved = (n) => ({
  ...commandCenter.work_items[0],
  id: id(n),
  subject: `Closed report ${n}`,
  status: 'resolved',
  label: 'Closed',
  resolved_at: new Date(Date.UTC(2026, 0, 1, 0, -n)).toISOString(),
  decision_id: id(1000 + n),
  decision_action: 'no_violation',
  policy_code: 'other',
  severity: 'level_1',
  account_action: 'none',
  appeal_status: 'not_available',
});
const audit = (n) => ({
  ...auditPage.items[0],
  id: id(n),
  reason: `Synthetic audit ${n}`,
  occurred_at: new Date(Date.UTC(2026, 0, 1, 0, -n)).toISOString(),
});
const cursor = (kind, n) =>
  kind === 'resolved'
    ? { resolved_at: resolved(n).resolved_at, report_id: id(n) }
    : { occurred_at: audit(n).occurred_at, id: id(n) };
const cursorTime = (kind) => (kind === 'resolved' ? 'beforeResolvedAt' : 'beforeOccurredAt');
async function initialize(page, configure) {
  await seedAdminSession(page, true);
  const requests = await installMockBackend(page, { employeeMode: true });
  await configure();
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  return requests;
}
async function resolvedView(page) {
  await page.locator('.portalNav [data-view="moderation"]').click();
  await page.locator('[data-queue-filters="moderation"] [data-queue-filter="resolved"]').click();
}

for (const kind of ['resolved', 'audit'])
  test(`${kind} archive deduplicates IDs across pages, caps rendering and reuses Previous locally`, async ({
    page,
  }) => {
    const record = kind === 'resolved' ? resolved : audit;
    const endpoint = kind === 'resolved' ? 'resolved-reports' : 'audit';
    const reads = [];
    await initialize(page, async () => {
      await page.route(`**/portal/admin/${endpoint}?*`, (route) => {
        const url = new URL(route.request().url());
        reads.push(url);
        const more = url.searchParams.has(cursorTime(kind));
        return route.fulfill({
          json: {
            items: more
              ? [record(25), record(26), record(26), record(27)]
              : Array.from({ length: 25 }, (_, i) => record(i + 1)),
            next_cursor: more ? null : cursor(kind, 25),
          },
        });
      });
    });
    if (kind === 'resolved') await resolvedView(page);
    else await page.locator('.portalNav [data-view="audit"]').click();
    const pager = page.locator(
      `[data-active-paging="${kind === 'resolved' ? 'moderation' : 'audit'}"]`,
    );
    const rows = page.locator(
      kind === 'resolved'
        ? '[data-queue-body="moderation"] [data-work-id]'
        : '#auditList [data-audit-id]',
    );
    await expect(rows).toHaveCount(25);
    await pager.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText(
      kind === 'resolved' ? 'Closed report 26' : 'Synthetic audit 26',
    );
    await expect(pager.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    expect(reads.at(-1).searchParams.get(kind === 'resolved' ? 'beforeReportId' : 'beforeId')).toBe(
      id(25),
    );
    expect(reads.at(-1).searchParams.get('limit')).toBe(kind === 'resolved' ? '25' : '50');
    const count = reads.length;
    await pager.getByRole('button', { name: 'Previous', exact: true }).click();
    await expect(rows).toHaveCount(25);
    expect(reads.length).toBe(count);
  });

for (const kind of ['resolved', 'audit'])
  test(`${kind} archive failed page preserves current rows and retries only on request`, async ({
    page,
  }) => {
    const record = kind === 'resolved' ? resolved : audit;
    const endpoint = kind === 'resolved' ? 'resolved-reports' : 'audit';
    let attempts = 0;
    await initialize(page, async () => {
      await page.route(`**/portal/admin/${endpoint}?*`, (route) => {
        const more = new URL(route.request().url()).searchParams.has(cursorTime(kind));
        if (more && ++attempts === 1)
          return route.fulfill({ status: 503, json: { error: 'Synthetic archive unavailable' } });
        return route.fulfill({
          json: { items: [record(more ? 2 : 1)], next_cursor: more ? null : cursor(kind, 1) },
        });
      });
    });
    if (kind === 'resolved') await resolvedView(page);
    else await page.locator('.portalNav [data-view="audit"]').click();
    const pager = page.locator(
      `[data-active-paging="${kind === 'resolved' ? 'moderation' : 'audit'}"]`,
    );
    const rows = page.locator(
      kind === 'resolved'
        ? '[data-queue-body="moderation"] [data-work-id]'
        : '#auditList [data-audit-id]',
    );
    await expect(rows).toHaveCount(1);
    await pager.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(pager).toContainText('Synthetic archive unavailable');
    await expect(rows.first()).toContainText(
      kind === 'resolved' ? 'Closed report 1' : 'Synthetic audit 1',
    );
    expect(attempts).toBe(1);
    await pager.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(rows.first()).toContainText(
      kind === 'resolved' ? 'Closed report 2' : 'Synthetic audit 2',
    );
    expect(attempts).toBe(2);
  });

test('audit grouping is limited to the same actor, entity, action and fifteen-minute interval', async ({
  page,
}) => {
  const row = {
    ...audit(1),
    category: 'access',
    action: 'report.evidence_viewed',
    metadata: { nested: { scope: 'synthetic' }, missing: null },
  };
  const events = [
    row,
    { ...row, id: id(2), occurred_at: '2026-01-01T00:00:00Z' },
    { ...row, id: id(3), occurred_at: '2026-01-01T00:16:00Z' },
    { ...row, id: id(4), occurred_at: 'invalid' },
    { ...row, id: id(5), actor: null, actor_role: null },
  ];
  await initialize(page, async () => {
    await page.route('**/portal/admin/audit?*', (route) =>
      route.fulfill({ json: { items: events, next_cursor: null } }),
    );
  });
  await page.locator('.portalNav [data-view="audit"]').click();
  await expect(page.locator('#auditList [data-audit-id]')).toHaveCount(4);
  await expect(page.locator('#auditList .auditRepeat')).toHaveText('2 similar views grouped');
  await page.locator('#auditList [data-audit-id]').first().click();
  await expect(page.locator('#auditDetailBody')).toContainText(
    '2 similar access events within 15 minutes',
  );
  await expect(page.locator('#auditDetailBody')).toContainText('"scope":"synthetic"');
  await expect(page.locator('#auditDetailBody')).toContainText('Not supplied');
});

test('inbox scope and search filters are passed to authorized reads, not applied to an old page', async ({
  page,
}) => {
  const reads = [];
  await initialize(page, async () => {
    await page.route('**/portal/admin/work-queue?*', (route) => {
      reads.push(new URL(route.request().url()));
      return route.fulfill({ json: { items: [], next_cursor: null } });
    });
  });
  await page.locator('.portalNav [data-view="inbox"]').click();
  for (const filter of ['urgent', 'unassigned', 'mine', 'all']) {
    await page.locator(`[data-queue-filters="inbox"] [data-queue-filter="${filter}"]`).click();
    await expect.poll(() => reads.at(-1).searchParams.get('filter')).toBe(filter);
  }
  await page.locator('#inboxTypeFilter').selectOption('safety');
  await expect.poll(() => reads.at(-1).searchParams.get('queue')).toBe('safety');
  await page.locator('#globalQueueSearch').fill('Synthetic reference');
  await expect.poll(() => reads.at(-1).searchParams.get('search')).toBe('Synthetic reference');
  await expect(page.locator('#queueResultCount')).toHaveText('0 work items');
});
