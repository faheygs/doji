import { expect, test } from '@playwright/test';
import { installSafetyFixture, safetyId } from './safety-fixture';
const root = 'https://admin.dojipro.com/connected.html#/trust-safety';

test('closed safety uses one server queue and preserves its state when opening and returning', async ({
  page,
  request,
}) => {
  const f = await installSafetyFixture(page, request);
  const reads: Record<string, unknown>[] = [];
  await page.route('**/api/rpc', (route) => {
    const { name, args } = route.request().postDataJSON() as {
      name: string;
      args: Record<string, unknown>;
    };
    if (name !== 'get_admin_safety_work_page_v1') return route.fallback();
    reads.push(args);
    return route.fulfill({
      json: {
        scope: 'staff_safety_v1',
        queue: args.p_queue,
        closed: args.p_closed,
        order: 'oldest_first',
        authorized_queues: ['external_intake'],
        next_cursor: null,
        items: [
          {
            id: safetyId,
            kind: 'external_intake',
            key: 'external_intake:' + safetyId,
            subject: args.p_closed ? 'Closed synthetic request' : 'Open synthetic request',
            at: '2026-10-08T12:00:00Z',
            due_at: null,
            assigned_to: null,
            work_state: args.p_closed ? 'closed' : 'ready',
            status: args.p_closed ? 'not_actionable' : 'received',
            origin: 'external',
            ownership_model: 'existing_intake',
          },
        ],
      },
    });
  });
  await page.goto(root);
  await page.getByRole('combobox', { name: 'Case status' }).click();
  await page.getByRole('option', { name: 'Closed cases' }).click();
  await expect(page.getByRole('link', { name: 'Closed synthetic request' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open synthetic request' })).toHaveCount(0);
  f.item.state = 'not_actionable';
  await page.getByRole('link', { name: 'Closed synthetic request' }).click();
  await page.getByRole('link', { name: 'Back to queue' }).click();
  await expect(page.getByRole('combobox', { name: 'Case status' })).toHaveText('Closed cases');
  await expect(page.getByRole('link', { name: 'Closed synthetic request' })).toBeVisible();
  expect(reads.at(-1)).toMatchObject({ p_closed: true, p_after_at: null, p_after_key: null });
  expect(f.commands).toHaveLength(0);
});

test('personal queue cannot be converted to closed or all employees through the URL', async ({
  page,
  request,
}) => {
  const f = await installSafetyFixture(page, request);
  await page.goto('https://admin.dojipro.com/connected.html#/my-work?closed=1');
  await expect(page.getByRole('link', { name: 'Synthetic removal request' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Case status' })).toHaveCount(0);
  expect(f.commands).toHaveLength(0);
});
