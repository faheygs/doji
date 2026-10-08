import { test, expect } from '../../coverage-fixture.mts';
import { mount } from './workflow-fixture.mts';

for (const area of ['businesses', 'suggestions', 'moderation', 'safety']) {
  test(`${area} retains its own content without a combined queue or background inbox reads`, async ({
    page,
  }) => {
    await page.clock.install();
    await mount(page);
    await expect(page.locator('.staffWorkflow tbody tr')).toHaveCount(6);
    const before = await page.evaluate(() => window.workflowTest.calls.length);
    await page.evaluate((area) => {
      document.querySelector<HTMLElement>('[data-portal-view="inbox"]')!.hidden = true;
      const section = document.querySelector<HTMLElement>('[data-portal-view="other"]')!;
      section.dataset.portalView = area;
      section.hidden = false;
      section.textContent = 'Area-specific content';
      window.workflowTest.module.reconcile();
      window.workflowTest.module.invalidate({
        type: 'staff.queue.changed',
        workKind: 'business_application',
        eventId: 'area-hint',
      });
    }, area);
    await page.clock.fastForward(300);
    await expect(page.getByText('Area-specific content')).toBeVisible();
    await expect(page.locator('.staffWorkflow')).toBeHidden();
    await expect(page.locator(`[data-portal-view="${area}"] .staffWorkflow`)).toHaveCount(0);
    expect(await page.evaluate(() => window.workflowTest.calls.length)).toBe(before);
    await page.evaluate((area) => {
      document.querySelector<HTMLElement>(`[data-portal-view="${area}"]`)!.hidden = true;
      document.querySelector<HTMLElement>('[data-portal-view="inbox"]')!.hidden = false;
      window.workflowTest.module.reconcile();
    }, area);
    await expect(page.locator('[data-portal-view="inbox"] .staffWorkflow')).toBeVisible();
    await expect(page.locator('.staffWorkflow tbody tr')).toHaveCount(6);
    await page.getByRole('button', { name: 'Manage ownership' }).first().click();
    await expect(page.getByRole('button', { name: 'Assign to me', exact: true })).toBeVisible();
  });
}

test('leaving the combined queue fences late reads and coalesced refreshes; returning starts a fresh read', async ({
  page,
}) => {
  await mount(page);
  await expect(page.locator('.staffWorkflow tbody tr')).toHaveCount(6);
  const before = await page.evaluate(() => window.workflowTest.calls.length);
  await page.evaluate(() => {
    const s = window.workflowTest;
    s.block = new Promise<void>((resolve) => {
      s.release = resolve;
    });
    s.module.reconcile();
    s.module.reconcile();
    document.querySelector<HTMLElement>('[data-portal-view="inbox"]')!.hidden = true;
    s.module.reconcile();
    s.release?.();
    s.block = undefined;
  });
  await expect(page.locator('.staffWorkflow tbody')).toBeEmpty();
  expect(await page.evaluate(() => window.workflowTest.calls.length)).toBe(before + 1);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('[data-portal-view="inbox"]')!.hidden = false;
    window.workflowTest.module.reconcile();
  });
  await expect(page.locator('.staffWorkflow tbody tr')).toHaveCount(6);
  expect(await page.evaluate(() => window.workflowTest.calls.length)).toBe(before + 2);
});
