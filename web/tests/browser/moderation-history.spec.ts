import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { moderationFixture, moderationUrl } from './moderation-action-fixture';
import { reportId, appealId } from '../moderation-fixture';
test('history pages locally, keeps evidence access separate, and preserves an unchanged draft on refresh', async ({
  page,
  request,
}, info) => {
  const f = await moderationFixture(page, request);
  const history = Array.from({ length: 50 }, (_, i) => ({
    action: 'report.claimed',
    occurred_at: new Date(Date.UTC(2026, 9, 9, 0, i)).toISOString(),
    actor: { display_name: 'History reviewer' },
    reason: 'History note ' + i,
  }));
  Object.assign(f.report, {
    workflow_history: history,
    evidence_access: { view_count: 3, last_viewed_at: '2026-10-09T12:00:00Z' },
  });
  await page.goto(moderationUrl + 'trust-safety/report/' + reportId);
  await page.getByRole('button', { name: 'Case history', exact: true }).click();
  const table = page.getByRole('region', {
    name: 'report workflow history table contents',
    exact: true,
  });
  await expect(table.getByText('History note 49', { exact: true })).toBeVisible();
  await expect(page.getByText('3 recorded evidence views')).toBeVisible();
  const reads = f.reads.length;
  await page.getByRole('button', { name: 'Go to next page', exact: true }).click();
  await expect(table.getByText('History note 39', { exact: true })).toBeVisible();
  expect(f.reads.length).toBe(reads);
  await page.getByRole('combobox', { name: 'Action', exact: true }).click();
  await page.getByRole('option', { name: 'Close with no violation' }).click();
  await page
    .getByRole('textbox', { name: 'Internal rationale' })
    .fill('Preserve this moderator draft.');
  Object.assign(f.report, { evidence_access: { view_count: 4 } });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('4 recorded evidence views')).toBeVisible();
  await expect(
    page.getByText('The case changed. Refresh before preparing another action.'),
  ).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Internal rationale' })).toHaveValue(
    'Preserve this moderator draft.',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await table.scrollIntoViewIfNeeded();
  expect(await table.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('moderation-history-mobile.png') });
  await page.route('**/api/rpc', async (route) =>
    route.request().postDataJSON().name === 'get_admin_report_case_v3'
      ? route.fulfill({ status: 403, json: {} })
      : route.fallback(),
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Retry case read' })).toBeVisible();
  await expect(page.getByText('History reviewer', { exact: true })).toHaveCount(0);
  expect(f.writes).toEqual([]);
  expect(f.signing()).toBe(0);
});
test('appeal history retains its original reviewer and explicitly shows absent review metadata', async ({
  page,
  request,
}) => {
  const f = await moderationFixture(page, request);
  Object.assign(f.appeal.original_decision, {
    decided_by: { display_name: 'Original employee' },
    decided_at: '2026-10-01T12:00:00Z',
  });
  Object.assign(f.appeal.appeal, {
    status: 'upheld',
    reviewed_at: 'invalid',
    reviewed_by: null,
    review_reason: '<b>Literal review</b>',
  });
  Object.assign(f.appeal.report_case, {
    current_decision: { id: reportId, rationale: 'Newer unrelated decision' },
  });
  await page.goto(moderationUrl + 'trust-safety/appeal/' + appealId);
  await page.getByRole('button', { name: 'Case history', exact: true }).click();
  const history = page.getByRole('heading', { name: 'Appeal history', exact: true }).locator('..');
  await expect(history.getByText('Appeal upheld', { exact: true })).toBeVisible();
  await expect(history.getByText(/Original employee/)).toBeVisible();
  await expect(history.getByText('Time not recorded · Reviewer unavailable')).toBeVisible();
  await expect(history.getByText('<b>Literal review</b>', { exact: true })).toBeVisible();
  await expect(history.locator('b')).toHaveCount(0);
  await expect(page.getByText('Newer unrelated decision')).toHaveCount(0);
  await expect(page.getByText('Workflow history is unavailable in this response.')).toBeVisible();
  expect(f.writes).toEqual([]);
});
