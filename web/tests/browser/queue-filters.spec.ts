import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installIdeaFixture } from './idea-fixture';
import { ideaArchiveFixture } from '../idea-archive-fixture';
import { installBusinessFixture } from './business-fixture';
import { installOperationsFixture } from './operations-fixture';
import { healthFixture } from '../health-fixture';

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' });
});
test('ideas keep history in the same queue and reset cursors when page size or status changes', async ({
  page,
  request,
}, info) => {
  const f = await installIdeaFixture(page, request);
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  await page.route('**/api/rpc', (route) => {
    const call = route.request().postDataJSON();
    if (call.name === 'get_admin_staff_work_page_v1') {
      calls.push(call);
      return route.fulfill({
        json: {
          scope: 'staff_inbox_v1',
          order: 'oldest_first',
          items: [],
          authorized_queues: ['suggestion'],
          next_cursor: null,
        },
      });
    }
    if (call.name !== 'get_admin_editorial_page_v1') return route.fallback();
    calls.push(call);
    const limit = Number(call.args.p_limit),
      offset = call.args.p_before_id ? 5 : 0;
    const raw = ideaArchiveFixture(
      call.args.p_filter === 'rejected' ? 0 : limit,
      call.args.p_filter,
      offset,
    );
    const tail = raw.items.at(-1);
    raw.next_cursor = offset === 0 && tail ? { at: tail.created_at, id: tail.id } : null;
    return route.fulfill({ json: raw });
  });
  await page.goto('https://admin.dojipro.com/connected.html#/community-ideas');
  await expect(page.getByRole('combobox', { name: 'Idea status' })).toHaveText('Pending review');
  await expect(page.getByText('No matching records')).toBeVisible();
  await expect(page.getByRole('link', { name: 'View idea history' })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Idea status' }).click();
  await page.getByRole('option', { name: 'Accepted', exact: true }).click();
  await expect(page).toHaveURL(/#\/community-ideas\?filter=approved$/);
  await expect(page.getByRole('link', { name: 'Synthetic idea 25', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Rows per page:' }).click();
  await page.getByRole('option', { name: '5', exact: true }).click();
  await expect.poll(() => calls.at(-1)?.args.p_limit).toBe(5);
  expect(calls.at(-1)?.args.p_before_id).toBeNull();
  await expect(page.getByRole('link', { name: 'Synthetic idea 6', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Go to next page' }).click();
  await expect(page.getByRole('link', { name: 'Synthetic idea 6', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('6–10');
  await page.getByRole('combobox', { name: 'Idea status' }).click();
  await page.getByRole('option', { name: 'Declined', exact: true }).click();
  await expect(page.getByText('No ideas match this status.')).toBeVisible();
  expect(calls.at(-1)?.args.p_before_id).toBeNull();
  await expect(page.getByRole('button', { name: 'Go to previous page' })).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'Rows per page:' })).toBeEnabled();
  // MUI hides the menu from the accessibility tree before its exit transition unmounts.
  await expect(page.locator('[role="listbox"]')).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('queue-empty-state.png'), fullPage: true });
  expect(f.writes).toEqual([]);
  expect(f.external).toEqual([]);
});

test('business history uses the same status control and bounded existing read', async ({
  page,
  request,
}) => {
  const f = await installBusinessFixture(page, request);
  const calls: Record<string, unknown>[] = [];
  await page.route('**/api/rpc', (route) => {
    const call = route.request().postDataJSON();
    if (call.name !== 'get_admin_business_applications_page_v1') return route.fallback();
    calls.push(call.args);
    return route.fulfill({
      json: {
        items: [
          {
            id: '20000000-0000-4000-8000-000000000002',
            brand_name: 'Reviewed business',
            state: call.args.p_state,
            revision: 2,
            updated_at: '2026-10-09T10:00:00Z',
          },
        ],
        next_cursor: null,
      },
    });
  });
  await page.goto('https://admin.dojipro.com/connected.html#/businesses');
  await expect(page.getByRole('combobox', { name: 'Application status' })).toHaveText(
    'Open applications',
  );
  await page.getByRole('combobox', { name: 'Application status' }).click();
  await page.getByRole('option', { name: 'Approved', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Reviewed business' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Updated' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Rows per page:' }).click();
  await page.getByRole('option', { name: '10', exact: true }).click();
  await expect.poll(() => calls.at(-1)?.p_limit).toBe(10);
  expect(f.commands).toEqual([]);
  expect(f.external).toEqual([]);
});

test('health distinguishes a missing observation contract and displays source status without routine alerts', async ({
  page,
  request,
}, info) => {
  const f = await installOperationsFixture(page, request);
  await page.route('**/api/rpc', (route) => {
    if (route.request().postDataJSON().name !== 'portal_platform_health_v1')
      return route.fallback();
    const raw = healthFixture();
    return route.fulfill({ json: { ...raw, sentry: { ...raw.sentry, observed_at: null } } });
  });
  await page.goto('https://admin.dojipro.com/connected.html#/operations');
  await expect(
    page.getByRole('heading', { name: 'Some health signals are unverified' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Services & coverage' }).click();
  await expect(page.getByRole('tab', { name: 'Services & coverage' })).toHaveAttribute(
    'aria-selected', 'true',
  );
  await expect(page.getByText('Needs attention', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Monitoring scope' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('health-sources.png'), fullPage: true });
  await page.getByRole('tab', { name: 'App issues', exact: true }).click();
  await expect(
    page.getByText('The monitoring service has not supplied a verified Sentry observation time.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Synthetic foreground timeout' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry monitoring read' })).toBeVisible();
  expect(f.commands).toEqual([]);
  expect(f.external).toEqual([]);
});
