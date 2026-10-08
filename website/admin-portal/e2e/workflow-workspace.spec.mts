import { test, expect } from '../../coverage-fixture.mts';
import AxeBuilder from '@axe-core/playwright';
import { mount, businessId } from './workflow-fixture.mts';
test('My work starts with server-filtered assignments and clears that filter on lock', async ({page}) => {
  await mount(page, {team:false});
  await expect(page.getByRole('button', {name:'Assigned to me', exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.queueState')).toContainText('No requests match');
  expect(await page.evaluate(()=>window.workflowTest.calls.filter(c=>c.path==='inbox').map(c=>c.body.p_filter))).toEqual(['mine']);
  await page.getByRole('button', {name:'Team work', exact:true}).click();
  await page.evaluate(()=>{window.workflowTest.module.clear();window.workflowTest.module.reconcile();});
  await expect(page.getByRole('button', {name:'Assigned to me', exact:true})).toHaveAttribute('aria-pressed','true');
});
test('overview includes real business and idea sources, shared queue control, and bounded filters', async ({
  page,
}) => {
  await mount(page);
  await expect(page.getByRole('cell', { name: 'Northstar', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'A community poll', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Queue', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Assigned to me', exact: true }).click();
  await expect(page.locator('.queueState')).toContainText('No requests match');
  expect(await page.evaluate(() => window.workflowTest.calls.at(-1)?.body)).toMatchObject({
    p_limit: 25,
    p_filter: 'mine',
  });
});
test('ownership uses confirmation, one command and current versions; source review remains separate', async ({
  page,
}) => {
  await mount(page);
  await page.getByRole('button', { name: 'Manage ownership' }).first().click();
  await page.getByRole('button', { name: 'Assign to me', exact: true }).click();
  expect(
    await page.evaluate(() => window.workflowTest.calls.filter((c) => c.path === 'command')),
  ).toHaveLength(0);
  await page.getByRole('button', { name: 'Confirm ownership change' }).click();
  await expect(page.getByRole('dialog')).toContainText('Ownership change recorded');
  const calls = await page.evaluate(() =>
    window.workflowTest.calls.filter((c) => c.path === 'command'),
  );
  expect(calls).toHaveLength(1);
  expect(calls[0]?.body).toMatchObject({
    p_revision: 0,
    p_source_version: 'source-v1',
    p_action: 'claim',
  });
  await page.getByRole('button', { name: 'Open review', exact: true }).click();
  expect(await page.evaluate(() => window.workflowTest.reviews)).toEqual([
    { kind: 'business_application', id: businessId },
  ]);
});
test('triage employee can claim without being shown assignment or decision authority', async ({
  page,
}) => {
  await mount(page, { canAssign: false, canDecide: false });
  await page.getByRole('button', { name: 'Manage ownership' }).first().click();
  await expect(page.getByRole('dialog')).toContainText('do not allow a review decision');
  await expect(page.getByRole('button', { name: 'Assign to me', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose employee' })).toHaveCount(0);
});
test('uncertain response retains identical command and retry key without automatic replay', async ({
  page,
}) => {
  await mount(page);
  await page.evaluate(() => {
    window.workflowTest.failure = 503;
  });
  await page.getByRole('button', { name: 'Manage ownership' }).first().click();
  await page.getByRole('button', { name: 'Assign to me', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm ownership change' }).click();
  await expect(page.getByRole('dialog')).toContainText('result could not be confirmed');
  await page.getByRole('button', { name: 'Retry same ownership change' }).click();
  const calls = await page.evaluate(() =>
    window.workflowTest.calls.filter((c) => c.path === 'command'),
  );
  expect(calls).toHaveLength(2);
  expect(calls[0]?.body).toEqual(calls[1]?.body);
});
test('conflict disables further action until deliberate fresh read', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => {
    window.workflowTest.failure = 409;
  });
  await page.getByRole('button', { name: 'Manage ownership' }).first().click();
  await page.getByRole('button', { name: 'Assign to me', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm ownership change' }).click();
  await expect(page.getByRole('dialog')).toContainText('not accepted');
  await expect(page.getByRole('button', { name: 'Assign to me', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh ownership' }).click();
  await expect(page.getByRole('button', { name: 'Assign to me', exact: true })).toBeVisible();
});
test('wrong case identity fails closed and unavailable queue never becomes empty success', async ({
  page,
}) => {
  await mount(page);
  await page.evaluate(() => {
    window.workflowTest.wrongIdentity = true;
  });
  await page.getByRole('button', { name: 'Manage ownership' }).first().click();
  await expect(page.getByRole('dialog')).toContainText('could not be verified');
  await expect(page.getByRole('button', { name: 'Assign to me', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(() => {
    window.workflowTest.failPage = true;
  });
  await page.getByRole('button', { name: 'Refresh review queue' }).click();
  await expect(page.getByRole('status')).toContainText('Review queue unavailable');
  await expect(page.getByRole('button', { name: 'Manage ownership' })).toHaveCount(0);
});
test('late responses cannot restore protected rows after lock', async ({ page }) => {
  await mount(page);
  await expect(page.getByRole('cell', { name: 'Northstar' })).toBeVisible();
  await page.evaluate(() => {
    const s = window.workflowTest;
    s.block = new Promise<void>((resolve) => {
      s.release = resolve;
    });
    s.module.reconcile();
  });
  await page.evaluate(() => {
    const s = window.workflowTest;
    s.active = false;
    s.epoch++;
    s.module.clear();
    s.release?.();
  });
  await expect(page.getByRole('cell', { name: 'Northstar' })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('shared employee picker prepares a separate explicit reassignment', async ({ page }) => {
  await mount(page);
  await page.getByRole('button', { name: 'Manage ownership' }).first().click();
  await page.getByRole('button', { name: 'Choose employee', exact: true }).click();
  await page.getByRole('combobox', { name: 'Assign to employee', exact: true }).click();
  await page.getByRole('option', { name: 'Synthetic employee', exact: true }).click();
  await page.getByRole('button', { name: 'Review reassignment' }).click();
  await expect(page.getByRole('dialog')).toContainText('Assign this case to Synthetic employee?');
  expect(
    await page.evaluate(() => window.workflowTest.calls.filter((c) => c.path === 'command')),
  ).toHaveLength(0);
});
test('ownership dialog works on narrow screen and exposes accessible names/status', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page);
  await page.getByRole('button', { name: 'Manage ownership' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const box = await page.getByRole('dialog').boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  const results = await new AxeBuilder({ page }).include('.staffWorkflowDialog').analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('foreground reconciliation detects newer ownership without silently applying an action', async ({
  page,
}) => {
  await mount(page);
  await page.getByRole('button', { name: 'Manage ownership' }).first().click();
  await page.evaluate(() => {
    window.workflowTest.revision++;
    window.workflowTest.module.reconcile();
  });
  await expect(page.getByRole('dialog')).toContainText('This case changed');
  await expect(page.getByRole('button', { name: 'Assign to me', exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() => window.workflowTest.calls.filter((c) => c.path === 'command')),
  ).toHaveLength(0);
});
test('passive time adds no queue polling and hidden views trigger no new read', async ({
  page,
}) => {
  await page.clock.install();
  await mount(page);
  await expect(page.getByRole('cell', { name: 'Northstar' })).toBeVisible();
  const before = await page.evaluate(() => window.workflowTest.calls.length);
  await page.clock.fastForward(300000);
  expect(await page.evaluate(() => window.workflowTest.calls.length)).toBe(before);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('[data-portal-view="inbox"]')!.hidden = true;
    window.workflowTest.module.reconcile();
  });
  expect(await page.evaluate(() => window.workflowTest.calls.length)).toBe(before);
});
test('release and reassignment never create a decision command', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => {
    window.workflowTest.owner = '98000000-0000-4000-8000-000000000001';
  });
  await page.getByRole('button', { name: 'Manage ownership' }).first().click();
  await page.getByRole('button', { name: 'Release ownership', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm ownership change' }).click();
  await expect(page.getByRole('dialog')).toContainText('Owner: Unassigned');
  expect(
    await page.evaluate(() =>
      window.workflowTest.calls.filter((c) => c.path === 'command').map((c) => c.body.p_action),
    ),
  ).toEqual(['release']);
});
test('opening a case does not discard keyboard focus when it closes', async ({ page }) => {
  await mount(page);
  const trigger = page.getByRole('button', { name: 'Manage ownership' }).first();
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
for (const path of ['ownership', 'assignees', 'command'] as const) {
  test(`case clears protected details when ${path} access is revoked`, async ({ page }) => {
    await mount(page);
    await page.evaluate(() => {
      window.workflowTest.owner = '98000000-0000-4000-8000-000000000001';
    });
    await page.getByRole('button', { name: 'Manage ownership' }).first().click();
    await expect(page.getByRole('dialog')).toContainText('Owner: Synthetic employee');
    await page.evaluate((path) => {
      window.workflowTest.denial = { path, status: 403 };
    }, path);
    if (path === 'ownership')
      await page.getByRole('button', { name: 'Refresh ownership', exact: true }).click();
    if (path === 'assignees')
      await page.getByRole('button', { name: 'Choose employee', exact: true }).click();
    if (path === 'command') {
      await page.getByRole('button', { name: 'Release ownership', exact: true }).click();
      await page.getByRole('button', { name: 'Confirm ownership change', exact: true }).click();
    }
    await expect(page.getByRole('dialog')).not.toContainText('Owner: Synthetic employee');
    await expect(page.getByRole('button', { name: 'Open review', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Release ownership', exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('button', { name: 'Retry same ownership change', exact: true }),
    ).toHaveCount(0);
  });
}

test('queue access denial clears rows and an open case without replaying writes', async ({
  page,
}) => {
  await mount(page);
  await page.getByRole('button', { name: 'Manage ownership' }).first().click();
  await page.evaluate(() => {
    window.workflowTest.denial = { path: 'inbox', status: 403 };
    window.workflowTest.module.reconcile();
  });
  await expect(page.locator('.staffWorkflow tbody')).toBeEmpty();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    await page.evaluate(() => window.workflowTest.calls.filter((c) => c.path === 'command')),
  ).toHaveLength(0);
});

test('queue and dialog render in dark theme without accessibility violations', async ({
  page,
}, info) => {
  await mount(page);
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await expect(page.getByRole('cell', { name: 'Northstar' })).toBeVisible();
  const queue = await new AxeBuilder({ page }).include('.staffWorkflow').analyze();
  expect(queue.violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('workflow-dark.png'), fullPage: true });
  await page.getByRole('button', { name: 'Manage ownership' }).first().click();
  await page.screenshot({ path: info.outputPath('workflow-ownership.png'), fullPage: true });
  const dialog = await new AxeBuilder({ page }).include('.staffWorkflowDialog').analyze();
  expect(dialog.violations).toEqual([]);
});
