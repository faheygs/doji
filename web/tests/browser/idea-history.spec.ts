import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installIdeaFixture } from './idea-fixture';
import { ideaArchiveFixture } from '../idea-archive-fixture';
import { ideaFixture, ideaOwner } from '../idea-fixture';
const url = 'https://admin.dojipro.com/connected.html#/community-ideas/archive?filter=approved';

test.afterEach(async ({ page }) => {
  // Complete local asset forwarding before Playwright disposes its request fixture.
  await page.unrouteAll({ behavior: 'wait' });
});

test('idea archive filters and pages on the server, opens current detail and preserves status on return', async ({
  page,
  request,
}, info) => {
  const f = await installIdeaFixture(page, request);
  const reads: Record<string, unknown>[] = [];
  let denied = false;
  await page.route('**/api/rpc', (route) => {
    const { name, args } = route.request().postDataJSON() as {
      name: string;
      args: Record<string, unknown>;
    };
    if (name === 'get_admin_editorial_page_v1') {
      reads.push(args);
      return route.fulfill({
        status: denied ? 403 : 200,
        json: denied
          ? {}
          : ideaArchiveFixture(
              args.p_before_id ? 1 : 25,
              String(args.p_filter === 'all' ? 'approved' : args.p_filter),
              args.p_before_id ? 25 : 0,
            ),
      });
    }
    if (name === 'get_admin_editorial_item_v1')
      return route.fulfill({
        json: {
          ...ideaFixture(),
          id: args.p_id,
          status: 'approved',
          allowed_actions: ['pending', 'rejected'],
        },
      });
    if (name === 'get_admin_case_ownership_v1')
      return route.fulfill({
        json: { ...ideaOwner(), id: args.p_id, can_claim: false, actionable: false },
      });
    return route.fallback();
  });
  await page.goto(url);
  await expect(page.getByRole('link', { name: 'Synthetic idea 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /next page/i }).click();
  await expect(page.getByRole('link', { name: 'Synthetic idea 26' })).toBeVisible();
  expect(reads.at(-1)?.p_before_id).toBe(ideaArchiveFixture().next_cursor?.id);
  await page.getByRole('link', { name: 'Synthetic idea 26' }).click();
  await expect(page.getByRole('heading', { name: 'Community idea', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to idea history' }).click();
  await expect(page.getByRole('combobox', { name: 'Idea status' })).toHaveText('Accepted');
  await page.getByRole('combobox', { name: 'Idea status' }).click();
  await page.getByRole('option', { name: 'Declined' }).click();
  await expect.poll(() => reads.at(-1)?.p_filter).toBe('rejected');
  expect(reads.at(-1)?.p_before_id).toBeNull();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('idea-history-mobile.png'), fullPage: true });
  denied = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Retry idea history' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Synthetic idea 1', exact: true })).toHaveCount(0);
  expect(f.writes).toHaveLength(0);
  expect(f.external).toEqual([]);
});

test('idea history permission denial never dispatches the archive read', async ({
  page,
  request,
}) => {
  const { installBusinessFixture } = await import('./business-fixture');
  const f = await installBusinessFixture(page, request);
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible();
  expect(f.reads).not.toContain('get_admin_editorial_page_v1');
});
