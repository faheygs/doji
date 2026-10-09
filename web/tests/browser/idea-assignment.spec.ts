import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import { installIdeaFixture, ideaUrl } from './idea-fixture';
import { ideaId } from '../idea-fixture';
import AxeBuilder from '@axe-core/playwright';
const target = '40000000-0000-4000-8000-000000000004';
const second = '50000000-0000-4000-8000-000000000005';
async function fixture(page: Page, request: APIRequestContext, uncertain = false) {
  const f = await installIdeaFixture(page, request);
  const directory: Record<string, unknown>[] = [];
  await page.route('**/api/rpc', async (route) => {
    const call = route.request().postDataJSON() as (typeof f.writes)[number];
    if (call.name === 'get_admin_case_assignees_v1') {
      directory.push(call.args);
      return route.fulfill({
        json: {
          items: [
            {
              id: call.args.p_after_id ? second : target,
              label: call.args.p_after_id ? 'Reviewer B' : 'Reviewer A',
            },
          ],
          next_cursor: call.args.p_after_id ? null : target,
        },
      });
    }
    if (call.name !== 'admin_case_ownership_command_v1') return route.fallback();
    f.writes.push(call);
    Object.assign(f.owner, {
      assigned_to: call.args.p_target,
      owner_label: call.args.p_target === target ? 'Reviewer A' : 'Reviewer B',
      revision: Number(call.args.p_revision) + 1,
      can_claim: false,
      can_release: true,
    });
    if (uncertain) {
      uncertain = false;
      return route.fulfill({ status: 503, json: { message: 'Receipt unavailable' } });
    }
    return route.fulfill({
      json: {
        kind: 'suggestion',
        id: ideaId,
        revision: Number(call.args.p_revision) + 1,
        assigned_to: call.args.p_target,
        replayed: f.writes.length > 1,
      },
    });
  });
  return { ...f, directory };
}
async function choose(page: Page, name = 'Reviewer A') {
  await page.getByRole('combobox', { name: 'New assignee' }).click();
  await page.getByRole('option', { name }).click();
}
test('idea reassignment uses eligible pages, explicit confirmation and a single field-free command', async ({
  page,
  request,
}) => {
  const f = await fixture(page, request);
  await page.goto(ideaUrl);
  await page.getByRole('button', { name: 'Change assignee' }).click();
  await choose(page);
  await page.getByRole('button', { name: 'Next reviewers' }).click();
  await expect(page.getByRole('button', { name: 'Assign reviewer' })).toBeDisabled();
  await choose(page, 'Reviewer B');
  expect(f.writes).toEqual([]);
  await page
    .getByRole('button', { name: 'Assign reviewer' })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(page.getByText('Assignee: Reviewer B')).toBeVisible();
  expect(f.writes).toHaveLength(1);
  expect(f.writes[0]).toMatchObject({
    name: 'admin_case_ownership_command_v1',
    args: {
      p_kind: 'suggestion',
      p_id: ideaId,
      p_action: 'assign',
      p_target: second,
      p_revision: 0,
      p_source_version: 'a'.repeat(32),
    },
  });
  expect(
    f.directory.every(
      (args) => args.p_kind === 'suggestion' && args.p_id === ideaId && args.p_limit === 25,
    ),
  ).toBe(true);
  expect(f.external).toEqual([]);
});
test('uncertain assignment preserves the target and request key despite a changed record', async ({
  page,
  request,
}) => {
  const f = await fixture(page, request, true);
  await page.goto(ideaUrl);
  await page.getByRole('button', { name: 'Change assignee' }).click();
  await choose(page);
  await page.getByRole('button', { name: 'Assign reviewer' }).click();
  await expect(page.getByRole('button', { name: 'Retry identical action' })).toBeEnabled();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByRole('button', { name: 'Retry identical action' }).click();
  await expect(page.getByText('Assignee: Reviewer A')).toBeVisible();
  expect(f.writes).toHaveLength(2);
  expect(f.writes[1]).toEqual(f.writes[0]);
});
test('fresh ownership changes stop prepared reassignment', async ({ page, request }) => {
  const f = await fixture(page, request);
  await page.goto(ideaUrl);
  await page.getByRole('button', { name: 'Change assignee' }).click();
  await choose(page);
  f.owner.revision++;
  await page.getByRole('button', { name: 'Assign reviewer' }).click();
  await expect(
    page.getByRole('dialog').getByText(/Ownership or permissions changed/),
  ).toBeVisible();
  expect(f.writes).toEqual([]);
});
test('non-managers cannot open the idea reassignment directory', async ({ page, request }) => {
  const f = await installIdeaFixture(page, request, false);
  await page.goto(ideaUrl);
  await expect(page.getByRole('button', { name: 'Start review' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change assignee' })).toHaveCount(0);
  expect(f.writes).toEqual([]);
});
test('server assignment rejection stays blocked until refresh and never retries automatically', async ({
  page,
  request,
}) => {
  const f = await fixture(page, request);
  await page.route('**/api/rpc', async (route) => {
    const call = route.request().postDataJSON() as (typeof f.writes)[number];
    if (call.name !== 'admin_case_ownership_command_v1') return route.fallback();
    f.writes.push(call);
    return route.fulfill({ status: 409, json: { message: 'Assignment changed' } });
  });
  await page.goto(ideaUrl);
  await page.getByRole('button', { name: 'Change assignee' }).click();
  await choose(page);
  await page.getByRole('button', { name: 'Assign reviewer' }).click();
  await expect(page.getByText(/Action was not accepted/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change assignee' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Retry identical action' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh record' }).click();
  await expect(page.getByRole('button', { name: 'Change assignee' })).toBeEnabled();
  expect(f.writes).toHaveLength(1);
});
test('idea assignment uses an accessible Material dialog on mobile', async ({
  page,
  request,
}, info) => {
  await fixture(page, request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ideaUrl);
  await page.getByRole('button', { name: 'Change assignee' }).click();
  await choose(page);
  await expect(page.getByRole('button', { name: 'Assign reviewer' })).toBeEnabled();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  const box = await page.getByRole('dialog').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath('idea-assignment-mobile.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Change assignee' })).toBeFocused();
});
