import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { moderationFixture, moderationUrl } from './moderation-action-fixture';
import { reportId, appealId } from '../moderation-fixture';
const target = '40000000-0000-4000-8000-000000000004';
async function fixture(page: Page, request: APIRequestContext) {
  const f = await moderationFixture(page, request);
  f.caps.operator_manage = true;
  f.owner.can_assign = true;
  const directory: Record<string, unknown>[] = [];
  await page.route('**/api/rpc', async (route) => {
    const call = route.request().postDataJSON();
    if (call.name !== 'get_admin_case_assignees_v1') return route.fallback();
    directory.push(call.args);
    return route.fulfill({
      json: { items: [{ id: target, label: 'Independent reviewer' }], next_cursor: null },
    });
  });
  return { ...f, directory };
}
for (const kind of ['report', 'appeal'] as const)
  test(kind + ' assignment releases without any outcome fields', async ({ page, request }) => {
    const f = await moderationFixture(page, request);
    await page.goto(
      moderationUrl + 'trust-safety/' + kind + '/' + (kind === 'report' ? reportId : appealId),
    );
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await page.getByRole('button', { name: 'Release assignment', exact: true }).click();
    await expect(page.getByText('Unassigned', { exact: true })).toBeVisible();
    expect(f.writes).toHaveLength(1);
    expect(f.writes[0]).toMatchObject({
      name: kind === 'report' ? 'admin_triage_report' : 'admin_case_ownership_command_v1',
      args: { p_action: 'release' },
    });
    expect(JSON.stringify(f.writes[0])).not.toMatch(/rationale|member_notice/);
  });
test('appeal manager assignment uses exact eligible scope and survives unknown receipt plus failed reads', async ({
  page,
  request,
}, info) => {
  const f = await fixture(page, request);
  f.failOnce();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(moderationUrl + 'trust-safety/appeal/' + appealId);
  await page.getByRole('button', { name: 'Change assignee' }).click();
  await page.getByRole('combobox', { name: 'New assignee' }).click();
  await page.getByRole('option', { name: 'Independent reviewer', exact: true }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('appeal-assignment-mobile.png') });
  await page.getByRole('button', { name: 'Assign reviewer', exact: true }).dblclick();
  await expect(page.getByRole('button', { name: 'Retry same action' })).toBeVisible();
  let denied = true;
  await page.route('**/api/rpc', async (route) =>
    denied && route.request().postDataJSON().name === 'get_admin_appeal_case_v1'
      ? route.fulfill({ status: 503, json: {} })
      : route.fallback(),
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Retry case read' })).toBeVisible();
  denied = false;
  await page.getByRole('button', { name: 'Retry same action' }).click();
  await expect(
    page.getByText('Action recorded. Current case data has been requested.'),
  ).toBeVisible();
  expect(f.writes).toHaveLength(2);
  expect(f.writes[0]).toEqual(f.writes[1]);
  expect(f.writes[0]).toMatchObject({
    name: 'admin_case_ownership_command_v1',
    args: {
      p_kind: 'appeal',
      p_id: appealId,
      p_action: 'assign',
      p_target: target,
      p_revision: 1,
      p_source_version: 'a'.repeat(32),
    },
  });
  expect(
    f.directory.every(
      (args) => args.p_kind === 'appeal' && args.p_id === appealId && args.p_limit === 25,
    ),
  ).toBe(true);
  expect(f.signing()).toBe(0);
});
test('changed appeal ownership blocks assignment and non-managers have no picker', async ({
  page,
  request,
}) => {
  const f = await fixture(page, request);
  await page.goto(moderationUrl + 'trust-safety/appeal/' + appealId);
  await page.getByRole('button', { name: 'Change assignee' }).click();
  await page.getByRole('combobox', { name: 'New assignee' }).click();
  await page.getByRole('option', { name: 'Independent reviewer' }).click();
  f.owner.revision++;
  await page.getByRole('button', { name: 'Assign reviewer' }).click();
  await expect(page.getByRole('dialog').getByText(/Ownership or case changed/)).toBeVisible();
  expect(f.writes).toEqual([]);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  f.caps.operator_manage = false;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Moderation appeal' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change assignee' })).toHaveCount(0);
  const reads = f.directory.length;
  await page.goto(moderationUrl + 'trust-safety/report/' + reportId);
  await expect(page.getByRole('heading', { name: 'Content report' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change assignee' })).toHaveCount(0);
  expect(f.directory.length).toBe(reads);
  await page.unrouteAll({ behavior: 'wait' });
});
