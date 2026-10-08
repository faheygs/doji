import { test, expect } from '../../coverage-fixture.mts';
import { mount } from './workflow-fixture.mts';
async function navigate(page: import('@playwright/test').Page, area: string) {
  await page.evaluate(area => {
    document.querySelectorAll<HTMLElement>('[data-portal-view]').forEach(el => { el.hidden = el.dataset.portalView !== area; });
    window.workflowTest.module.reconcile();
  }, area);
}
test('one safety table merges sources, supports keyboard review, closed history and mine reset', async ({ page }) => {
  await mount(page, { safety: true });
  await navigate(page, 'moderation');
  const root = page.locator('.staffWorkflow');
  await expect(root.getByRole('heading', { name: 'Trust & safety cases' })).toBeVisible();
  await expect(root.locator('tbody tr')).toHaveCount(3);
  await expect(page.locator('[data-portal-view="moderation"] > .queuePanel')).toBeHidden();
  await expect(page.locator('[data-portal-view="moderation"] > .queueSummaryStrip')).toBeHidden();
  await expect(root.getByText('External removal request · External', { exact: true })).toBeVisible();
  await root.locator('tr[aria-label="Review Synthetic external_intake"]').press('Enter');
  await expect.poll(() => page.evaluate(() => window.workflowTest.reviews.at(-1)?.kind)).toBe('external_intake');
  await root.getByRole('button', { name: 'Show closed', exact: true }).click();
  await expect(root.getByText('Closed · resolved', { exact: true })).toHaveCount(3);
  await expect(root.getByRole('button', { name: 'Manage ownership' })).toHaveCount(0);
  await navigate(page, 'safety');
  await expect.poll(() => page.evaluate(() => window.workflowTest.calls.at(-1)?.body.p_queue)).toBe('restricted_safety');
  await expect(root.getByRole('button', { name: 'Show closed', exact: true })).toBeVisible();
  await navigate(page, 'inbox');
  await expect(root.getByRole('button', { name: 'Assigned to me' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.workflowTest.calls.at(-1)?.body.p_filter)).toBe('mine');
});
test('restricted denial clears rows and never falls back to another queue', async ({ page }) => {
  await mount(page, { safety: true });
  await navigate(page, 'moderation');
  await expect(page.locator('.staffWorkflow tbody tr')).toHaveCount(3);
  await page.evaluate(() => { window.workflowTest.denial = { path: 'safety', status: 403 }; });
  await navigate(page, 'safety');
  await expect(page.getByText('Review queue unavailable. Refresh before opening a case.', { exact: true })).toBeVisible();
  await expect(page.locator('.staffWorkflow tbody tr')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.workflowTest.calls.at(-1)?.body.p_queue)).toBe('restricted_safety');
});
test('switching areas fences a late ordinary-queue response', async ({ page }) => {
  await mount(page, { safety: true });
  await page.evaluate(() => { window.workflowTest.block = new Promise(resolve => { window.workflowTest.release = resolve; }); });
  await navigate(page, 'moderation');
  await navigate(page, 'inbox');
  await page.evaluate(() => { window.workflowTest.release?.(); window.workflowTest.block = undefined; });
  await expect(page.locator('.staffWorkflow').getByRole('heading', { name: 'My work' })).toBeVisible();
  await expect(page.locator('.staffWorkflow tbody tr[tabindex]')).toHaveCount(0);
});
