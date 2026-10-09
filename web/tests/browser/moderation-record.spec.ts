import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installBusinessFixture } from './business-fixture';
import {
  reportFixture,
  appealFixture,
  appealOwner,
  moderatorId,
  reportId,
  appealId,
} from '../moderation-fixture';
import type { Page, APIRequestContext } from '@playwright/test';
for (const legal of [false, true])
  test(`overview report preserves restricted permission ${legal}`, async ({ page, request }) => {
    const f = await fixture(page, request, legal);
    f.report.triage_state.queue = 'restricted_safety';
    await page.goto('https://admin.dojipro.com/connected.html#/overview/report/' + reportId);
    if (legal) {
      await expect(page.getByText('Current synthetic caption')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Back to overview' })).toHaveAttribute(
        'href',
        '#/',
      );
    } else {
      await expect(page.getByRole('button', { name: 'Retry case read' })).toBeVisible();
      await expect(page.getByText('Current synthetic caption')).toHaveCount(0);
    }
    expect(f.calls.filter((name) => name.startsWith('admin_'))).toEqual([]);
    await page.unrouteAll({ behavior: 'wait' });
  });
async function fixture(page: Page, request: APIRequestContext, legal = true) {
  const base = await installBusinessFixture(page, request);
  const report = reportFixture(),
    appeal = appealFixture();
  const calls: string[] = [];
  let denied = false;
  await page.route('https://admin.dojipro.com/api/session', (route) =>
    route.fulfill({
      json: {
        signedIn: true,
        assurance: 'aal2',
        csrf: 'c'.repeat(43),
        operator: {
          user_id: moderatorId,
          display_name: 'Synthetic moderator',
          capabilities: { moderation_read: true, legal_read: legal },
        },
      },
    }),
  );
  await page.route('https://admin.dojipro.com/api/rpc', async (route) => {
    const { name } = route.request().postDataJSON() as { name: string };
    calls.push(name);
    if (
      [
        'get_admin_report_case_v3',
        'get_admin_appeal_case_v1',
        'get_admin_case_ownership_v1',
      ].includes(name)
    )
      return route.fulfill({
        status: denied ? 403 : 200,
        json: denied
          ? {}
          : name === 'get_admin_report_case_v3'
            ? report
            : name === 'get_admin_appeal_case_v1'
              ? appeal
              : appealOwner(),
      });
    if (name === 'get_admin_safety_work_page_v1')
      return route.fulfill({
        json: {
          scope: 'staff_safety_v1',
          queue: 'moderation',
          closed: false,
          order: 'oldest_first',
          authorized_queues: ['report', 'appeal'],
          next_cursor: null,
          items: [
            ['report', reportId],
            ['appeal', appealId],
          ].map(([kind, id]) => ({
            kind,
            id,
            key: kind + ':' + id,
            subject: 'Synthetic ' + kind,
            at: '2026-10-08T12:00:00Z',
            assigned_to: moderatorId,
            due_at: null,
            work_state: 'ready',
            origin: 'in_app',
            status: 'pending',
            ownership_model: kind === 'report' ? 'existing_report' : 'staff_workflow',
          })),
        },
      });
    return route.fallback();
  });
  return {
    ...base,
    report,
    appeal,
    calls,
    deny: () => {
      denied = true;
    },
  };
}
const baseUrl = 'https://admin.dojipro.com/connected.html#/';
test('report row opens full-page current evidence with assignee and no commands or media requests', async ({
  page,
  request,
}, info) => {
  const f = await fixture(page, request);
  f.report.media_manifest.items = [
    {
      slot: 'photo',
      kind: 'image',
      availability: 'available',
      bucket: 'post-media',
      path: 'private.jpg',
    },
  ];
  await page.goto(baseUrl + 'trust-safety');
  await page.getByRole('row').filter({ hasText: 'Synthetic report' }).click();
  await expect(page.getByRole('heading', { name: 'Content report', exact: true })).toBeVisible();
  await expect(page.getByText('Current synthetic caption')).toBeVisible();
  await expect(page.getByText('Assigned to you', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open photo', exact: true })).toBeVisible();
  expect(f.calls).not.toContain('portal_sign_evidence_v1');
  expect(f.calls.filter((name) => name.startsWith('admin_'))).toEqual([]);
  expect(f.external).toEqual([]);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath('report-mobile.png'), fullPage: true });
});
test('appeal distinguishes original decision and missing historical snapshot from current content', async ({
  page,
  request,
}) => {
  const f = await fixture(page, request);
  f.appeal.review_eligibility.can_review = false;
  f.appeal.review_eligibility.blocked_reason = 'independent_reviewer_required';
  await page.goto(baseUrl + 'trust-safety/appeal/' + appealId);
  await expect(page.getByRole('heading', { name: 'Decision being appealed' })).toBeVisible();
  await expect(page.getByText('Original synthetic rationale')).toBeVisible();
  await expect(page.getByText(/full historical content snapshot was not retained/)).toBeVisible();
  await expect(page.getByText(/independent reviewer required/)).toBeVisible();
  await expect(page.getByText('Current synthetic caption')).toBeVisible();
  expect(f.calls.filter((name) => name.startsWith('admin_'))).toEqual([]);
});
test('foreground reconciliation replaces evidence and read denial removes all private case data', async ({
  page,
  request,
}) => {
  const f = await fixture(page, request);
  await page.goto(baseUrl + 'trust-safety/report/' + reportId);
  await expect(page.getByText('Current synthetic caption')).toBeVisible();
  f.report.evidence.caption = 'Updated authorized caption';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Updated authorized caption')).toBeVisible();
  await expect(page.getByText('Current synthetic caption')).toHaveCount(0);
  f.deny();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Retry case read' })).toBeVisible();
  await expect(page.getByText('Updated authorized caption')).toHaveCount(0);
});
test('restricted deep link is denied before case read and unexpected restricted payload is hidden', async ({
  page,
  request,
}) => {
  const f = await fixture(page, request, false);
  await page.goto(baseUrl + 'restricted-safety/report/' + reportId);
  await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible();
  expect(f.calls).not.toContain('get_admin_report_case_v3');
  f.report.triage_state.queue = 'restricted_safety';
  await page.goto(baseUrl + 'trust-safety/report/' + reportId);
  await expect(page.getByRole('button', { name: 'Retry case read' })).toBeVisible();
  await expect(page.getByText('Current synthetic caption')).toHaveCount(0);
});
