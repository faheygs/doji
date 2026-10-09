import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { moderationFixture, moderationUrl } from './moderation-action-fixture';
import { reportId, appealId, moderatorId } from '../moderation-fixture';
import type { Page } from '@playwright/test';
async function select(page: Page, field: string, option: string) {
  await page.getByRole('combobox', { name: field, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
async function noViolation(page: Page) {
  await select(page, 'Action', 'Close with no violation');
  await page
    .getByRole('textbox', { name: 'Internal rationale' })
    .fill('Reviewed the available report evidence.');
  await page
    .getByRole('textbox', { name: 'Member notice' })
    .fill('We found no policy violation in this report.');
  await page.getByRole('button', { name: 'Review outcome', exact: true }).click();
}
test('start review assigns immediately without fields, then a decision requires confirmation', async ({
  page,
  request,
}) => {
  const f = await moderationFixture(page, request);
  Object.assign(f.report, { assigned_to: null });
  Object.assign(f.report.triage_state, { assigned_to: null });
  await page.goto(moderationUrl + 'trust-safety/report/' + reportId);
  await expect(page.getByText('Unassigned', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start review', exact: true }).click();
  await expect(page.getByText('Assigned to you', { exact: true })).toBeVisible();
  expect(f.writes[0]).toMatchObject({
    name: 'admin_triage_report',
    args: { p_action: 'claim', p_note: null, p_priority: null, p_report_id: reportId },
  });
  await noViolation(page);
  expect(f.writes).toHaveLength(1);
  await page.getByRole('button', { name: 'Confirm outcome' }).dblclick();
  await expect(page.getByText('dismissed', { exact: true })).toBeVisible();
  expect(f.writes).toHaveLength(2);
  expect(f.writes[1]?.name).toBe('admin_decide_report_v3');
});
test('unknown decision survives a refreshed record and retries only the same immutable command', async ({
  page,
  request,
}) => {
  const f = await moderationFixture(page, request);
  f.failOnce();
  await page.goto(moderationUrl + 'trust-safety/report/' + reportId);
  await noViolation(page);
  await page.getByRole('button', { name: 'Confirm outcome' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /outcome is unconfirmed/ })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('dismissed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry same action' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(f.writes).toHaveLength(2);
  expect(f.writes[1]).toEqual(f.writes[0]);
});
test('changed evidence blocks a prepared decision and conflicts do not retry automatically', async ({
  page,
  request,
}) => {
  const f = await moderationFixture(page, request);
  await page.goto(moderationUrl + 'trust-safety/report/' + reportId);
  await noViolation(page);
  f.report.evidence.caption = 'New authorized evidence';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('New authorized evidence')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm outcome' })).toBeDisabled();
  expect(f.writes).toEqual([]);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh case' }).click();
  await noViolation(page);
  f.conflict();
  await page.getByRole('button', { name: 'Confirm outcome' }).click();
  await expect(page.getByRole('button', { name: 'Confirm outcome' })).toBeDisabled();
  expect(f.writes).toHaveLength(1);
});
test('restricted account consequences need restricted-review authority and explicit confirmation', async ({
  page,
  request,
}) => {
  const f = await moderationFixture(page, request);
  f.report.triage_state.queue = 'restricted_safety';
  await page.goto(moderationUrl + 'restricted-safety/report/' + reportId);
  await select(page, 'Action', 'Remove reported content');
  await select(page, 'Policy', 'restricted goods');
  await select(page, 'Severity', 'level 3');
  await select(page, 'Account consequence', 'Temporary participation restriction');
  await select(page, 'Restriction duration', '7 days');
  await page
    .getByRole('textbox', { name: 'Internal rationale' })
    .fill('Restricted reviewer verified the evidence.');
  await page
    .getByRole('textbox', { name: 'Member notice' })
    .fill('Your participation is restricted for seven days.');
  await page.getByRole('button', { name: 'Review outcome' }).click();
  await expect(page.getByRole('dialog').getByText('days: 7', { exact: true })).toBeVisible();
  expect(f.writes).toEqual([]);
  await page.getByRole('button', { name: 'Confirm outcome' }).click();
  await expect(page.getByText('actioned', { exact: true })).toBeVisible();
  expect(f.writes[0]?.args).toMatchObject({
    p_account_action: 'temporary_restriction',
    p_restriction_days: 7,
    p_action: 'remove_content',
  });
});
test('appeal override is acknowledged and uses the appeal command, not a new report decision', async ({
  page,
  request,
}) => {
  const f = await moderationFixture(page, request);
  f.appeal.review_eligibility.super_admin_override_required = true;
  await page.goto(moderationUrl + 'trust-safety/appeal/' + appealId);
  await select(page, 'Action', 'Reverse original decision');
  await page
    .getByRole('textbox', { name: /Review explanation/ })
    .fill('The original evidence does not support enforcement.');
  await page.getByRole('button', { name: 'Review outcome' }).click();
  await expect(page.getByRole('button', { name: 'Confirm outcome' })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Confirm outcome' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(f.writes.map((w) => w.name)).toEqual(['admin_review_moderation_appeal']);
});
test('denied writes and another assignee leave evidence read-only', async ({ page, request }) => {
  const f = await moderationFixture(page, request);
  f.caps.moderation_write = false;
  await page.goto(moderationUrl + 'trust-safety/report/' + reportId);
  await expect(page.getByText('You have read-only access to this case.')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Action' })).toHaveCount(0);
  f.caps.moderation_write = true;
  Object.assign(f.report.triage_state, { assigned_to: appealId });
  Object.assign(f.report, {
    assigned_to: appealId,
    owner: { id: appealId, display_name: 'Another reviewer' },
  });
  await page.reload();
  await expect(page.getByText('This case is assigned to another employee.')).toBeVisible();
  expect(f.writes).toEqual([]);
  expect(f.report.assigned_to).not.toBe(moderatorId);
});
test('protected media is explicit, expires locally, and retains standard accessible components', async ({
  page,
  request,
}, info) => {
  const f = await moderationFixture(page, request);
  f.report.media_manifest.items = [
    {
      slot: 'photo',
      kind: 'image',
      availability: 'available',
      bucket: 'post-media',
      path: reportId + '/photo.svg',
    },
  ];
  // Intercept synthetic bytes at the CSP-allowed origin; never request real media.
  await page.route('https://tvixsmqxotuvyjqzmjla.supabase.co/storage/v1/object/sign/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="gray"/></svg>',
    }),
  );
  await page.goto(moderationUrl + 'trust-safety/report/' + reportId);
  await expect(page.getByRole('button', { name: 'Open photo', exact: true })).toBeVisible();
  expect(f.signing()).toBe(0);
  await page.clock.install();
  await page.getByRole('button', { name: 'Open photo', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Reported photo' })).toBeVisible();
  expect(f.signing()).toBe(1);
  await page.clock.fastForward(270001);
  await expect(page.getByRole('img', { name: 'Reported photo' })).toHaveCount(0);
  await expect(page.getByText(/Preview expired/)).toBeVisible();
  expect(f.signing()).toBe(1);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath('moderation-actions-mobile.png'), fullPage: true });
});
