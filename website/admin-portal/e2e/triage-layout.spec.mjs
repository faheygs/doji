import { expect, test } from '../../coverage-fixture.mjs';
import { installMockBackend, seedAdminSession, commandCenter } from './fixtures.mjs';

test('queue pages stay bounded and Previous reuses already authorized rows', async ({ page }) => {
  const items = Array.from({ length: 30 }, (_, i) => ({ ...commandCenter.work_items[0], id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, subject: `Review item ${i + 1}` }));
  await seedAdminSession(page);
  const requests = await installMockBackend(page, { workQueue: (url) => url.searchParams.has('afterAt') ? { items: items.slice(25), next_cursor: null } : { items: items.slice(0, 25), next_cursor: { id: `report:${items[24].id}`, at: items[24].submitted_at } } });
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  await page.getByRole('button', { name: 'Trust & safety', exact: true }).click();
  const rows = page.locator('[data-queue-body="moderation"] [data-work-id]');
  const pager = page.locator('[data-active-paging="moderation"]');
  await expect(rows).toHaveCount(25);
  await expect(pager.getByRole('button', { name: 'Previous' })).toBeDisabled();
  await pager.getByRole('button', { name: 'Next' }).click();
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toContainText('Review item 26');
  await expect(pager).toContainText('Page 2');
  await expect(pager.getByRole('button', { name: 'Next' })).toBeDisabled();
  const reads = requests.length;
  await pager.getByRole('button', { name: 'Previous' }).click();
  await expect(rows).toHaveCount(25);
  expect(requests.length).toBe(reads);
  const geometry = await page.locator('[data-portal-view="moderation"] .queuePanel').evaluate((panel) => ({ bottom: panel.getBoundingClientRect().bottom, viewport: innerHeight, scroll: panel.querySelector('.tableWrap').scrollHeight, height: panel.querySelector('.tableWrap').clientHeight }));
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.scroll).toBeGreaterThan(geometry.height);
  await page.screenshot({ path: 'test-results/triage-paged-desktop.png' });
});

test('overdue cases are recognizable and close controls do not stretch', async ({ page }) => {
  await seedAdminSession(page);
  const urgent = { ...commandCenter.work_items[0], priority: 'critical', deadline_at: new Date(Date.now() - 7200000).toISOString() };
  await installMockBackend(page, { commandCenter: { ...commandCenter, work_items: [urgent] }, workQueue: () => ({ items: [urgent], next_cursor: null }) });
  await page.goto('/');
  await expect(page.locator('#portalApp')).toBeVisible();
  await expect(page.locator('#priorityQueue')).toContainText('Urgent review overdue');
  await expect(page.locator('#priorityQueue')).toContainText(urgent.secondary);
  await expect(page.locator('#priorityQueue')).not.toContainText(urgent.id);
  await page.locator('#priorityQueue [data-work-id]').click();
  await expect(page.locator('#drawerContent')).toContainText('Drugs');
  const close = page.getByRole('button', { name: 'Close details' });
  expect((await close.boundingBox()).height).toBeLessThanOrEqual(40);
  const space = await page.evaluate(() => {
    const facts = document.querySelector('.caseFactsGrid');
    return facts.nextElementSibling.getBoundingClientRect().top - facts.getBoundingClientRect().bottom;
  });
  expect(space).toBeGreaterThanOrEqual(20);
  await expect(page.locator('#copyCaseReference')).toContainText('Copy reference');
  await expect(page.locator('#caseDrawer')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await page.screenshot({ path: 'test-results/triage-overdue-desktop.png' });
  await close.click();
});

for (const width of [390, 900]) {
  test(`queue footer stays within the screen at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await seedAdminSession(page);
    await installMockBackend(page);
    await page.goto('/');
    await expect(page.locator('#portalApp')).toBeVisible();
    await page.locator('#mobileMenu').click();
    await page.getByRole('button', { name: 'Trust & safety', exact: true }).click();
    const pager = page.locator('[data-active-paging="moderation"]');
    await expect(pager).toBeVisible();
    const rect = await pager.boundingBox();
    expect(rect.y + rect.height).toBeLessThanOrEqual(844);
    const dimensions = await page.evaluate(() => ({ scroll: document.body.scrollWidth, width: innerWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
    await page.screenshot({ path: `test-results/triage-paged-${width}.png`, animations: 'disabled' });
  });
}
