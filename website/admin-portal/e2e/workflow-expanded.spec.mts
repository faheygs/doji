import { test, expect } from '../../coverage-fixture.mts';
import { mount } from './workflow-fixture.mts';

test('all six queues render; existing report/intake ownership stays in its own review surface', async ({
  page,
}) => {
  await mount(page);
  await expect(page.locator('.staffWorkflow tbody tr')).toHaveCount(6);
  for (const kind of ['report', 'external_intake']) {
    const row = page.locator('.staffWorkflow tr').filter({ hasText: `Synthetic ${kind}` });
    await expect(row.getByRole('button', { name: 'Manage ownership' })).toHaveCount(0);
    await row.getByRole('button', { name: 'Review request' }).click();
  }
  expect(await page.evaluate(() => window.workflowTest.reviews.map((r) => r.kind))).toEqual([
    'report',
    'external_intake',
  ]);
  expect(
    await page.evaluate(() => window.workflowTest.calls.some((c) => c.path === 'command')),
  ).toBe(false);
});

test('appeals and privacy use exact typed ownership reads, not decision or execution commands', async ({
  page,
}) => {
  await mount(page);
  for (const kind of ['appeal', 'business_privacy']) {
    const row = page.locator('.staffWorkflow tr').filter({ hasText: `Synthetic ${kind}` });
    await row.getByRole('button', { name: 'Manage ownership' }).click();
    expect(await page.evaluate(() => window.workflowTest.calls.at(-1)?.body.p_kind)).toBe(kind);
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  }
  expect(
    await page.evaluate(() => window.workflowTest.calls.some((c) => c.path === 'command')),
  ).toBe(false);
});

test('waiting filter shows waiting work and keeps assessed deadlines distinct from internal targets', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-06T00:00:00Z') });
  await mount(page);
  await expect(page.locator('.staffWorkflow')).toContainText('Assessed deadline:');
  await page.getByRole('combobox', { name: 'Work state', exact: true }).click();
  await page
    .getByRole('option', { name: 'Waiting on a response or execution', exact: true })
    .click();
  await expect(page.locator('.staffWorkflow tbody tr')).toHaveCount(1);
  await expect(page.locator('.staffWorkflow tbody')).toContainText('Synthetic business_privacy');
  expect(await page.evaluate(() => window.workflowTest.calls.at(-1)?.body)).toMatchObject({
    p_state: 'waiting',
    p_limit: 25,
  });
});

test('page summary covers every displayed queue without presenting a global total', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-08T00:00:00Z') });
  await mount(page);
  await expect(page.locator('.workflowPageSummary')).toContainText(
    'On this page: 1 past deadline or internal target · 6 unassigned · 1 waiting.',
  );
  await expect(page.locator('.workflowPageSummary')).toContainText('Not queue-wide totals.');
  await expect(page.locator('.workflowOverdue')).toContainText('Overdue assessed deadline:');
  await page.getByRole('combobox', { name: 'Queue', exact: true }).click();
  await page.getByRole('option', { name: 'Business application', exact: true }).click();
  await expect(page.locator('.workflowPageSummary')).toContainText(
    '0 past deadline or internal target · 1 unassigned · 0 waiting.',
  );
  await expect(page.locator('.tableFooter')).toContainText('1 shown');
  await expect(page.locator('.workflowPageSummary')).toBeHidden();
  await page.evaluate(() => {
    window.workflowTest.failPage = true;
    window.workflowTest.module.reconcile();
  });
  await expect(page.getByRole('status')).toContainText('Review queue unavailable');
  await expect(page.locator('.workflowPageSummary')).toBeHidden();
});

test('permission change removes revoked queues and rows rather than exposing stale protected summaries', async ({
  page,
}) => {
  await mount(page);
  await page.evaluate(() => {
    window.workflowTest.queues = ['business_application'];
    window.workflowTest.module.reconcile();
  });
  await expect(page.locator('.staffWorkflow tbody tr')).toHaveCount(1);
  await expect(page.locator('.staffWorkflow tbody')).toContainText('Northstar');
  await page.getByRole('combobox', { name: 'Queue', exact: true }).click();
  await expect(page.getByRole('option', { name: 'Moderation appeal', exact: true })).toBeDisabled();
});

test('event bursts coalesce, duplicate event IDs are ignored and lock cancels queued refresh', async ({
  page,
}) => {
  await page.clock.install();
  await mount(page);
  await expect(page.locator('.staffWorkflow tbody tr')).toHaveCount(6);
  const before = await page.evaluate(() => window.workflowTest.calls.length);
  await page.evaluate(() => {
    for (const eventId of ['event-a', 'event-a', 'event-b'])
      window.workflowTest.module.invalidate({
        type: 'staff.queue.changed',
        workKind: 'appeal',
        eventId,
      });
  });
  await page.clock.fastForward(300);
  expect(await page.evaluate(() => window.workflowTest.calls.length)).toBe(before + 1);
  await page.evaluate(() =>
    window.workflowTest.module.invalidate({
      type: 'staff.queue.changed',
      workKind: 'appeal',
      eventId: 'event-b',
    }),
  );
  await page.clock.fastForward(300);
  expect(await page.evaluate(() => window.workflowTest.calls.length)).toBe(before + 1);
  await page.evaluate(() => {
    const state = window.workflowTest;
    state.module.invalidate({
      type: 'staff.queue.changed',
      workKind: 'appeal',
      eventId: 'event-c',
    });
    state.active = false;
    state.epoch++;
    state.module.clear();
  });
  await page.clock.fastForward(300);
  expect(await page.evaluate(() => window.workflowTest.calls.length)).toBe(before + 1);
});

test('event refresh preserves an ownership confirmation draft and never submits it', async ({
  page,
}) => {
  await page.clock.install();
  await mount(page);
  await page.getByRole('button', { name: 'Manage ownership' }).first().click();
  await page.getByRole('button', { name: 'Assign to me', exact: true }).click();
  await page.evaluate(() => {
    window.workflowTest.revision++;
    window.workflowTest.module.invalidate({
      type: 'staff.queue.changed',
      workKind: 'business_application',
      eventId: 'changed',
    });
  });
  await page.clock.fastForward(300);
  await expect(page.getByRole('button', { name: 'Confirm ownership change' })).toBeVisible();
  expect(
    await page.evaluate(() => window.workflowTest.calls.filter((c) => c.path === 'command')),
  ).toHaveLength(0);
});
