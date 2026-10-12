import { test, expect } from '../../coverage-fixture.mts';
import { mount, businessId, actorId } from './workflow-fixture.mts';

test('queue paging preserves server cursors and resets them when ownership changes', async ({ page }) => {
  await mount(page);
  await page.evaluate(async ({ businessId, actorId }) => {
    const state = window.workflowTest;
    state.module.destroy();
    state.calls = [];
    const { createWorkflowWorkspace } = await import('/admin-portal/workflow-workspace.js' as string) as typeof import('../workflow-workspace.mts');
    state.module = createWorkflowWorkspace({
      epoch: () => state.epoch, active: () => state.active, actor: () => actorId,
      review: async () => { throw Error('Synthetic review unavailable'); },
      enhance: () => {},
      request: async (path, body) => {
        state.calls.push({ path, body });
        const row = {
          id: businessId, kind: 'business_application', key: `business_application:${businessId}`,
          subject: body.p_after_key ? 'Second page business' : 'First page business',
          at: '2026-10-05T01:00:00Z', work_state: 'ready', due_at: null,
          ownership_model: 'staff_workflow', assigned_to: actorId,
        };
        return { scope: 'staff_inbox_v1', order: 'oldest_first', items: [row],
          authorized_queues: ['business_application'],
          next_cursor: body.p_after_key ? null : { at: row.at, key: row.key } };
      },
    });
    // The queue must also mount when the host view has no optional intro.
    document.querySelector('[data-portal-view="inbox"] .viewIntro')?.remove();
    state.module.reconcile();
  }, { businessId, actorId });
  await expect(page.getByRole('cell', { name: 'First page business' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Second page business' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.workflowTest.calls.at(-1)?.body)).toMatchObject({
    p_after_at: '2026-10-05T01:00:00Z', p_after_key: `business_application:${businessId}`, p_limit: 25,
  });
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'First page business' })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Second page business' })).toBeVisible();
  await page.getByRole('button', { name: 'Unassigned', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'First page business' })).toBeVisible();
  expect(await page.evaluate(() => window.workflowTest.calls.at(-1)?.body)).toMatchObject({
    p_after_at: null, p_after_key: null, p_filter: 'unassigned',
  });
  await page.getByRole('button', { name: 'Review request', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Review could not be opened');
  expect(await page.evaluate(() => window.workflowTest.calls.every(call => call.path === 'inbox'))).toBe(true);
});

test('empty authorization is explicit, and inactive reconciliation clears protected state', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => {
    window.workflowTest.queues = [];
    window.workflowTest.module.reconcile();
  });
  await expect(page.getByRole('status')).toContainText('permissions do not include any review queues');
  await expect(page.locator('.staffWorkflow tbody tr')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Review request', exact: true })).toHaveCount(0);
  const count = await page.evaluate(() => window.workflowTest.calls.length);
  await page.evaluate(() => {
    window.workflowTest.active = false;
    window.workflowTest.module.reconcile();
  });
  await expect(page.locator('.staffWorkflow')).toBeHidden();
  await expect(page.locator('.staffWorkflow tbody')).toBeEmpty();
  expect(await page.evaluate(() => window.workflowTest.calls.length)).toBe(count);
});

for (const status of ['resolved', 'no_violation', '']) {
  test(`closed rows show their outcome without overdue styling or ownership actions: ${status || 'unspecified'}`, async ({ page }) => {
    await mount(page);
    await page.evaluate(async ({ businessId, status }) => {
      window.workflowTest.module.destroy();
      const { workflowRow } = await import('/admin-portal/workflow-view.js' as string) as typeof import('../workflow-view.mts');
      const table = document.createElement('table');
      const body = document.createElement('tbody');
      const row = workflowRow({
        id: businessId, kind: 'appeal', key: `appeal:${businessId}`, subject: 'Closed appeal',
        at: '2026-10-01T00:00:00Z', assigned_to: null, work_state: 'closed', status,
        origin: 'in_app', due_at: '2026-10-02T00:00:00Z', ownership_model: 'staff_workflow',
      }, '', () => { throw Error('Closed case cannot be assigned'); }, ref => { window.workflowTest.reviews.push(ref); });
      body.append(row); table.append(body); document.querySelector('main')!.append(table);
    }, { businessId, status });
    await expect(page.getByRole('row', { name: 'Review Closed appeal' })).toContainText(`Closed · ${status.replaceAll('_', ' ') || 'Completed'}`);
    await expect(page.locator('.workflowOverdue')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Manage ownership' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Review request' }).click();
    expect(await page.evaluate(() => window.workflowTest.reviews.map(({ kind, id }) => ({ kind, id })))).toEqual([{ kind: 'appeal', id: businessId }]);
  });
}
