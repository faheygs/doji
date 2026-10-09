import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installSafetyFixture, safetyId, safetyActor } from './safety-fixture';
import { targetFixture, targetId, linkedReportId } from '../safety-target-fixture';
import { reportFixture } from '../moderation-fixture';
const url = 'https://admin.dojipro.com/connected.html#/trust-safety/external/' + safetyId;
async function setup(page: Page, request: APIRequestContext, mode = 'success') {
  const f = await installSafetyFixture(page, request);
  f.item.assigned_to = safetyActor;
  Object.assign(f.item.classification, { targets: ['post', 'profile_photo'] });
  const target = targetFixture(),
    writes: Record<string, unknown>[] = [],
    inspections: unknown[] = [];
  await page.route('**/api/rpc', async (route) => {
    const { name, args } = route.request().postDataJSON();
    if (name === 'get_admin_safety_target_v1') {
      inspections.push(args);
      return route.fulfill({ json: { ...target, kind: args.p_kind } });
    }
    if (name === 'admin_create_safety_report_v1') {
      writes.push(args);
      if (mode === 'conflict') return route.fulfill({ status: 409, json: {} });
      f.item.report_id = linkedReportId;
      f.item.revision = args.p_revision + 1;
      if (mode === 'uncertain' && writes.length === 1)
        return route.fulfill({ status: 503, json: {} });
      return route.fulfill({
        json: {
          id: safetyId,
          revision: args.p_revision + 1,
          report_id: linkedReportId,
          outcome: 'saved',
        },
      });
    }
    if (name === 'get_admin_report_case_v3')
      return route.fulfill({ json: { ...reportFixture(), id: linkedReportId } });
    return route.fallback();
  });
  return { ...f, target, writes, inspections };
}
async function prepare(page: Page) {
  await page.getByRole('textbox', { name: 'Exact content ID', exact: true }).fill(targetId);
  await page.getByRole('button', { name: 'Inspect content', exact: true }).click();
  await expect(page.getByText(/Synthetic content/, { exact: false })).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Content identification rationale' })
    .fill('Matched the exact ID supplied in the original request.');
  await page
    .getByRole('checkbox', { name: 'I verified this is the content identified in the request.' })
    .check();
  await page.getByRole('button', { name: 'Review report creation' }).click();
}
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' });
});
test('explicit inspection is text only and confirmed atomic report links to a reauthorized full-page case', async ({
  page,
  request,
}, info) => {
  const f = await setup(page, request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await expect(page.getByRole('textbox', { name: 'Exact content ID' })).toBeVisible();
  expect(f.inspections).toEqual([]);
  expect(f.writes).toEqual([]);
  await prepare(page);
  await expect(page.getByRole('dialog')).toContainText('Content visibility stays unchanged');
  expect(await page.getByRole('img').count()).toBe(0);
  expect(await page.locator('body').textContent()).not.toContain('private/reference');
  await expect(page.locator('.MuiDialog-container')).toHaveCSS('opacity', '1');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('exact-content-mobile.png') });
  await page.getByRole('button', { name: 'Create report', exact: true }).dblclick();
  await expect(page.getByRole('link', { name: 'Open linked moderation case' })).toBeVisible();
  expect(f.writes).toHaveLength(1);
  expect(f.writes[0]).toMatchObject({
    p_id: safetyId,
    p_revision: 1,
    p_input: { target_id: targetId, kind: 'post', fingerprint: 'a'.repeat(64) },
  });
  expect(f.inspections).toHaveLength(2);
  await page.getByRole('link', { name: 'Open linked moderation case' }).click();
  await expect(page.getByRole('heading', { name: 'Content report' })).toBeVisible();
  await expect(page.getByText('Current synthetic caption')).toBeVisible();
  await page.getByRole('link', { name: 'Back to external request' }).click();
  await expect(page.getByRole('heading', { name: 'External removal request' })).toBeVisible();
  expect(f.commands).toEqual([]);
  expect(f.external).toEqual([]);
});
test('unknown receipt survives newer linked case and failed reads and retries exactly once without another target', async ({
  page,
  request,
}) => {
  const f = await setup(page, request, 'uncertain');
  await page.goto(url);
  await prepare(page);
  await page.getByRole('button', { name: 'Create report', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry same report' })).toBeVisible();
  f.failRead(true);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Retry record read' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry same report' }).click();
  await expect(
    page.getByText('Report created and linked. Current case data has been requested.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry same report' })).toHaveCount(0);
  expect(f.writes).toHaveLength(2);
  expect(f.writes[1]).toEqual(f.writes[0]);
  f.failRead(false);
  await page.getByRole('button', { name: 'Retry record read' }).click();
  await expect(page.getByRole('link', { name: 'Open linked moderation case' })).toBeVisible();
  expect(f.writes).toHaveLength(2);
});
test('changed exact content blocks creation and server conflict never automatically retries', async ({
  page,
  request,
}) => {
  const f = await setup(page, request, 'conflict');
  await page.goto(url);
  await prepare(page);
  f.target.fingerprint = 'b'.repeat(64);
  await page.getByRole('button', { name: 'Create report', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh report preparation' })).toBeVisible();
  expect(f.writes).toEqual([]);
  await page.getByRole('button', { name: 'Refresh report preparation' }).click();
  await prepare(page);
  await page.getByRole('button', { name: 'Create report', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh report preparation' })).toBeVisible();
  expect(f.writes).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Retry same report' })).toHaveCount(0);
});
test('identity mismatch hides preview and access loss removes protected target', async ({
  page,
  request,
}) => {
  const f = await setup(page, request);
  f.target.id = safetyId;
  await page.goto(url);
  await page.getByRole('textbox', { name: 'Exact content ID' }).fill(targetId);
  await page.getByRole('button', { name: 'Inspect content' }).click();
  await expect(
    page.getByText('Exact content could not be verified. No report has been created.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review report creation' })).toHaveCount(0);
  f.target.id = targetId;
  await page.getByRole('button', { name: 'Inspect content' }).click();
  await expect(page.getByText(/Synthetic content/)).toBeVisible();
  f.deny();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText(/Synthetic content/)).toHaveCount(0);
  expect(f.writes).toEqual([]);
});
test('restricted content requires explicit quarantine consequence while profile photo does not imply removal', async ({
  page,
  request,
}) => {
  const f = await setup(page, request);
  f.item.queue = 'restricted_safety';
  await page.goto(url.replace('trust-safety', 'restricted-safety'));
  await prepare(page);
  await expect(page.getByRole('dialog')).toContainText('quarantines this exact content');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('combobox', { name: 'Content type' }).click();
  await page.getByRole('option', { name: 'Profile photo', exact: true }).click();
  await prepare(page);
  await expect(page.getByRole('dialog')).toContainText('does not automatically remove');
  expect(f.writes).toEqual([]);
});
